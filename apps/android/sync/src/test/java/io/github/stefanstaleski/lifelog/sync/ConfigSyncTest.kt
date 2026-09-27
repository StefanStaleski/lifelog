package io.github.stefanstaleski.lifelog.sync

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.collectors.places.Geofencer
import io.github.stefanstaleski.lifelog.collectors.places.PlacesStore
import io.github.stefanstaleski.lifelog.core.data.LifelogJson
import io.github.stefanstaleski.lifelog.core.data.model.KnownPlace
import io.github.stefanstaleski.lifelog.core.network.LifelogApi
import io.github.stefanstaleski.lifelog.core.network.model.ConfigResponse
import io.github.stefanstaleski.lifelog.core.network.model.EventBatchRequest
import io.github.stefanstaleski.lifelog.core.network.model.HealthResponse
import io.github.stefanstaleski.lifelog.core.network.model.IngestResponse
import io.github.stefanstaleski.lifelog.core.network.model.Place
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class ConfigSyncTest {
    @get:Rule val tmp = TemporaryFolder()

    private var places = listOf(Place("p1", "Home", "home", 41.99, 21.42, 120))
    private val api = object : LifelogApi {
        override suspend fun uploadBatch(batch: EventBatchRequest): IngestResponse = error("unused")
        override suspend fun config() = ConfigResponse("Europe/Skopje", 30, 500, "21:30", places)
        override suspend fun health(): HealthResponse = error("unused")
    }
    private val registered = mutableListOf<List<KnownPlace>>()
    private val geofencer = object : Geofencer {
        override fun register(places: List<KnownPlace>) { registered += places }
        override suspend fun registerStored() = Unit
    }

    @Test fun reRegistersGeofencesOnlyWhenPlacesChange() = runTest {
        val store = PlacesStore(testSettings(tmp.root), LifelogJson)
        val sync = ConfigSync(api, store, geofencer)

        sync.refresh()
        sync.refresh() // same places: nothing to do
        assertThat(registered).containsExactly(listOf(KnownPlace("p1", "Home", "home", 41.99, 21.42, 120)))
        assertThat(store.places().single().name).isEqualTo("Home")

        places = places + Place("p2", "Office", "work", 42.0, 21.43, 200)
        sync.refresh()
        assertThat(registered).hasSize(2)
        assertThat(registered.last().map { it.id }).containsExactly("p1", "p2")
    }
}
