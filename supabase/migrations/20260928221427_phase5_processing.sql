-- Phase 5 processing: laptop activity (ActivityWatch), work minutes, calls, SMS, messaging-app
-- counts per sender and people. Replaces refresh_daily_summary and
-- process_events whole (derived from 20260927110238_notifications_processing.sql; same
-- signatures), seeds the single-row settings and backfills what existing events allow.

-- Is the 30-min window starting at ts inside the work schedule (local time, Europe/Skopje)?
-- Windows are half-hour aligned, so a schedule of 09:00–17:00 covers the windows 09:00…16:30.
CREATE FUNCTION public.in_work_schedule(ts timestamptz) RETURNS boolean
LANGUAGE sql STABLE
SET search_path = ''
AS $$
  SELECT coalesce((
    SELECT extract(isodow FROM ts AT TIME ZONE 'Europe/Skopje')::int = ANY (ws.days)
       AND (ts AT TIME ZONE 'Europe/Skopje')::time >= ws.start_local
       AND (ts AT TIME ZONE 'Europe/Skopje')::time < ws.end_local
    FROM public.work_settings ws WHERE ws.id = 1
  ), false)
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.refresh_daily_summary(dates date[]) RETURNS void
LANGUAGE sql
SET search_path = ''
AS $$
  INSERT INTO public.daily_summary AS s (
    date, screen_time_min, unlocks, first_unlock_at, last_unlock_at, mood, energy, focus,
    steps, distance_m, sleep_min, sleep_confidence, home_min, work_min, gym_min, other_places_min,
    notifications, worked_min, worked_in_hours_min, worked_after_hours_min, first_work_at,
    last_work_at, desktop_min, wfh_min, calls, call_min, people_contacted, messages_received,
    updated_at
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
    wk.in_hours + wk.after_hours,
    wk.in_hours,
    wk.after_hours,
    wk.first_at,
    wk.last_at,
    wk.desktop_min,
    wfh.minutes,
    cl.calls,
    cl.call_min,
    pc.people,
    mr.messages,
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
  -- Local day bounds, and the day each source started (days before it are null, not 0).
  CROSS JOIN LATERAL (
    SELECT d.date::timestamp AT TIME ZONE 'Europe/Skopje' AS day_start,
           (d.date + 1)::timestamp AT TIME ZONE 'Europe/Skopje' AS day_end,
           (SELECT public.local_date(min(du.window_start)) FROM public.desktop_usage du) AS desktop_since,
           (SELECT public.local_date(min(c.occurred_at)) FROM public.calls c) AS calls_since,
           (SELECT public.local_date(min(sm.occurred_at)) FROM public.sms_messages sm) AS sms_since,
           (SELECT public.local_date(min(mc.hour)) FROM public.message_counts mc) AS messages_since
  ) b
  LEFT JOIN public.work_settings ws ON ws.id = 1
  -- Work: per 30-min window, work-tagged laptop time plus work-tagged phone app time, capped at
  -- 30 min. Laptop rows: browser hostname tag, else app tag, else (untagged) work inside the
  -- schedule when untagged_desktop_is_work. Phone apps count only when tagged work.
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN count(*) > 0 OR d.date >= b.desktop_since THEN coalesce(round(
        sum(least(30, win.work_ms / 60000.0)) FILTER (WHERE public.in_work_schedule(win.window_start))
      )::int, 0) END AS in_hours,
      CASE WHEN count(*) > 0 OR d.date >= b.desktop_since THEN coalesce(round(
        sum(least(30, win.work_ms / 60000.0)) FILTER (WHERE NOT public.in_work_schedule(win.window_start))
      )::int, 0) END AS after_hours,
      min(win.window_start) FILTER (WHERE win.work_ms > 0) AS first_at,
      max(win.window_start) FILTER (WHERE win.work_ms > 0) + interval '30 minutes' AS last_at,
      CASE WHEN d.date >= b.desktop_since THEN
        coalesce(round(sum(least(30, win.desktop_ms / 60000.0)))::int, 0) END AS desktop_min
    FROM (
      SELECT w.window_start, sum(w.work_ms) AS work_ms, sum(w.desktop_ms) AS desktop_ms
      FROM (
        SELECT du.window_start,
               CASE WHEN coalesce(
                      ht.is_work,
                      dt.is_work,
                      coalesce(ws.untagged_desktop_is_work, false) AND public.in_work_schedule(du.window_start)
                    ) THEN du.active_ms ELSE 0 END AS work_ms,
               du.active_ms AS desktop_ms
        FROM public.desktop_usage du
        LEFT JOIN public.app_tags ht ON ht.source = 'host' AND ht.key = du.host AND du.host <> ''
        LEFT JOIN public.app_tags dt ON dt.source = 'desktop' AND dt.key = du.app
        WHERE du.window_start >= b.day_start AND du.window_start < b.day_end
        UNION ALL
        SELECT aw.window_start, aw.foreground_ms, 0
        FROM public.app_usage_windows aw
        JOIN public.app_tags pt ON pt.source = 'phone' AND pt.key = aw.package AND pt.is_work
        WHERE aw.window_start >= b.day_start AND aw.window_start < b.day_end
      ) w
      GROUP BY w.window_start
    ) win
  ) wk ON true
  -- Working from home: minutes at a home place inside the schedule (schedule days only).
  LEFT JOIN LATERAL (
    SELECT nullif(sum(public.minutes_between(
             greatest(v.arrived_at, sch.s),
             least(coalesce(v.left_at, least(now(), v.arrived_at + interval '1 day')), sch.e)
           )), 0)::int AS minutes
    FROM (
      SELECT (d.date + ws.start_local) AT TIME ZONE 'Europe/Skopje' AS s,
             (d.date + ws.end_local) AT TIME ZONE 'Europe/Skopje' AS e
      WHERE extract(isodow FROM d.date)::int = ANY (ws.days)
    ) sch
    JOIN public.visits v ON v.arrived_at < sch.e AND coalesce(v.left_at, now()) > sch.s
    JOIN public.places p ON p.id = v.place_id AND p.kind = 'home'
  ) wfh ON true
  -- Calls: connected = incoming or outgoing with a duration.
  LEFT JOIN LATERAL (
    SELECT
      CASE WHEN d.date >= b.calls_since THEN
        (count(*) FILTER (WHERE c.direction IN ('incoming', 'outgoing') AND c.duration_s > 0))::int END AS calls,
      CASE WHEN d.date >= b.calls_since THEN round(coalesce(
        sum(c.duration_s) FILTER (WHERE c.direction IN ('incoming', 'outgoing') AND c.duration_s > 0), 0
      ) / 60.0)::int END AS call_min
    FROM public.calls c
    WHERE c.occurred_at >= b.day_start AND c.occurred_at < b.day_end
  ) cl ON true
  -- People contacted: distinct people across connected calls, SMS and messaging senders (not hidden).
  LEFT JOIN LATERAL (
    SELECT CASE WHEN d.date >= least(b.calls_since, b.sms_since, b.messages_since) THEN
             count(DISTINCT x.h)::int END AS people
    FROM (
      SELECT c.contact_hash AS h FROM public.calls c
      WHERE c.occurred_at >= b.day_start AND c.occurred_at < b.day_end
        AND c.direction IN ('incoming', 'outgoing') AND c.duration_s > 0
      UNION ALL
      SELECT sm.contact_hash FROM public.sms_messages sm
      WHERE sm.occurred_at >= b.day_start AND sm.occurred_at < b.day_end
      UNION ALL
      SELECT mc.sender_hash FROM public.message_counts mc
      WHERE mc.hour >= b.day_start AND mc.hour < b.day_end
    ) x
    WHERE NOT EXISTS (SELECT 1 FROM public.people pp WHERE pp.contact_hash = x.h AND pp.hidden)
  ) pc ON true
  LEFT JOIN LATERAL (
    SELECT CASE WHEN d.date >= b.messages_since THEN coalesce(sum(mc.count), 0)::int END AS messages
    FROM public.message_counts mc
    WHERE mc.hour >= b.day_start AND mc.hour < b.day_end
  ) mr ON true
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
    worked_min = excluded.worked_min,
    worked_in_hours_min = excluded.worked_in_hours_min,
    worked_after_hours_min = excluded.worked_after_hours_min,
    first_work_at = excluded.first_work_at,
    last_work_at = excluded.last_work_at,
    desktop_min = excluded.desktop_min,
    wfh_min = excluded.wfh_min,
    calls = excluded.calls,
    call_min = excluded.call_min,
    people_contacted = excluded.people_contacted,
    messages_received = excluded.messages_received,
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

  -- app_usage → app_usage_windows (per 30-min UTC window, for work minutes)
  INSERT INTO public.app_usage_windows AS w (window_start, package, foreground_ms)
  SELECT DISTINCT ON (date_bin(interval '30 minutes', e.occurred_at, timestamptz '2000-01-01Z'), e.payload ->> 'package')
    date_bin(interval '30 minutes', e.occurred_at, timestamptz '2000-01-01Z'),
    e.payload ->> 'package',
    (e.payload ->> 'foreground_ms')::int
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'app_usage'
  ORDER BY date_bin(interval '30 minutes', e.occurred_at, timestamptz '2000-01-01Z'), e.payload ->> 'package',
           (e.payload ->> 'foreground_ms')::int DESC
  ON CONFLICT (window_start, package) DO UPDATE SET
    foreground_ms = greatest(w.foreground_ms, excluded.foreground_ms);

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

  -- desktop_usage → desktop_usage (complete windows; a resent window keeps the larger value)
  INSERT INTO public.desktop_usage AS du (window_start, app, host, active_ms, device_id)
  SELECT DISTINCT ON (e.occurred_at, e.payload ->> 'app', coalesce(e.payload ->> 'host', ''))
    e.occurred_at,
    e.payload ->> 'app',
    coalesce(e.payload ->> 'host', ''),
    (e.payload ->> 'active_ms')::int,
    e.device_id
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'desktop_usage'
  ORDER BY e.occurred_at, e.payload ->> 'app', coalesce(e.payload ->> 'host', ''),
           (e.payload ->> 'active_ms')::int DESC
  ON CONFLICT (window_start, app, host) DO UPDATE SET
    active_ms = greatest(du.active_ms, excluded.active_ms),
    device_id = excluded.device_id;

  -- desktop_heartbeat → source_health 'desktop' (newest heartbeat only)
  INSERT INTO public.source_health AS h (source, last_event_at, last_error, details, updated_at)
  SELECT 'desktop', hb.occurred_at,
    nullif(concat_ws('; ',
      CASE WHEN NOT (hb.payload ->> 'aw_reachable')::boolean THEN 'ActivityWatch not reachable' END
    ), ''),
    hb.payload, now()
  FROM (
    SELECT e.payload, e.occurred_at FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type = 'desktop_heartbeat'
    ORDER BY e.occurred_at DESC LIMIT 1
  ) hb
  ON CONFLICT (source) DO UPDATE SET
    last_event_at = greatest(h.last_event_at, excluded.last_event_at),
    last_error = CASE WHEN excluded.last_event_at >= h.last_event_at THEN excluded.last_error ELSE h.last_error END,
    details = CASE WHEN excluded.last_event_at >= h.last_event_at THEN excluded.details ELSE h.details END,
    updated_at = excluded.updated_at;

  -- call / sms / messages → people (display_name: the latest non-null name)
  INSERT INTO public.people AS p (contact_hash, kind, display_name, first_seen_at, last_seen_at)
  SELECT x.h, min(x.kind),
         (array_agg(x.name ORDER BY x.at DESC) FILTER (WHERE x.name IS NOT NULL))[1],
         min(x.at), max(x.at)
  FROM (
    SELECT e.payload ->> 'contact_hash' AS h, 'phone' AS kind, e.payload ->> 'contact_name' AS name,
           e.occurred_at AS at
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type IN ('call', 'sms')
    UNION ALL
    SELECT e.payload ->> 'sender_hash', 'messaging', e.payload ->> 'sender_name', e.occurred_at
    FROM public.events e
    WHERE e.id = ANY (event_ids) AND e.type = 'messages'
  ) x
  GROUP BY x.h
  ON CONFLICT (contact_hash) DO UPDATE SET
    display_name = CASE
      WHEN excluded.display_name IS NOT NULL
       AND (p.display_name IS NULL OR excluded.last_seen_at >= p.last_seen_at)
      THEN excluded.display_name ELSE p.display_name END,
    first_seen_at = least(p.first_seen_at, excluded.first_seen_at),
    last_seen_at = greatest(p.last_seen_at, excluded.last_seen_at);

  -- call → calls; sms → sms_messages
  INSERT INTO public.calls (id, occurred_at, direction, duration_s, contact_hash, contact_name)
  SELECT e.id, e.occurred_at, e.payload ->> 'direction', (e.payload ->> 'duration_s')::int,
         e.payload ->> 'contact_hash', e.payload ->> 'contact_name'
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'call'
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.sms_messages (id, occurred_at, direction, contact_hash, contact_name)
  SELECT e.id, e.occurred_at, e.payload ->> 'direction', e.payload ->> 'contact_hash', e.payload ->> 'contact_name'
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'sms'
  ON CONFLICT (id) DO NOTHING;

  -- messages → message_counts (an hour may be re-sent with a larger count; the larger wins)
  INSERT INTO public.message_counts AS mc (hour, package, app_label, sender_hash, sender_name, conversation, count)
  SELECT DISTINCT ON (e.occurred_at, e.payload ->> 'package', e.payload ->> 'sender_hash')
    e.occurred_at, e.payload ->> 'package', e.payload ->> 'app_label', e.payload ->> 'sender_hash',
    e.payload ->> 'sender_name', e.payload ->> 'conversation', (e.payload ->> 'count')::int
  FROM public.events e
  WHERE e.id = ANY (event_ids) AND e.type = 'messages'
  ORDER BY e.occurred_at, e.payload ->> 'package', e.payload ->> 'sender_hash', (e.payload ->> 'count')::int DESC
  ON CONFLICT (hour, package, sender_hash) DO UPDATE SET
    count = greatest(mc.count, excluded.count),
    app_label = excluded.app_label,
    sender_name = excluded.sender_name,
    conversation = excluded.conversation;

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
    WHERE e.id = ANY (event_ids) AND e.type IN ('unlock', 'app_usage', 'checkin', 'steps', 'geofence', 'stay', 'notifications',
                                                         'desktop_usage', 'call', 'sms', 'messages')
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

REVOKE ALL ON FUNCTION public.in_work_schedule(timestamptz) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.refresh_daily_summary(date[]) FROM PUBLIC, anon, authenticated;--> statement-breakpoint
REVOKE ALL ON FUNCTION public.process_events(uuid[]) FROM PUBLIC, anon, authenticated;--> statement-breakpoint

-- Default schedule (Mon–Fri 09:00–17:00, untagged laptop time inside it counts as work).
INSERT INTO public.work_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

-- The contact salt: random, created once, never changed.
INSERT INTO public.server_secrets (id) VALUES (1) ON CONFLICT (id) DO NOTHING;--> statement-breakpoint

-- Backfill phone app time per window from the raw events still kept (last 90 days).
INSERT INTO public.app_usage_windows AS w (window_start, package, foreground_ms)
SELECT date_bin(interval '30 minutes', e.occurred_at, timestamptz '2000-01-01Z'), e.payload ->> 'package',
       max((e.payload ->> 'foreground_ms')::int)
FROM public.events e
WHERE e.type = 'app_usage'
GROUP BY 1, 2
ON CONFLICT (window_start, package) DO UPDATE SET
  foreground_ms = greatest(w.foreground_ms, excluded.foreground_ms);--> statement-breakpoint

-- Fill the new daily_summary columns for the days that already exist.
SELECT public.refresh_daily_summary(ARRAY(SELECT s.date FROM public.daily_summary s));
