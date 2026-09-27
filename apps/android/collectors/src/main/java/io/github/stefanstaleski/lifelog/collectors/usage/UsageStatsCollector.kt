package io.github.stefanstaleski.lifelog.collectors.usage

import io.github.stefanstaleski.lifelog.collectors.CollectResult
import io.github.stefanstaleski.lifelog.collectors.PolledCollector
import io.github.stefanstaleski.lifelog.core.data.NewEvent
import io.github.stefanstaleski.lifelog.core.data.model.AppUsagePayload
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.UnlockPayload
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import kotlinx.serialization.serializer

/**
 * Screen time per app (one `app_usage` event per app per 30-min UTC window) and unlocks.
 * Only complete windows are emitted; the watermark is the end of the last complete window.
 */
class UsageStatsCollector @Inject constructor(
    private val source: UsageEventSource,
    private val apps: AppInfoProvider,
) : PolledCollector {
    override val name = "usage_stats"

    override suspend fun collect(since: Instant, until: Instant): CollectResult {
        val from = floorToWindow(since)
        val to = floorToWindow(until)
        if (!to.isAfter(from)) return CollectResult(emptyList(), since)

        val records = source.read(from.minus(STATE_LOOKBACK), to)
        val aggregate = UsageAggregator.aggregate(records, from, to)

        val usage = aggregate.usage
            .filterNot { apps.isExcluded(it.packageName) }
            .map { w ->
                val info = apps.info(w.packageName)
                NewEvent(
                    type = EventType.APP_USAGE,
                    payload = AppUsagePayload(w.packageName, info.label, info.category, w.foregroundMs, w.launches),
                    serializer = serializer<AppUsagePayload>(),
                    occurredAt = w.windowStart,
                    endedAt = w.windowStart.plus(UsageAggregator.WINDOW),
                    id = stableId("app_usage|${w.packageName}|${w.windowStart.toEpochMilli()}"),
                )
            }
        val unlocks = aggregate.unlocks.map { at ->
            NewEvent(
                type = EventType.UNLOCK,
                payload = UnlockPayload(),
                serializer = serializer<UnlockPayload>(),
                occurredAt = at,
                id = stableId("unlock|${at.toEpochMilli()}"),
            )
        }
        return CollectResult(usage + unlocks, to)
    }

    companion object {
        /** How far before a window we read, to know which apps were already open. */
        val STATE_LOOKBACK: Duration = Duration.ofHours(6)

        fun floorToWindow(t: Instant): Instant {
            val w = UsageAggregator.WINDOW.toMillis()
            return Instant.ofEpochMilli(Math.floorDiv(t.toEpochMilli(), w) * w)
        }

        /** Same input → same UUID (name-based), so re-collecting a window is a no-op. */
        fun stableId(key: String): UUID = UUID.nameUUIDFromBytes(key.toByteArray())
    }
}
