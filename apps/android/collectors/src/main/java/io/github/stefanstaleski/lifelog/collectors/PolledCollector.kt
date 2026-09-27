package io.github.stefanstaleski.lifelog.collectors

import io.github.stefanstaleski.lifelog.core.data.NewEvent
import java.time.Duration
import java.time.Instant

/**
 * A data source read on a schedule (every collection run). Live sources (receivers, listeners)
 * write through EventWriter directly instead.
 */
interface PolledCollector {
    /** Stable key, used for the collector's watermark. */
    val name: String

    /** How far back the very first run reaches. */
    val initialLookback: Duration get() = Duration.ofDays(1)

    /**
     * Reads everything in [since, until). Event ids must be deterministic (derived from the
     * source data), because a window can be collected twice if the app dies before the
     * watermark is saved.
     */
    suspend fun collect(since: Instant, until: Instant): CollectResult
}

/**
 * @param watermark where the next run starts; may be before `until` when the tail of the window
 * is not final yet (e.g. a usage window still in progress).
 */
data class CollectResult(val events: List<NewEvent<*>>, val watermark: Instant)
