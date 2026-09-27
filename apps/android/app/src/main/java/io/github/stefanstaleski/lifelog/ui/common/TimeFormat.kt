package io.github.stefanstaleski.lifelog.ui.common

import java.time.Duration
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.Locale

private val hhmm = DateTimeFormatter.ofPattern("HH:mm", Locale.ENGLISH)
private val dayHhmm = DateTimeFormatter.ofPattern("EEE HH:mm", Locale.ENGLISH)
private val dayMonth = DateTimeFormatter.ofPattern("d MMM", Locale.ENGLISH)

/** "just now", "5 min ago", "3 h ago", "yesterday 21:30", "Mon 08:12", "12 Sep". */
fun relativeTime(then: Instant, now: Instant, zone: ZoneId): String {
    val age = Duration.between(then, now)
    if (age < Duration.ofMinutes(1)) return "just now"
    if (age < Duration.ofHours(1)) return "${age.toMinutes()} min ago"
    if (age < Duration.ofHours(12)) return "${age.toHours()} h ago"
    val thenLocal = then.atZone(zone)
    val days = Duration.between(thenLocal.toLocalDate().atStartOfDay(zone), now.atZone(zone).toLocalDate().atStartOfDay(zone)).toDays()
    return when {
        days == 0L -> "today ${hhmm.format(thenLocal)}"
        days == 1L -> "yesterday ${hhmm.format(thenLocal)}"
        days < 7 -> dayHhmm.format(thenLocal)
        else -> dayMonth.format(thenLocal)
    }
}

/** 0 → "0 min", 45 → "45 min", 192 → "3 h 12 min", 180 → "3 h". */
fun minutesLabel(minutes: Int): String {
    val h = minutes / 60
    val m = minutes % 60
    return when {
        h == 0 -> "$m min"
        m == 0 -> "$h h"
        else -> "$h h $m min"
    }
}
