-- Sleep estimate (per local wake-up date), nightly rebuild and weekly retention via pg_cron.

-- Night ending on local date p_date: window from 21:00 the evening before to 14:00 that day.
-- A night-time "blip" (quick check 00:00-05:00) is ignored, see the pts CTE.
-- Wake = the unlock that ends the longest quiet stretch (>= 3 h without unlocks, closed by an
-- unlock). Start = first screen-off after the unlock that began the stretch (the end of the last
-- phone session), or that unlock itself when screen events are missing.
CREATE FUNCTION public.compute_sleep(p_date date) RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  w_start timestamptz := ((p_date - 1)::timestamp + time '21:00') AT TIME ZONE 'Europe/Skopje';
  w_end timestamptz := (p_date::timestamp + time '14:00') AT TIME ZONE 'Europe/Skopje';
  g_start timestamptz;
  g_end timestamptz;
  s_start timestamptz;
  screen_off timestamptz;
  minutes int;
  still_min int;
  charged boolean;
  conf real;
BEGIN
  IF EXISTS (SELECT 1 FROM public.sleep_estimates WHERE date = p_date AND corrected) THEN
    RETURN; -- the owner's correction wins
  END IF;

  WITH raw AS (
    SELECT u.occurred_at AS at FROM public.unlocks u
    WHERE u.occurred_at >= w_start - interval '3 hours' AND u.occurred_at <= w_end
  ),
  pts AS (
    -- A quick check in the middle of the night (00:00-05:00, screen off again within 10 min,
    -- no other unlock within 30 min) doesn't end the night.
    SELECT r.at FROM raw r
    WHERE NOT (
      extract(hour FROM r.at AT TIME ZONE 'Europe/Skopje') < 5
      AND EXISTS (
        SELECT 1 FROM public.screen_events s
        WHERE s.state = 'off' AND s.occurred_at > r.at AND s.occurred_at <= r.at + interval '10 minutes'
      )
      AND NOT EXISTS (
        SELECT 1 FROM raw r2
        WHERE r2.at <> r.at AND r2.at BETWEEN r.at - interval '30 minutes' AND r.at + interval '30 minutes'
      )
    )
  ),
  gaps AS (
    SELECT at AS gap_start, lead(at) OVER (ORDER BY at) AS gap_end FROM pts
  )
  SELECT gap_start, gap_end INTO g_start, g_end
  FROM gaps
  WHERE gap_end IS NOT NULL
    AND gap_end > w_start
    AND gap_end - gap_start >= interval '3 hours'
    AND gap_end - gap_start <= interval '16 hours'
  ORDER BY gap_end - gap_start DESC
  LIMIT 1;

  IF g_start IS NULL THEN
    DELETE FROM public.sleep_estimates WHERE date = p_date AND NOT corrected;
    RETURN;
  END IF;

  SELECT min(s.occurred_at) INTO screen_off
  FROM public.screen_events s
  WHERE s.state = 'off' AND s.occurred_at > g_start AND s.occurred_at < g_end;

  s_start := greatest(coalesce(screen_off, g_start), w_start - interval '3 hours');
  minutes := floor(extract(epoch FROM g_end - s_start) / 60)::int;

  SELECT coalesce(sum(public.minutes_between(greatest(a.started_at, s_start), least(coalesce(a.ended_at, g_end), g_end))), 0)
  INTO still_min
  FROM public.activity_segments a
  WHERE a.kind = 'still' AND a.started_at < g_end AND coalesce(a.ended_at, g_end) > s_start;

  SELECT EXISTS (
    SELECT 1 FROM public.events e
    WHERE e.type = 'heartbeat' AND e.occurred_at BETWEEN s_start AND g_end
      AND (e.payload ->> 'charging')::boolean
  ) INTO charged;

  conf := 0.5
    + CASE WHEN screen_off IS NOT NULL THEN 0.15 ELSE 0 END
    + CASE WHEN minutes BETWEEN 300 AND 660 THEN 0.15 ELSE 0 END
    + CASE WHEN still_min >= 0.7 * minutes THEN 0.1 ELSE 0 END
    + CASE WHEN charged THEN 0.1 ELSE 0 END;

  INSERT INTO public.sleep_estimates (date, sleep_start, wake_at, duration_min, confidence, corrected, computed_at)
  VALUES (p_date, s_start, g_end, minutes, round(least(conf, 1.0)::numeric, 2), false, now())
  ON CONFLICT (date) DO UPDATE SET
    sleep_start = excluded.sleep_start,
    wake_at = excluded.wake_at,
    duration_min = excluded.duration_min,
    confidence = excluded.confidence,
    computed_at = excluded.computed_at
  WHERE NOT public.sleep_estimates.corrected;
END;
$$;
--> statement-breakpoint

CREATE FUNCTION public.minutes_between(a timestamptz, b timestamptz) RETURNS integer
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path = ''
AS $$ SELECT greatest(0, floor(extract(epoch FROM (b - a)) / 60))::int $$;
--> statement-breakpoint

-- Recompute sleep for the nights a batch can affect, then the summaries of those days.
CREATE FUNCTION public.refresh_sleep(dates date[]) RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  d date;
BEGIN
  FOREACH d IN ARRAY dates LOOP
    PERFORM public.compute_sleep(d);
  END LOOP;
  PERFORM public.refresh_daily_summary(dates);
END;
$$;
--> statement-breakpoint

-- Nightly: late data and "now"-dependent values (open visits) settle for the last 3 days.
CREATE FUNCTION public.nightly_rebuild() RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  SELECT public.refresh_sleep(ARRAY(
    SELECT generate_series(public.local_date(now()) - 2, public.local_date(now()), interval '1 day')::date
  ));
$$;
--> statement-breakpoint

-- Weekly: raw events older than 90 days are deleted once processed; derived tables are kept.
CREATE FUNCTION public.prune_events() RETURNS integer
LANGUAGE sql
SET search_path = ''
AS $$
  WITH d AS (
    DELETE FROM public.events
    WHERE processed_at IS NOT NULL AND occurred_at < now() - interval '90 days'
    RETURNING 1
  )
  SELECT count(*)::int FROM d;
$$;
--> statement-breakpoint

-- process_events now also refreshes sleep for the nights a batch touches.
CREATE OR REPLACE FUNCTION public.process_events(event_ids uuid[]) RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
  affected_dates date[];
  activity_since timestamptz;
  place record;
BEGIN
  -- unlock → unlocks
  INSERT INTO public.unlocks (event_id, occurred_at)
  SELECT e.id, e.occurred_at FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'unlock'
  ON CONFLICT (event_id) DO NOTHING;

  -- app_usage → app_usage, recomputed per touched (date, package).
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

  -- checkin → checkins (latest submission per date wins).
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
    mood = excluded.mood, energy = excluded.energy, focus = excluded.focus,
    tags = excluded.tags, note = excluded.note,
    event_id = excluded.event_id, submitted_at = excluded.submitted_at
  WHERE excluded.submitted_at >= c.submitted_at;

  -- heartbeat → source_health details and warnings (newest heartbeat only).
  UPDATE public.source_health h
  SET
    details = hb.payload,
    last_error = nullif(concat_ws('; ',
      CASE WHEN (hb.payload ->> 'collection_paused')::boolean THEN 'collection paused' END,
      CASE WHEN NOT (hb.payload ->> 'usage_access_granted')::boolean THEN 'usage access not granted' END,
      CASE WHEN NOT (hb.payload ->> 'battery_optimization_ignored')::boolean THEN 'battery optimisation is on' END,
      CASE WHEN (hb.payload ->> 'health_connect_granted')::boolean IS FALSE THEN 'Health Connect not allowed' END,
      CASE WHEN (hb.payload ->> 'activity_recognition_granted')::boolean IS FALSE THEN 'activity recognition not allowed' END,
      CASE WHEN (hb.payload ->> 'background_location_granted')::boolean IS FALSE THEN 'background location not allowed' END
    ), ''),
    updated_at = now()
  FROM (
    SELECT e.payload, e.occurred_at FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type = 'heartbeat'
    ORDER BY e.occurred_at DESC LIMIT 1
  ) hb
  WHERE h.source = 'heartbeat' AND hb.occurred_at >= h.last_event_at;

  -- steps → steps_hourly. Health Connect fills hours in late, so the larger value wins.
  INSERT INTO public.steps_hourly AS s (hour, steps, distance_m)
  SELECT DISTINCT ON (e.occurred_at)
    e.occurred_at, (e.payload ->> 'steps')::int, (e.payload ->> 'distance_m')::int
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'steps'
  ORDER BY e.occurred_at, (e.payload ->> 'steps')::int DESC
  ON CONFLICT (hour) DO UPDATE SET
    steps = greatest(s.steps, excluded.steps),
    distance_m = greatest(s.distance_m, excluded.distance_m);

  -- screen → screen_events; stay → location_stays
  INSERT INTO public.screen_events (event_id, occurred_at, state)
  SELECT e.id, e.occurred_at, e.payload ->> 'state' FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'screen'
  ON CONFLICT (event_id) DO NOTHING;

  INSERT INTO public.location_stays (event_id, arrived_at, left_at, lat, lng)
  SELECT e.id, e.occurred_at, e.ended_at, (e.payload ->> 'lat')::float8, (e.payload ->> 'lng')::float8
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'stay'
  ON CONFLICT (event_id) DO NOTHING;

  -- activity → activity_segments, rebuilt from a day before the earliest new transition.
  -- A segment starts at an "enter" and ends at the next transition of any kind.
  SELECT min(e.occurred_at) - interval '1 day' INTO activity_since
  FROM public.events e WHERE e.id = ANY (event_ids) AND e.type = 'activity';
  IF activity_since IS NOT NULL THEN
    DELETE FROM public.activity_segments WHERE started_at >= activity_since;
    INSERT INTO public.activity_segments (started_at, ended_at, kind)
    SELECT occurred_at, next_at, kind FROM (
      SELECT e.occurred_at,
             e.payload ->> 'activity' AS kind,
             e.payload ->> 'transition' AS tr,
             lead(e.occurred_at) OVER (ORDER BY e.occurred_at, e.id) AS next_at
      FROM public.events e
      WHERE e.type = 'activity' AND e.occurred_at >= activity_since
    ) t
    WHERE tr = 'enter'
    ON CONFLICT (started_at) DO NOTHING;
  END IF;

  -- geofence → visits, per touched place.
  FOR place IN
    SELECT (e.payload ->> 'place_id')::uuid AS id, min(e.occurred_at) AS since
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type = 'geofence'
    GROUP BY 1
  LOOP
    PERFORM public.rebuild_visits(place.id, place.since);
  END LOOP;

  -- Days whose summary changes, plus nights whose sleep estimate may change. A night ending on
  -- date D looks at 18:00 on D-1 to 14:00 on D (local).
  SELECT array_agg(DISTINCT d) INTO affected_dates
  FROM (
    SELECT CASE WHEN e.type = 'checkin' THEN (e.payload ->> 'date')::date
                ELSE public.local_date(e.occurred_at) END AS d
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type IN ('unlock', 'app_usage', 'checkin', 'steps', 'geofence', 'stay')
    UNION
    -- visits and stays can span midnight; a geofence exit also changes the arrival day
    SELECT public.local_date(e.occurred_at) - 1
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type = 'geofence'
    UNION
    SELECT public.local_date(e.ended_at)
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type = 'stay'
    UNION
    SELECT public.local_date(e.occurred_at) + CASE
             WHEN extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Skopje') >= 18 THEN 1 ELSE 0 END
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type IN ('unlock', 'screen', 'activity', 'heartbeat')
      AND (extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Skopje') >= 18
        OR extract(hour FROM e.occurred_at AT TIME ZONE 'Europe/Skopje') < 14)
  ) x;
  IF affected_dates IS NOT NULL THEN
    PERFORM public.refresh_sleep(affected_dates); -- also refreshes daily_summary for these dates
  END IF;

  UPDATE public.events SET processed_at = now() WHERE id = ANY (event_ids);
END;
$$;
--> statement-breakpoint

REVOKE ALL ON FUNCTION public.process_events(uuid[]) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.compute_sleep(date) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.minutes_between(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.refresh_sleep(date[]) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.nightly_rebuild() FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.prune_events() FROM PUBLIC, anon, authenticated;--> statement-breakpoint

-- pg_cron runs in UTC: 01:00 UTC is 03:00 local in summer and 02:00 in winter.
CREATE EXTENSION IF NOT EXISTS pg_cron;--> statement-breakpoint
SELECT cron.schedule('lifelog-nightly-rebuild', '0 1 * * *', 'SELECT public.nightly_rebuild()');--> statement-breakpoint
SELECT cron.schedule('lifelog-weekly-prune', '30 1 * * 0', 'SELECT public.prune_events()');
