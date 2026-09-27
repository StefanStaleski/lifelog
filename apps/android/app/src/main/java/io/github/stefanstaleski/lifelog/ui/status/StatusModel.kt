package io.github.stefanstaleski.lifelog.ui.status

import io.github.stefanstaleski.lifelog.core.data.SyncStatus
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventEntity
import io.github.stefanstaleski.lifelog.core.data.model.AppUsagePayload
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.StepsPayload
import io.github.stefanstaleski.lifelog.collectors.health.HealthAccess
import io.github.stefanstaleski.lifelog.sync.DeviceStatus
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlinx.serialization.json.Json

enum class Health { GOOD, ATTENTION, PAUSED }

/** What the user can tap to fix a problem. */
enum class Fix { USAGE_ACCESS, BATTERY, NOTIFICATIONS, HEALTH_CONNECT, ACTIVITY, LOCATION, AUTO_REVOKE, APP_INFO, NOTIFICATION_ACCESS, SAMSUNG_BATTERY, SAMSUNG_BATTERY_DONE, SYNC_NOW, NONE }

data class Problem(
    val emoji: String,
    val title: String,
    val detail: String,
    val fix: Fix,
    val action: String?,
    /** Optional second button, e.g. "I've done it" for checks Android can't verify. */
    val secondary: Pair<String, Fix>? = null,
)

data class AppTime(val label: String, val minutes: Int)

data class TodaySummary(val screenTimeMin: Int, val unlocks: Int, val topApps: List<AppTime>, val steps: Int? = null) {
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
        // An hour can be sent again with a higher count (late sync): keep the largest per hour.
        steps = todays.filter { it.type == EventType.STEPS.wire }
            .groupBy { it.occurredAt }
            .values
            .sumOf { versions -> versions.maxOf { json.decodeFromString<StepsPayload>(it.payload).steps } }
            .takeIf { todays.any { it.type == EventType.STEPS.wire } },
    )
}

/** Sources shown on the phone, with how long each may be quiet before it looks wrong. */
private data class SourceSpec(val types: List<String>, val emoji: String, val name: String, val quietOk: Duration, val hint: String) {
    constructor(type: String, emoji: String, name: String, quietOk: Duration, hint: String) :
        this(listOf(type), emoji, name, quietOk, hint)
}

private val sourceSpecs = listOf(
    SourceSpec(EventType.APP_USAGE.wire, "📱", "Screen time", Duration.ofHours(24), "Counted in 30-minute blocks"),
    SourceSpec(EventType.UNLOCK.wire, "🔓", "Unlocks", Duration.ofHours(24), "Each time you unlock the phone"),
    SourceSpec(EventType.STEPS.wire, "👟", "Steps", Duration.ofHours(24), "Hourly, from Health Connect"),
    SourceSpec(EventType.NOTIFICATIONS.wire, "🔔", "Notifications", Duration.ofHours(24), "How many arrive, per app"),
    SourceSpec(EventType.ACTIVITY.wire, "🚶", "Movement", Duration.ofHours(24), "Walking, driving, still"),
    SourceSpec(listOf(EventType.GEOFENCE.wire, EventType.STAY.wire), "📍", "Places", Duration.ofDays(3), "Arrivals, departures and longer stops"),
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
    samsungSleepChecked: Boolean = true,
): StatusUi {
    val problems = buildList {
        if (!device.usageAccessGranted) {
            add(Problem("📊", "Usage access is off", "Lifelog can't count screen time or unlocks without it.", Fix.USAGE_ACCESS, "Turn on"))
        }
        if (!device.batteryOptimizationIgnored) {
            add(Problem("🔋", "Battery saver may pause Lifelog", "Allow it to run in the background so no data is missed.", Fix.BATTERY, "Allow"))
        }
        if (device.standbyRestricted == true) {
            add(Problem("🧊", "Android is holding Lifelog back", "It's in the restricted battery group. In App info → Battery, choose Unrestricted.", Fix.APP_INFO, "Open"))
        }
        if (device.autoRevokeExempt == false) {
            add(Problem("🗝️", "Permissions may be removed", "Android removes permissions from apps you don't open. Turn that off for Lifelog.", Fix.AUTO_REVOKE, "Turn off"))
        }
        if (device.isSamsung && !samsungSleepChecked) {
            add(
                Problem(
                    "🛌", "Keep Lifelog awake on Samsung",
                    "Battery → Background usage limits → Never sleeping apps → add Lifelog.",
                    Fix.SAMSUNG_BATTERY, "Open",
                    secondary = "I've done it" to Fix.SAMSUNG_BATTERY_DONE,
                ),
            )
        }
        if (device.healthConnect == HealthAccess.NOT_GRANTED) {
            add(Problem("👟", "Steps are off", "Allow Lifelog to read steps and distance from Health Connect.", Fix.HEALTH_CONNECT, "Allow"))
        }
        if (device.activityRecognitionGranted == false) {
            add(Problem("🚶", "Movement detection is off", "Allow physical activity so Lifelog knows when you walk, drive or rest.", Fix.ACTIVITY, "Allow"))
        }
        if (device.locationGranted == false) {
            add(Problem("📍", "Places are off", "Allow location so Lifelog can count time at home, work and the gym.", Fix.LOCATION, "Allow"))
        } else if (device.backgroundLocationGranted == false) {
            add(Problem("📍", "Location only while using the app", "Choose \"Allow all the time\" so arrivals are noticed in the background.", Fix.LOCATION, "Allow"))
        }
        if (device.notificationListenerGranted == false) {
            add(Problem("🔔", "Notification counts are off", "Allow notification access so Lifelog can count them. It never reads what they say.", Fix.NOTIFICATION_ACCESS, "Allow"))
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
        val last = spec.types.mapNotNull { lastByType[it] }.maxOrNull()
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
