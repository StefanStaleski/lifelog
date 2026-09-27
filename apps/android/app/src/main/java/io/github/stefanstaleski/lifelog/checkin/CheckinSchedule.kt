package io.github.stefanstaleski.lifelog.checkin

import java.time.LocalDate
import java.time.LocalTime
import java.time.ZonedDateTime

/** Local time of the evening reminder (matches `checkin_time` in /api/v1/config). */
val CHECKIN_TIME: LocalTime = LocalTime.of(21, 30)

/** Before this hour a check-in still belongs to the previous evening. */
private const val DAY_ROLLOVER_HOUR = 4

/** The day a check-in made at [now] is about: late-night check-ins count for the evening before. */
fun checkinDateFor(now: ZonedDateTime): LocalDate =
    if (now.hour < DAY_ROLLOVER_HOUR) now.toLocalDate().minusDays(1) else now.toLocalDate()

/** Next reminder strictly after [now], at [time] local wall-clock time (DST-safe). */
fun nextReminderAt(now: ZonedDateTime, time: LocalTime = CHECKIN_TIME): ZonedDateTime {
    val today = now.toLocalDate().atTime(time).atZone(now.zone)
    return if (today.isAfter(now)) today else now.toLocalDate().plusDays(1).atTime(time).atZone(now.zone)
}
