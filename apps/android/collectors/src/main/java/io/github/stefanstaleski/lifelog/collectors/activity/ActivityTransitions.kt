package io.github.stefanstaleski.lifelog.collectors.activity

import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.DetectedActivity
import io.github.stefanstaleski.lifelog.core.data.NewEvent
import io.github.stefanstaleski.lifelog.core.data.model.ActivityPayload
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import java.time.Instant
import java.util.UUID
import kotlinx.serialization.serializer

/** Activities we ask for, with their wire names (see ACTIVITY_KINDS in packages/shared). */
val TRACKED_ACTIVITIES: Map<Int, String> = mapOf(
    DetectedActivity.STILL to "still",
    DetectedActivity.WALKING to "walking",
    DetectedActivity.RUNNING to "running",
    DetectedActivity.ON_BICYCLE to "on_bicycle",
    DetectedActivity.IN_VEHICLE to "in_vehicle",
)

/** One transition as delivered by Play Services, before conversion. */
data class RawTransition(val activityType: Int, val transitionType: Int, val elapsedRealtimeNanos: Long)

/**
 * Converts transitions to events. Play Services stamps them with elapsed realtime (time since boot),
 * so wall-clock time is `now - (elapsedNow - elapsedAtEvent)`. Ids come from the content because
 * the same transition can be delivered twice.
 */
fun toEvents(raw: List<RawTransition>, now: Instant, elapsedNowNanos: Long): List<NewEvent<ActivityPayload>> =
    raw.mapNotNull { t ->
        val kind = TRACKED_ACTIVITIES[t.activityType] ?: return@mapNotNull null
        val transition = when (t.transitionType) {
            ActivityTransition.ACTIVITY_TRANSITION_ENTER -> "enter"
            ActivityTransition.ACTIVITY_TRANSITION_EXIT -> "exit"
            else -> return@mapNotNull null
        }
        val ageMs = ((elapsedNowNanos - t.elapsedRealtimeNanos) / 1_000_000).coerceAtLeast(0)
        val at = now.minusMillis(ageMs)
        NewEvent(
            type = EventType.ACTIVITY,
            payload = ActivityPayload(kind, transition),
            serializer = serializer<ActivityPayload>(),
            occurredAt = at,
            id = UUID.nameUUIDFromBytes("activity|$kind|$transition|${t.elapsedRealtimeNanos}".toByteArray()),
        )
    }
