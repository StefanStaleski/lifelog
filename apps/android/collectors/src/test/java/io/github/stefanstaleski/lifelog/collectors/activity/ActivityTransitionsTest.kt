package io.github.stefanstaleski.lifelog.collectors.activity

import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.DetectedActivity
import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.model.ActivityPayload
import java.time.Instant
import org.junit.Test

class ActivityTransitionsTest {
    private val now = Instant.parse("2026-09-27T08:00:00Z")
    private val elapsedNow = 50_000_000_000_000L // ~14 h since boot
    private fun raw(type: Int, transition: Int, secondsAgo: Long) =
        RawTransition(type, transition, elapsedNow - secondsAgo * 1_000_000_000)

    @Test fun convertsElapsedRealtimeToWallClock() {
        val events = toEvents(listOf(raw(DetectedActivity.WALKING, ActivityTransition.ACTIVITY_TRANSITION_ENTER, 90)), now, elapsedNow)
        assertThat(events.single().occurredAt).isEqualTo(Instant.parse("2026-09-27T07:58:30Z"))
        assertThat(events.single().payload).isEqualTo(ActivityPayload("walking", "enter"))
    }

    @Test fun mapsAllTrackedActivitiesAndDropsOthers() {
        val events = toEvents(
            listOf(
                raw(DetectedActivity.STILL, ActivityTransition.ACTIVITY_TRANSITION_EXIT, 5),
                raw(DetectedActivity.IN_VEHICLE, ActivityTransition.ACTIVITY_TRANSITION_ENTER, 5),
                raw(DetectedActivity.TILTING, ActivityTransition.ACTIVITY_TRANSITION_ENTER, 5),
                raw(DetectedActivity.ON_BICYCLE, 7, 5),
            ),
            now,
            elapsedNow,
        )
        assertThat(events.map { it.payload }).containsExactly(ActivityPayload("still", "exit"), ActivityPayload("in_vehicle", "enter"))
    }

    @Test fun theSameDeliveryTwiceGetsTheSameIdEvenLater() {
        val t = listOf(raw(DetectedActivity.RUNNING, ActivityTransition.ACTIVITY_TRANSITION_ENTER, 30))
        val first = toEvents(t, now, elapsedNow).single().id
        val again = toEvents(t, now.plusSeconds(10), elapsedNow + 10_000_000_000).single().id
        assertThat(again).isEqualTo(first)
    }

    @Test fun trackedKindsMatchTheWireContract() {
        assertThat(TRACKED_ACTIVITIES.values).containsExactly("still", "walking", "running", "on_bicycle", "in_vehicle")
    }
}
