package io.github.stefanstaleski.lifelog.core.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/*
 * Event payloads, field for field the same as the zod schemas in packages/shared/src/events.ts.
 * Nullable fields are always encoded (the server expects the key with a null value).
 */

/** Foreground time of one app within one collection window (the event's occurred_at..ended_at). */
@Serializable
data class AppUsagePayload(
    @SerialName("package") val packageName: String,
    @SerialName("app_label") val appLabel: String,
    val category: String?,
    @SerialName("foreground_ms") val foregroundMs: Long,
    val launches: Int,
)

/** An unlock carries no data beyond its timestamp. */
@Serializable
class UnlockPayload {
    override fun equals(other: Any?) = other is UnlockPayload
    override fun hashCode() = 0
}

@Serializable
data class CheckinPayload(
    /** Local date (Europe/Skopje, ISO yyyy-MM-dd) the check-in is about. */
    val date: String,
    val mood: Int,
    val energy: Int,
    val focus: Int,
    val tags: List<String>,
    val note: String?,
)

@Serializable
data class HeartbeatPayload(
    @SerialName("app_version") val appVersion: String,
    @SerialName("pending_count") val pendingCount: Int,
    @SerialName("collection_paused") val collectionPaused: Boolean,
    @SerialName("usage_access_granted") val usageAccessGranted: Boolean,
    @SerialName("battery_optimization_ignored") val batteryOptimizationIgnored: Boolean,
)
