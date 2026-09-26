-- Derives typed tables from raw events. Called by the ingest API inside the insert transaction
-- with the ids it just inserted; safe to call again for the same ids (reprocessing history).
-- Local dates are Europe/Skopje; timestamps stay UTC.

CREATE FUNCTION public.local_date(ts timestamptz) RETURNS date
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$ SELECT (ts AT TIME ZONE 'Europe/Skopje')::date $$;
--> statement-breakpoint

-- Rebuilds daily_summary rows for the given local dates from the typed tables.
CREATE FUNCTION public.refresh_daily_summary(dates date[]) RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.daily_summary AS s
    (date, screen_time_min, unlocks, first_unlock_at, last_unlock_at, mood, energy, focus, updated_at)
  SELECT
    d.date,
    (SELECT round(sum(a.foreground_ms) / 60000.0)::int FROM public.app_usage a WHERE a.date = d.date),
    (SELECT count(*)::int FROM public.unlocks u WHERE public.local_date(u.occurred_at) = d.date),
    (SELECT min(u.occurred_at) FROM public.unlocks u WHERE public.local_date(u.occurred_at) = d.date),
    (SELECT max(u.occurred_at) FROM public.unlocks u WHERE public.local_date(u.occurred_at) = d.date),
    c.mood, c.energy, c.focus,
    now()
  FROM (SELECT DISTINCT unnest(dates) AS date) d
  LEFT JOIN public.checkins c ON c.date = d.date
  ON CONFLICT (date) DO UPDATE SET
    screen_time_min = excluded.screen_time_min,
    unlocks = excluded.unlocks,
    first_unlock_at = excluded.first_unlock_at,
    last_unlock_at = excluded.last_unlock_at,
    mood = excluded.mood,
    energy = excluded.energy,
    focus = excluded.focus,
    updated_at = excluded.updated_at;
$$;
--> statement-breakpoint

CREATE FUNCTION public.process_events(event_ids uuid[]) RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  affected_dates date[];
BEGIN
  -- unlock → unlocks
  INSERT INTO public.unlocks (event_id, occurred_at)
  SELECT e.id, e.occurred_at
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'unlock'
  ON CONFLICT (event_id) DO NOTHING;

  -- app_usage → app_usage: recompute each touched (date, package) from all its events, so
  -- reprocessing never double counts. Windows are 30 min aligned to UTC and Skopje offsets are
  -- whole hours, so a window never spans local midnight.
  WITH touched AS (
    SELECT DISTINCT public.local_date(e.occurred_at) AS date, e.payload ->> 'package' AS package
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type = 'app_usage'
  ),
  totals AS (
    SELECT
      t.date,
      t.package,
      (array_agg(e.payload ->> 'app_label' ORDER BY e.occurred_at DESC))[1] AS app_label,
      (array_agg(e.payload ->> 'category' ORDER BY e.occurred_at DESC))[1] AS category,
      sum((e.payload ->> 'foreground_ms')::bigint) AS foreground_ms,
      sum((e.payload ->> 'launches')::int)::int AS launches
    FROM touched t
    JOIN public.events e
      ON e.type = 'app_usage'
     AND public.local_date(e.occurred_at) = t.date
     AND e.payload ->> 'package' = t.package
    GROUP BY t.date, t.package
  )
  INSERT INTO public.app_usage (date, package, app_label, category, foreground_ms, launches)
  SELECT date, package, app_label, category, foreground_ms, launches FROM totals
  ON CONFLICT (date, package) DO UPDATE SET
    app_label = excluded.app_label,
    category = excluded.category,
    foreground_ms = excluded.foreground_ms,
    launches = excluded.launches;

  -- checkin → checkins: the latest submission per date wins, including across batches.
  INSERT INTO public.checkins AS c (date, mood, energy, focus, tags, note, event_id, submitted_at)
  SELECT DISTINCT ON ((e.payload ->> 'date')::date)
    (e.payload ->> 'date')::date,
    (e.payload ->> 'mood')::smallint,
    (e.payload ->> 'energy')::smallint,
    (e.payload ->> 'focus')::smallint,
    ARRAY(SELECT jsonb_array_elements_text(e.payload -> 'tags')),
    e.payload ->> 'note',
    e.id,
    e.occurred_at
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'checkin'
  ORDER BY (e.payload ->> 'date')::date, e.occurred_at DESC, e.id DESC
  ON CONFLICT (date) DO UPDATE SET
    mood = excluded.mood,
    energy = excluded.energy,
    focus = excluded.focus,
    tags = excluded.tags,
    note = excluded.note,
    event_id = excluded.event_id,
    submitted_at = excluded.submitted_at
  WHERE excluded.submitted_at >= c.submitted_at;

  -- heartbeat → source_health.details / last_error, only from the newest heartbeat seen.
  UPDATE public.source_health h
  SET
    details = hb.payload,
    last_error = nullif(concat_ws('; ',
      CASE WHEN (hb.payload ->> 'collection_paused')::boolean THEN 'collection paused' END,
      CASE WHEN NOT (hb.payload ->> 'usage_access_granted')::boolean THEN 'usage access not granted' END,
      CASE WHEN NOT (hb.payload ->> 'battery_optimization_ignored')::boolean THEN 'battery optimisation is on' END
    ), ''),
    updated_at = now()
  FROM (
    SELECT e.payload, e.occurred_at
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type = 'heartbeat'
    ORDER BY e.occurred_at DESC
    LIMIT 1
  ) hb
  WHERE h.source = 'heartbeat' AND hb.occurred_at >= h.last_event_at;

  -- Rebuild daily_summary for every local date these events touch.
  SELECT array_agg(DISTINCT d) INTO affected_dates
  FROM (
    SELECT CASE WHEN e.type = 'checkin' THEN (e.payload ->> 'date')::date
                ELSE public.local_date(e.occurred_at) END AS d
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type IN ('unlock', 'app_usage', 'checkin')
  ) x;
  IF affected_dates IS NOT NULL THEN
    PERFORM public.refresh_daily_summary(affected_dates);
  END IF;

  UPDATE public.events SET processed_at = now() WHERE id = ANY (event_ids);
END;
$$;
--> statement-breakpoint

-- Server code only: functions are executable by PUBLIC by default.
REVOKE ALL ON FUNCTION public.local_date(timestamptz) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.refresh_daily_summary(date[]) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.process_events(uuid[]) FROM PUBLIC, anon, authenticated;
