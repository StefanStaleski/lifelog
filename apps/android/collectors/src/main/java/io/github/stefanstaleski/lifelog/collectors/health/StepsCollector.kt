package io.github.stefanstaleski.lifelog.collectors.health

import io.github.stefanstaleski.lifelog.collectors.CollectResult
import io.github.stefanstaleski.lifelog.collectors.PolledCollector
import io.github.stefanstaleski.lifelog.core.data.NewEvent
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.StepsPayload
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
    override val name = "health_connect"

    /** Health Connect allows reading up to 30 days back; a week gives the first charts some history. */
    override val initialLookback: Duration = Duration.ofDays(7)

    override suspend fun collect(since: Instant, until: Instant): CollectResult {
        // Not allowed yet: keep the watermark so nothing is skipped once access is granted.
        if (source.access() != HealthAccess.AVAILABLE) return CollectResult(emptyList(), since)

        val to = floorToHour(until)
        val from = minOf(floorToHour(since), to.minus(RESYNC))
        if (!to.isAfter(from)) return CollectResult(emptyList(), since)

        val events = source.hourly(from, to)
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
