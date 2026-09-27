package io.github.stefanstaleski.lifelog.collectors.notifications

import io.github.stefanstaleski.lifelog.collectors.CollectResult
import io.github.stefanstaleski.lifelog.collectors.PolledCollector
import io.github.stefanstaleski.lifelog.collectors.usage.AppInfoProvider
import io.github.stefanstaleski.lifelog.core.data.NewEvent
import io.github.stefanstaleski.lifelog.core.data.db.NotificationCountDao
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.NotificationsPayload
import java.time.Duration
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import kotlinx.serialization.serializer

/** Sends finished hours of the listener's counts; ids from (app, hour), so resends are no-ops. */
class NotificationCollector @Inject constructor(
    private val counts: NotificationCountDao,
    private val apps: AppInfoProvider,
) : PolledCollector {
    override val name = "notifications"

    override suspend fun collect(since: Instant, until: Instant): CollectResult {
        val to = hourStart(until.toEpochMilli())
        val from = minOf(hourStart(since.toEpochMilli()), to - HOUR_MS)
        val events = counts.between(from, to)
            .filterNot { apps.isExcluded(it.packageName) }
            .map { row ->
                val start = Instant.ofEpochMilli(row.hourStart)
                NewEvent(
                    type = EventType.NOTIFICATIONS,
                    payload = NotificationsPayload(row.packageName, apps.info(row.packageName).label, row.count.coerceAtMost(10_000)),
                    serializer = serializer<NotificationsPayload>(),
                    occurredAt = start,
                    endedAt = start.plusMillis(HOUR_MS),
                    id = UUID.nameUUIDFromBytes("notifications|${row.packageName}|${row.hourStart}".toByteArray()),
                )
            }
        counts.pruneBefore(to - KEEP.toMillis())
        return CollectResult(events, Instant.ofEpochMilli(to))
    }

    private companion object {
        const val HOUR_MS = 3_600_000L
        val KEEP: Duration = Duration.ofDays(2)
    }
}
