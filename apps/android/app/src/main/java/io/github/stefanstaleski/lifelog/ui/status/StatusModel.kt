package io.github.stefanstaleski.lifelog.ui.status

import io.github.stefanstaleski.lifelog.core.data.SyncStatus
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventEntity
import io.github.stefanstaleski.lifelog.core.data.model.AppUsagePayload
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.sync.DeviceStatus
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.serialization.json.Json

enum class Health { GOOD, ATTENTION, PAUSED }

/** What the user can tap to fix a problem. */
enum class Fix { USAGE_ACCESS, BATTERY, NOTIFICATIONS, SYNC_NOW, NONE }

data class Problem(val emoji: String, val title: String, val detail: String, val fix: Fix, val action: String?)

data class AppTime(val label: String, val minutes: Int)

data class TodaySummary(val screenTimeMin: Int, val unlocks: Int, val topApps: List<AppTime>) {
    companion object {
        val EMPTY = TodaySummary(0, 0, emptyList())
    }
}

data class SourceRow(val emoji: String, val name: String, val lastSeen: Instant?, val fresh: Boolean, val hint: String)

data class StatusUi(
    val health: Health,
    val headline: String,
    val subline: String,
    val problems: List<Problem>,
    val today: TodaySummary,
    val sources: List<SourceRow>,
    val pending: Int,
    val lastUploadAt: Instant?,
    val paused: Boolean,
)

/** Screen time, unlocks and top apps for [today] (local), from events still on the phone. */
fun todaySummary(events: List<PendingEventEntity>, today: LocalDate, zone: ZoneId, json: Json): TodaySummary {
    val todays = events.filter { Instant.ofEpochMilli(it.occurredAt).atZone(zone).toLocalDate() == today }
    val perApp = todays
        .filter { it.type == EventType.APP_USAGE.wire }
        .map { json.decodeFromString<AppUsagePayload>(it.payload) }
        .groupBy { it.packageName }
        .map { (_, windows) -> windows.last().appLabel to windows.sumOf { it.foregroundMs } }
    val totalMs = perApp.sumOf { it.second }
    return TodaySummary(
        screenTimeMin = (totalMs / 60_000).toInt(),
        unlocks = todays.count { it.type == EventType.UNLOCK.wire },
        topApps = perApp.sortedWith(compareByDescending<Pair<String, Long>> { it.second }.thenBy { it.first })
            .take(3)
            .map { (label, ms) -> AppTime(label, (ms / 60_000).toInt()) }
            .filter { it.minutes > 0 },
    )
}

/** Sources shown on the phone, with how long each may be quiet before it looks wrong. */
private data class SourceSpec(val type: String, val emoji: String, val name: String, val quietOk: Duration, val hint: String)

private val sourceSpecs = listOf(
    SourceSpec(EventType.APP_USAGE.wire, "📱", "Screen time", Duration.ofHours(24), "Counted in 30-minute blocks"),
    SourceSpec(EventType.UNLOCK.wire, "🔓", "Unlocks", Duration.ofHours(24), "Each time you unlock the phone"),
    SourceSpec(EventType.CHECKIN.wire, "🌙", "Evening check-in", Duration.ofHours(48), "Once a day, at 21:30"),
    SourceSpec(EventType.HEARTBEAT.wire, "💓", "Background check", Duration.ofHours(2), "Lifelog checking in every 30 min"),
)

fun buildStatusUi(
    now: Instant,
    paused: Boolean,
    device: DeviceStatus,
    notificationsAllowed: Boolean,
    sync: SyncStatus,
    pending: Int,
    lastByType: Map<String, Instant>,
    today: TodaySummary,
): StatusUi {
    val problems = buildList {
        if (!device.usageAccessGranted) {
            add(Problem("📊", "Usage access is off", "Lifelog can't count screen time or unlocks without it.", Fix.USAGE_ACCESS, "Turn on"))
        }
        if (!device.batteryOptimizationIgnored) {
            add(Problem("🔋", "Battery saver may pause Lifelog", "Allow it to run in the background so no data is missed.", Fix.BATTERY, "Allow"))
        }
        if (!notificationsAllowed) {
            add(Problem("🔔", "Reminders are off", "You won't get the 21:30 check-in nudge.", Fix.NOTIFICATIONS, "Turn on"))
        }
        val lastOk = sync.lastSuccessAt
        if (sync.lastError != null && (lastOk == null || Duration.between(lastOk, now) > Duration.ofHours(3))) {
            add(Problem("☁️", "Uploads are failing", sync.lastError!!, Fix.SYNC_NOW, "Try again"))
        }
        sync.lastCollectError?.let { add(Problem("🧩", "A data source had a hiccup", it, Fix.NONE, null)) }
    }

    val sources = sourceSpecs.map { spec ->
        val last = lastByType[spec.type]
        SourceRow(spec.emoji, spec.name, last, fresh = last != null && Duration.between(last, now) <= spec.quietOk, spec.hint)
    }

    val health = when {
        paused -> Health.PAUSED
        problems.isNotEmpty() -> Health.ATTENTION
        else -> Health.GOOD
    }
    val (headline, subline) = when (health) {
        Health.PAUSED -> "Paused" to "Nothing is being recorded until you resume."
        Health.ATTENTION -> (if (problems.size == 1) "One thing needs you" else "${problems.size} things need you") to
            "Tap a card below to fix it."
        Health.GOOD -> "All good" to "Lifelog is quietly collecting in the background."
    }
    return StatusUi(health, headline, subline, problems, today, sources, pending, sync.lastSuccessAt, paused)
}
