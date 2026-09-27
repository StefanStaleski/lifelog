package io.github.stefanstaleski.lifelog.core.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A named place from the dashboard (via /api/v1/config), geofenced on the phone. */
@Serializable
data class KnownPlace(
    val id: String,
    val name: String,
    val kind: String,
    val lat: Double,
    val lng: Double,
    @SerialName("radius_m") val radiusM: Int,
)
