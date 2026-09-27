package io.github.stefanstaleski.lifelog.core.data.model

import kotlinx.serialization.EncodeDefault
import kotlinx.serialization.ExperimentalSerializationApi
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

/** Phase 2 fields are optional on the server, so they are left out (not null) when unknown. */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
data class HeartbeatPayload(
    @SerialName("app_version") val appVersion: String,
    @SerialName("pending_count") val pendingCount: Int,
    @SerialName("collection_paused") val collectionPaused: Boolean,
    @SerialName("usage_access_granted") val usageAccessGranted: Boolean,
    @SerialName("battery_optimization_ignored") val batteryOptimizationIgnored: Boolean,
    @EncodeDefault(EncodeDefault.Mode.NEVER) val charging: Boolean? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) @SerialName("battery_pct") val batteryPct: Int? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) @SerialName("health_connect_granted") val healthConnectGranted: Boolean? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) @SerialName("activity_recognition_granted") val activityRecognitionGranted: Boolean? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) @SerialName("location_granted") val locationGranted: Boolean? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) @SerialName("background_location_granted") val backgroundLocationGranted: Boolean? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) @SerialName("notification_listener_granted") val notificationListenerGranted: Boolean? = null,
    @EncodeDefault(EncodeDefault.Mode.NEVER) @SerialName("auto_revoke_exempt") val autoRevokeExempt: Boolean? = null,
)

/** One finished UTC hour of Health Connect data (the event's occurred_at..ended_at). */
@Serializable
data class StepsPayload(
    val steps: Int,
    @SerialName("distance_m") val distanceM: Int,
)

/** Activity Recognition transition. [activity]: still, walking, running, on_bicycle, in_vehicle. */
@Serializable
data class ActivityPayload(
    val activity: String,
    /** "enter" or "exit" */
    val transition: String,
)

@Serializable
data class ScreenPayload(
    /** "on" or "off" */
    val state: String,
)

@Serializable
data class GeofencePayload(
    @SerialName("place_id") val placeId: String,
    /** "enter" or "exit" */
    val transition: String,
)

/** A 15+ minute stay outside named places; coordinates rounded to 3 decimals (~100 m). */
@Serializable
data class StayPayload(val lat: Double, val lng: Double)
