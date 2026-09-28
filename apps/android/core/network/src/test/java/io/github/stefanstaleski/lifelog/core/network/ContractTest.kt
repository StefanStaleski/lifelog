package io.github.stefanstaleski.lifelog.core.network

import com.google.common.truth.Truth.assertThat
import com.google.common.truth.Truth.assertWithMessage
import io.github.stefanstaleski.lifelog.core.data.LifelogJson
import io.github.stefanstaleski.lifelog.core.data.model.ActivityPayload
import io.github.stefanstaleski.lifelog.core.data.model.AppUsagePayload
import io.github.stefanstaleski.lifelog.core.data.model.CallPayload
import io.github.stefanstaleski.lifelog.core.data.model.CheckinPayload
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.GeofencePayload
import io.github.stefanstaleski.lifelog.core.data.model.HeartbeatPayload
import io.github.stefanstaleski.lifelog.core.data.model.MessagesPayload
import io.github.stefanstaleski.lifelog.core.data.model.NotificationsPayload
import io.github.stefanstaleski.lifelog.core.data.model.ScreenPayload
import io.github.stefanstaleski.lifelog.core.data.model.SmsPayload
import io.github.stefanstaleski.lifelog.core.data.model.StayPayload
import io.github.stefanstaleski.lifelog.core.data.model.StepsPayload
import io.github.stefanstaleski.lifelog.core.data.model.UnlockPayload
import io.github.stefanstaleski.lifelog.core.network.model.ConfigResponse
import io.github.stefanstaleski.lifelog.core.network.model.HealthResponse
import io.github.stefanstaleski.lifelog.core.network.model.IngestResponse
import io.github.stefanstaleski.lifelog.core.network.model.WireEvent
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.serializer
import org.junit.Test

/** The Kotlin models must read and write exactly what the shared fixtures contain. */
class ContractTest {
    private val strict = Json // fails on unknown keys, unlike the app's lenient settings

    /** Sent only by the laptop's desktop collector, never by the phone. */
    private val DESKTOP_ONLY = setOf("desktop_usage", "desktop_heartbeat")

    private fun payloadSerializer(type: String): KSerializer<*> = when (EventType.fromWire(type)) {
        EventType.APP_USAGE -> serializer<AppUsagePayload>()
        EventType.UNLOCK -> serializer<UnlockPayload>()
        EventType.CHECKIN -> serializer<CheckinPayload>()
        EventType.HEARTBEAT -> serializer<HeartbeatPayload>()
        EventType.STEPS -> serializer<StepsPayload>()
        EventType.ACTIVITY -> serializer<ActivityPayload>()
        EventType.SCREEN -> serializer<ScreenPayload>()
        EventType.GEOFENCE -> serializer<GeofencePayload>()
        EventType.STAY -> serializer<StayPayload>()
        EventType.NOTIFICATIONS -> serializer<NotificationsPayload>()
        EventType.CALL -> serializer<CallPayload>()
        EventType.SMS -> serializer<SmsPayload>()
        EventType.MESSAGES -> serializer<MessagesPayload>()
        null -> error("unknown event type $type")
    }

    /** Fixtures of the event types the phone sends (the laptop's desktop_* types are skipped). */
    private fun phoneEvents() = Fixtures.validEvents().filter { (_, text) ->
        strict.decodeFromString<WireEvent>(text).type !in DESKTOP_ONLY
    }

    @Test fun everyEventTypeHasAFixture() {
        val all = Fixtures.validEvents().values.map { strict.decodeFromString<WireEvent>(it).type }.toSet()
        assertThat(all).containsAtLeastElementsIn(DESKTOP_ONLY) // keeps DESKTOP_ONLY honest
        assertThat(all - DESKTOP_ONLY).containsExactlyElementsIn(EventType.entries.map { it.wire })
    }

    @Test fun validEventFixturesRoundTrip() {
        for ((name, text) in phoneEvents()) {
            val original = strict.parseToJsonElement(text)
            val event = strict.decodeFromString<WireEvent>(text)

            // Payload decodes into the typed model (strictly) and re-encodes identically.
            @Suppress("UNCHECKED_CAST")
            val ser = payloadSerializer(event.type) as KSerializer<Any>
            val typed = strict.decodeFromJsonElement(ser, event.payload)
            val reencodedPayload = LifelogJson.encodeToJsonElement(ser, typed)
            assertWithMessage("$name payload").that(reencodedPayload).isEqualTo(event.payload)

            val reencoded: JsonElement = WireJson.encodeToJsonElement(WireEvent.serializer(), event)
            assertWithMessage(name).that(reencoded).isEqualTo(original)
        }
    }

    @Test fun apiResponseFixturesDecode() {
        val ingest = strict.decodeFromString<IngestResponse>(Fixtures.api("ingest-response.json"))
        assertThat(ingest.rejected.single().index).isEqualTo(17)

        val config = strict.decodeFromString<ConfigResponse>(Fixtures.api("config-response.json"))
        assertThat(config.checkinTime).isEqualTo("21:30")
        assertThat(config.places.single().radiusM).isEqualTo(120)
        assertThat(config.contactSalt).matches("[0-9a-f]{64}")

        val health = strict.decodeFromString<HealthResponse>(Fixtures.api("health-response.json"))
        assertThat(health.sources.map { it.source }).containsExactly("heartbeat", "ingest").inOrder()
        assertThat(health.sources[1].staleAfterMin).isNull()
    }
}
