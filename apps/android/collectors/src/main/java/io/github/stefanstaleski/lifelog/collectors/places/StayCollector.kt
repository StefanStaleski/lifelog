package io.github.stefanstaleski.lifelog.collectors.places

import io.github.stefanstaleski.lifelog.collectors.CollectResult
import io.github.stefanstaleski.lifelog.collectors.PolledCollector
import io.github.stefanstaleski.lifelog.core.data.NewEvent
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.StayPayload
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import kotlinx.serialization.serializer

/** Takes one fix per collection run and reports finished stays outside named places. */
class StayCollector @Inject constructor(
    private val location: LocationSource,
    private val store: PlacesStore,
) : PolledCollector {
    override val name = "stays"

    override suspend fun collect(since: Instant, until: Instant): CollectResult {
        val sample = location.current() ?: return CollectResult(emptyList(), until)
        val step = StayDetector.step(store.candidate(), sample, store.places())
        store.saveCandidate(step.next)
        val events = listOfNotNull(step.finished).map { stay ->
            NewEvent(
                type = EventType.STAY,
                payload = StayPayload(stay.lat, stay.lng),
                serializer = serializer<StayPayload>(),
                occurredAt = stay.arrived,
                endedAt = stay.left,
                id = UUID.nameUUIDFromBytes("stay|${stay.arrived.toEpochMilli()}|${stay.lat}|${stay.lng}".toByteArray()),
            )
        }
        return CollectResult(events, until)
    }
}
