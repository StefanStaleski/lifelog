-- Notification counts: processing and the daily_summary.notifications column.

CREATE OR REPLACE FUNCTION public.refresh_daily_summary(dates date[]) RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.daily_summary AS s (
    date, screen_time_min, unlocks, first_unlock_at, last_unlock_at, mood, energy, focus,
    steps, distance_m, sleep_min, sleep_confidence, home_min, work_min, gym_min, other_places_min,
    notifications, updated_at
  )
  SELECT
    d.date,
    (SELECT round(sum(a.foreground_ms) / 60000.0)::int FROM public.app_usage a WHERE a.date = d.date),
    (SELECT count(*)::int FROM public.unlocks u WHERE public.local_date(u.occurred_at) = d.date),
    (SELECT min(u.occurred_at) FROM public.unlocks u WHERE public.local_date(u.occurred_at) = d.date),
    (SELECT max(u.occurred_at) FROM public.unlocks u WHERE public.local_date(u.occurred_at) = d.date),
    c.mood, c.energy, c.focus,
    (SELECT sum(h.steps)::int FROM public.steps_hourly h WHERE public.local_date(h.hour) = d.date),
    (SELECT sum(h.distance_m)::int FROM public.steps_hourly h WHERE public.local_date(h.hour) = d.date),
    se.duration_min,
    se.confidence,
    pm.home, pm.work, pm.gym,
    nullif(coalesce(pm.other, 0) + coalesce(st.minutes, 0), 0),
    (SELECT sum(n.count)::int FROM public.notifications_hourly n WHERE public.local_date(n.hour) = d.date),
    now()
  FROM (SELECT DISTINCT unnest(dates) AS date) d
  LEFT JOIN public.checkins c ON c.date = d.date
  LEFT JOIN public.sleep_estimates se ON se.date = d.date
  LEFT JOIN LATERAL (
    SELECT
      nullif(sum(m) FILTER (WHERE p.kind = 'home'), 0)::int AS home,
      nullif(sum(m) FILTER (WHERE p.kind = 'work'), 0)::int AS work,
      nullif(sum(m) FILTER (WHERE p.kind = 'gym'), 0)::int AS gym,
      nullif(sum(m) FILTER (WHERE p.kind = 'other'), 0)::int AS other
    FROM public.visits v
    JOIN public.places p ON p.id = v.place_id
    CROSS JOIN LATERAL (
      SELECT public.minutes_on_day(v.arrived_at, coalesce(v.left_at, least(now(), v.arrived_at + interval '1 day')), d.date) AS m
    ) mins
    WHERE v.arrived_at < (d.date + 1)::timestamp AT TIME ZONE 'Europe/Skopje'
      AND coalesce(v.left_at, now()) > d.date::timestamp AT TIME ZONE 'Europe/Skopje'
  ) pm ON true
  LEFT JOIN LATERAL (
    SELECT sum(public.minutes_on_day(ls.arrived_at, ls.left_at, d.date))::int AS minutes
    FROM public.location_stays ls
    WHERE ls.arrived_at < (d.date + 1)::timestamp AT TIME ZONE 'Europe/Skopje'
      AND ls.left_at > d.date::timestamp AT TIME ZONE 'Europe/Skopje'
  ) st ON true
  ON CONFLICT (date) DO UPDATE SET
    screen_time_min = excluded.screen_time_min,
    unlocks = excluded.unlocks,
    first_unlock_at = excluded.first_unlock_at,
    last_unlock_at = excluded.last_unlock_at,
    mood = excluded.mood,
    energy = excluded.energy,
    focus = excluded.focus,
    steps = excluded.steps,
    distance_m = excluded.distance_m,
    sleep_min = excluded.sleep_min,
    sleep_confidence = excluded.sleep_confidence,
    home_min = excluded.home_min,
    work_min = excluded.work_min,
    gym_min = excluded.gym_min,
    other_places_min = excluded.other_places_min,
    notifications = excluded.notifications,
    updated_at = excluded.updated_at;
$$;
--> statement-breakpoint

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

  -- notifications → notifications_hourly (a finished hour is final; resends are identical)
  INSERT INTO public.notifications_hourly AS n (hour, package, app_label, count)
  SELECT DISTINCT ON (e.occurred_at, e.payload ->> 'package')
    e.occurred_at, e.payload ->> 'package', e.payload ->> 'app_label', (e.payload ->> 'count')::int
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'notifications'
  ORDER BY e.occurred_at, e.payload ->> 'package', (e.payload ->> 'count')::int DESC
  ON CONFLICT (hour, package) DO UPDATE SET
    count = greatest(n.count, excluded.count),
    app_label = excluded.app_label;

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
    WHERE e.id = ANY (event_ids) AND e.type IN ('unlock', 'app_usage', 'checkin', 'steps', 'geofence', 'stay', 'notifications')
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

REVOKE ALL ON FUNCTION public.refresh_daily_summary(date[]) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.process_events(uuid[]) FROM PUBLIC, anon, authenticated;
