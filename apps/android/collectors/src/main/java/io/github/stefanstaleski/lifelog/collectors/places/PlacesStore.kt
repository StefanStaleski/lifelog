package io.github.stefanstaleski.lifelog.collectors.places

import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.model.KnownPlace
import javax.inject.Inject
import kotlinx.serialization.json.Json

/** Named places from the server and the stay in progress, persisted between runs. */
class PlacesStore @Inject constructor(private val settings: LifelogSettings, private val json: Json) {
    suspend fun places(): List<KnownPlace> =
        settings.readString(PLACES)?.let { runCatching { json.decodeFromString<List<KnownPlace>>(it) }.getOrNull() } ?: emptyList()

    /** @return true when the list changed (geofences must be re-registered). */
    suspend fun savePlaces(places: List<KnownPlace>): Boolean {
        val encoded = json.encodeToString(places.sortedBy { it.id })
        if (encoded == settings.readString(PLACES)) return false
        settings.writeString(PLACES, encoded)
        return true
    }

    suspend fun candidate(): StayCandidate? =
        settings.readString(CANDIDATE)?.let { runCatching { json.decodeFromString<StayCandidate>(it) }.getOrNull() }

    suspend fun saveCandidate(c: StayCandidate?) = settings.writeString(CANDIDATE, c?.let { json.encodeToString(it) })

    private companion object {
        const val PLACES = "known_places"
        const val CANDIDATE = "stay_candidate"
    }
}
