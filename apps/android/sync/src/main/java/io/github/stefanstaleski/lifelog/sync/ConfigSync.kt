package io.github.stefanstaleski.lifelog.sync

import io.github.stefanstaleski.lifelog.collectors.places.Geofencer
import io.github.stefanstaleski.lifelog.collectors.places.PlacesStore
import io.github.stefanstaleski.lifelog.core.data.model.KnownPlace
import io.github.stefanstaleski.lifelog.core.network.LifelogApi
import javax.inject.Inject

fun interface ConfigRefresher {
    suspend fun refresh()
}

/** Pulls /api/v1/config; when the named places changed, re-registers geofences. */
class ConfigSync @Inject constructor(
    private val api: LifelogApi,
    private val store: PlacesStore,
    private val geofencer: Geofencer,
) : ConfigRefresher {
    override suspend fun refresh() {
        val places = api.config().places.map { KnownPlace(it.id, it.name, it.kind, it.lat, it.lng, it.radiusM) }
        if (store.savePlaces(places)) geofencer.register(places)
    }
}
