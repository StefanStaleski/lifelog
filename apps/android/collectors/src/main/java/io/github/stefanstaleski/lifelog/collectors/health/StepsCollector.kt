package io.github.stefanstaleski.lifelog.collectors.health

import io.github.stefanstaleski.lifelog.collectors.CollectResult
import io.github.stefanstaleski.lifelog.collectors.PolledCollector
import io.github.stefanstaleski.lifelog.core.data.NewEvent
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.StepsPayload
import android.util.Log
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import kotlin.math.roundToInt
import kotlinx.serialization.serializer

/**
 * Steps and distance per finished UTC hour from Health Connect. Samsung Health syncs into Health
 * Connect late, so every run re-reads the last [RESYNC] and sends hours whose totals changed
 * (the id includes the totals; the server keeps the larger value per hour).
 */
class StepsCollector @Inject constructor(private val source: StepsSource) : PolledCollector {
    // "_v2": a fresh watermark after the first release advanced past an empty Health Connect (S24).
    override val name = "health_connect_v2"

    /** Health Connect allows reading up to 30 days back; a week gives the first charts some history. */
    override val initialLookback: Duration = Duration.ofDays(7)

    override suspend fun collect(since: Instant, until: Instant): CollectResult {
        // Not allowed yet: keep the watermark so nothing is skipped once access is granted.
        if (source.access() != HealthAccess.AVAILABLE) return CollectResult(emptyList(), since)

        val to = floorToHour(until)
        val from = minOf(floorToHour(since), to.minus(RESYNC))
        if (!to.isAfter(from)) return CollectResult(emptyList(), since)

        val hours = source.hourly(from, to)
        val withData = hours.filter { it.steps > 0 || it.distanceM >= 1 }
        Log.i("Lifelog", "health_connect: ${withData.size} hours with data in [$from, $to)")
        // Nothing at all yet (e.g. Samsung Health hasn't synced into Health Connect): keep the
        // starting point, so the backfill still happens once data shows up.
        if (withData.isEmpty()) return CollectResult(emptyList(), since)

        val events = hours
            .filter { Duration.between(it.hourStart, it.hourEnd) == HOUR && (it.steps > 0 || it.distanceM >= 1) }
            .map { h ->
                val steps = h.steps.coerceAtMost(MAX_STEPS).toInt()
                val distance = h.distanceM.roundToInt().coerceAtMost(MAX_DISTANCE_M)
                NewEvent(
                    type = EventType.STEPS,
                    payload = StepsPayload(steps, distance),
                    serializer = serializer<StepsPayload>(),
                    occurredAt = h.hourStart,
                    endedAt = h.hourEnd,
                    id = UUID.nameUUIDFromBytes("steps|${h.hourStart.toEpochMilli()}|$steps|$distance".toByteArray()),
                )
            }
        return CollectResult(events, to)
    }

    companion object {
        val RESYNC: Duration = Duration.ofHours(24)
        private val HOUR: Duration = Duration.ofHours(1)
        private const val MAX_STEPS = 100_000L
        private const val MAX_DISTANCE_M = 200_000

        fun floorToHour(t: Instant): Instant = Instant.ofEpochMilli(Math.floorDiv(t.toEpochMilli(), 3_600_000L) * 3_600_000L)
    }
}
