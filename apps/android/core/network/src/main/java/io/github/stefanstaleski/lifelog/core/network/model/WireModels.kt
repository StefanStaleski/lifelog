package io.github.stefanstaleski.lifelog.core.network.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject

/*
 * Request/response bodies of the /api/v1 routes, matching packages/shared/src/events.ts and
 * packages/shared/src/api.ts. Examples: packages/shared/fixtures.
 */

/** One event as sent to the server. `ended_at` must be omitted (not null) when absent. */
@Serializable
data class WireEvent(
    val id: String,
    val type: String,
    @SerialName("occurred_at") val occurredAt: String,
    @SerialName("ended_at") val endedAt: String? = null,
    @SerialName("device_id") val deviceId: String,
    val payload: JsonObject,
)

@Serializable
data class EventBatchRequest(val events: List<WireEvent>)

@Serializable
data class IngestResponse(
    val accepted: Int,
    val duplicates: Int,
    val rejected: List<RejectedEvent>,
)

@Serializable
data class RejectedEvent(val index: Int, val id: String?, val error: String)

@Serializable
data class Place(
    val id: String,
    val name: String,
    val kind: String,
    val lat: Double,
    val lng: Double,
    @SerialName("radius_m") val radiusM: Int,
)

@Serializable
data class ConfigResponse(
    @SerialName("time_zone") val timeZone: String,
    @SerialName("collection_interval_min") val collectionIntervalMin: Int,
    @SerialName("upload_batch_size") val uploadBatchSize: Int,
    /** Local time, HH:mm. */
    @SerialName("checkin_time") val checkinTime: String,
    val places: List<Place>,
    /**
     * HMAC-SHA256 key (64 hex) for contact and sender hashes; never changes. Always sent by the
     * server; nullable only so an app update can talk to a server that predates it.
     */
    @SerialName("contact_salt") val contactSalt: String? = null,
)

@Serializable
data class SourceHealth(
    val source: String,
    @SerialName("last_event_at") val lastEventAt: String,
    @SerialName("last_error") val lastError: String?,
    @SerialName("stale_after_min") val staleAfterMin: Int?,
    val stale: Boolean,
    val details: JsonObject?,
)

@Serializable
data class HealthResponse(
    @SerialName("generated_at") val generatedAt: String,
    val sources: List<SourceHealth>,
)
