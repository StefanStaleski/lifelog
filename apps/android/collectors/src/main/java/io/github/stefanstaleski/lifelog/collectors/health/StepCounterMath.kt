package io.github.stefanstaleski.lifelog.collectors.health

import kotlinx.serialization.Serializable

/** The counter reading we last saw, kept on the phone between runs. */
@Serializable
data class StepCounterState(
    val value: Long,
    val atMs: Long,
    /** When the phone booted (wall clock); a change means the counter restarted from 0. */
    val bootMs: Long,
    /** Steps per UTC hour start not yet final (the current hour and recent ones). */
    val hours: Map<Long, Long> = emptyMap(),
)

/**
 * Turns successive readings of the cumulative step counter into steps per UTC hour. Steps between
 * two readings are spread evenly over that time; a reboot restarts the counter from zero.
 */
object StepCounterMath {
    private const val HOUR = 3_600_000L
    private const val MAX_SPREAD_MS = 48 * HOUR
    private const val KEEP_MS = 48 * HOUR
    private const val REBOOT_TOLERANCE_MS = 60_000L

    fun update(prev: StepCounterState?, value: Long, atMs: Long, bootMs: Long): StepCounterState {
        if (prev == null) return StepCounterState(value, atMs, bootMs) // first reading: baseline only
        val rebooted = kotlin.math.abs(bootMs - prev.bootMs) > REBOOT_TOLERANCE_MS || value < prev.value
        val delta = if (rebooted) value else value - prev.value
        val from = if (rebooted) maxOf(bootMs, prev.atMs) else prev.atMs
        val hours = prev.hours.toMutableMap()
        if (delta > 0 && atMs > from) spread(delta, maxOf(from, atMs - MAX_SPREAD_MS), atMs, hours)
        hours.keys.removeAll { it < atMs - KEEP_MS }
        return StepCounterState(value, atMs, bootMs, hours)
    }

    /** Adds `steps` over [from, to) in proportion to the time falling in each hour. */
    private fun spread(steps: Long, from: Long, to: Long, into: MutableMap<Long, Long>) {
        val total = (to - from).toDouble()
        var given = 0L
        var t = from
        while (t < to) {
            val hour = Math.floorDiv(t, HOUR) * HOUR
            val end = minOf(hour + HOUR, to)
            // Last slice takes the rounding remainder so the total is exact.
            val share = if (end == to) steps - given else Math.round(steps * (end - t) / total)
            into[hour] = (into[hour] ?: 0) + share
            given += share
            t = end
        }
    }

    /** Hours that are over by `nowMs`, with their totals. */
    fun finished(state: StepCounterState, nowMs: Long): Map<Long, Long> =
        state.hours.filterKeys { it + HOUR <= nowMs }.filterValues { it > 0 }
}
