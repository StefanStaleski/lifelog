package io.github.stefanstaleski.lifelog.collectors.places

import com.google.android.gms.location.Geofence
import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.model.GeofencePayload
import java.time.Instant
import org.junit.Test

class GeofenceEventsTest {
    private val at = Instant.parse("2026-09-27T07:40:00Z")

    @Test fun enterAndExitForEachTriggeringPlace() {
        val events = geofenceEvents(listOf("a", "b"), Geofence.GEOFENCE_TRANSITION_ENTER, at)
        assertThat(events.map { it.payload }).containsExactly(GeofencePayload("a", "enter"), GeofencePayload("b", "enter"))
        assertThat(geofenceEvents(listOf("a"), Geofence.GEOFENCE_TRANSITION_EXIT, at).single().payload.transition).isEqualTo("exit")
    }

    @Test fun dwellIsIgnoredAndRepeatsKeepTheirId() {
        assertThat(geofenceEvents(listOf("a"), Geofence.GEOFENCE_TRANSITION_DWELL, at)).isEmpty()
        assertThat(geofenceEvents(listOf("a"), Geofence.GEOFENCE_TRANSITION_ENTER, at).single().id)
            .isEqualTo(geofenceEvents(listOf("a"), Geofence.GEOFENCE_TRANSITION_ENTER, at).single().id)
    }
}
