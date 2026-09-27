package io.github.stefanstaleski.lifelog.collectors.usage

import java.time.Duration
import java.time.Instant

/** The subset of android.app.usage.UsageEvents we need, free of Android types for testing. */
data class UsageRecord(val timeMs: Long, val kind: Kind, val packageName: String, val className: String? = null) {
    enum class Kind { ACTIVITY_RESUMED, ACTIVITY_PAUSED, ACTIVITY_STOPPED, SCREEN_OFF, KEYGUARD_HIDDEN, SHUTDOWN }
}

/** Foreground time of one app inside one window [windowStart, windowStart + window). */
data class WindowUsage(val windowStart: Instant, val packageName: String, val foregroundMs: Long, val launches: Int)

data class UsageAggregate(val usage: List<WindowUsage>, val unlocks: List<Instant>)

/**
 * Turns raw usage events into per-app foreground time per fixed window, plus unlock times.
 *
 * - Pass events from some hours before [from] so apps already open at [from] are known.
 * - An app's time is the union of its activities' intervals (activity transitions overlap).
 * - Screen off / shutdown ends every open interval, even without a pause event.
 * - Intervals still open at [to] are counted up to [to].
 * - A launch is the start of a merged foreground interval (gaps under [mergeGap] are joined).
 */
object UsageAggregator {
    val WINDOW: Duration = Duration.ofMinutes(30)
    private val mergeGap: Duration = Duration.ofSeconds(2)

    fun aggregate(records: List<UsageRecord>, from: Instant, to: Instant, window: Duration = WINDOW): UsageAggregate {
        val fromMs = from.toEpochMilli()
        val toMs = to.toEpochMilli()
        require(toMs > fromMs && (toMs - fromMs) % window.toMillis() == 0L) { "range must be whole windows" }

        val intervals = foregroundIntervals(records.sortedBy { it.timeMs }, toMs)
        val usage = intervals.flatMap { (pkg, spans) -> splitIntoWindows(pkg, merge(spans), fromMs, toMs, window.toMillis()) }
        val unlocks = records
            .filter { it.kind == UsageRecord.Kind.KEYGUARD_HIDDEN && it.timeMs in fromMs until toMs }
            .map { Instant.ofEpochMilli(it.timeMs) }
            .distinct()
            .sorted()
        return UsageAggregate(usage.sortedWith(compareBy({ it.windowStart }, { it.packageName })), unlocks)
    }

    /** Per package: raw [start, end) spans of its activities. */
    private fun foregroundIntervals(records: List<UsageRecord>, endMs: Long): Map<String, List<LongRange>> {
        val open = mutableMapOf<Pair<String, String?>, Long>() // (package, activity) -> resumed at
        val spans = mutableMapOf<String, MutableList<LongRange>>()
        fun close(key: Pair<String, String?>, at: Long) {
            val start = open.remove(key) ?: return
            if (at > start) spans.getOrPut(key.first) { mutableListOf() } += start until at
        }
        for (r in records) {
            if (r.timeMs >= endMs) break
            val key = r.packageName to r.className
            when (r.kind) {
                UsageRecord.Kind.ACTIVITY_RESUMED -> if (key !in open) open[key] = r.timeMs
                UsageRecord.Kind.ACTIVITY_PAUSED, UsageRecord.Kind.ACTIVITY_STOPPED -> close(key, r.timeMs)
                UsageRecord.Kind.SCREEN_OFF, UsageRecord.Kind.SHUTDOWN -> open.keys.toList().forEach { close(it, r.timeMs) }
                UsageRecord.Kind.KEYGUARD_HIDDEN -> Unit
            }
        }
        open.keys.toList().forEach { close(it, endMs) }
        return spans
    }

    /** Union of spans, joining ones separated by less than [mergeGap]. */
    private fun merge(spans: List<LongRange>): List<LongRange> {
        val merged = mutableListOf<LongRange>()
        for (s in spans.sortedBy { it.first }) {
            val last = merged.lastOrNull()
            if (last != null && s.first <= last.last + 1 + mergeGap.toMillis()) {
                merged[merged.lastIndex] = last.first..maxOf(last.last, s.last)
            } else {
                merged += s
            }
        }
        return merged
    }

    private fun splitIntoWindows(pkg: String, spans: List<LongRange>, fromMs: Long, toMs: Long, windowMs: Long): List<WindowUsage> {
        val result = mutableListOf<WindowUsage>()
        var ws = fromMs
        while (ws < toMs) {
            val we = ws + windowMs
            var ms = 0L
            var launches = 0
            for (s in spans) {
                val start = s.first
                val end = s.last + 1
                ms += (minOf(end, we) - maxOf(start, ws)).coerceAtLeast(0)
                if (start in ws until we) launches++
            }
            if (ms > 0 || launches > 0) result += WindowUsage(Instant.ofEpochMilli(ws), pkg, ms, launches)
            ws = we
        }
        return result
    }
}
