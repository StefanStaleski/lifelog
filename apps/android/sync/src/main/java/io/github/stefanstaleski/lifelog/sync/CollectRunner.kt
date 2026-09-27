package io.github.stefanstaleski.lifelog.sync

import android.util.Log
import io.github.stefanstaleski.lifelog.collectors.PolledCollector
import io.github.stefanstaleski.lifelog.core.data.EventWriter
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventDao
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.HeartbeatPayload
import javax.inject.Inject
import kotlin.coroutines.cancellation.CancellationException
import kotlinx.coroutines.flow.first

data class CollectSummary(val written: Int, val errors: List<String>)

/**
 * One collection run: every polled collector from its watermark to now, then a heartbeat.
 * A failing collector is recorded and skipped; it never stops the others or the heartbeat.
 */
class CollectRunner @Inject constructor(
    private val collectors: Set<@JvmSuppressWildcards PolledCollector>,
    private val writer: EventWriter,
    private val settings: LifelogSettings,
    private val dao: PendingEventDao,
    private val deviceStatus: DeviceStatusSource,
) {
    suspend fun run(): CollectSummary {
        val now = writer.now()
        val paused = settings.collectionPaused.first()
        var written = 0
        val errors = mutableListOf<String>()

        if (!paused) {
            for (collector in collectors.sortedBy { it.name }) {
                try {
                    val since = settings.watermark(collector.name) ?: now.minus(collector.initialLookback)
                    if (!since.isBefore(now)) continue
                    val result = collector.collect(since, now)
                    written += writer.writeAll(result.events)
                    settings.setWatermark(collector.name, result.watermark)
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "collector ${collector.name} failed", e)
                    errors += "${collector.name}: ${e.message ?: e::class.simpleName}"
                }
            }
        }

        val status = deviceStatus.read()
        writer.write(
            EventType.HEARTBEAT,
            HeartbeatPayload(
                appVersion = status.appVersion,
                pendingCount = dao.pendingCount(),
                collectionPaused = paused,
                usageAccessGranted = status.usageAccessGranted,
                batteryOptimizationIgnored = status.batteryOptimizationIgnored,
                charging = status.charging,
                batteryPct = status.batteryPct,
                autoRevokeExempt = status.autoRevokeExempt,
            ),
        )
        settings.recordCollect(now, errors)
        return CollectSummary(written, errors)
    }

    private companion object {
        const val TAG = "Lifelog"
    }
}
