package io.github.stefanstaleski.lifelog.core.network

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventEntity
import java.time.Instant
import kotlinx.serialization.json.Json
import org.junit.Test

class EventMapperTest {
    private fun ms(iso: String) = Instant.parse(iso).toEpochMilli()

    @Test fun unlockHasNoEndedAtKeyAndMillisecondsSurvive() {
        val entity = PendingEventEntity(
            id = "048bea5e-dcee-4b46-891c-075eb53d5453",
            type = "unlock",
            occurredAt = ms("2026-09-27T06:42:13.512Z"),
            endedAt = null,
            payload = "{}",
            createdAt = 0,
        )
        val json = WireJson.encodeToString(entity.toWire("s24"))
        assertThat(Json.parseToJsonElement(json)).isEqualTo(
            Json.parseToJsonElement(
                """{"id":"048bea5e-dcee-4b46-891c-075eb53d5453","type":"unlock",
                   "occurred_at":"2026-09-27T06:42:13.512Z","device_id":"s24","payload":{}}""",
            ),
        )
    }

    @Test fun appUsageKeepsEndedAtAndPayloadNulls() {
        val entity = PendingEventEntity(
            id = "217c9a8e-c706-4219-9ba3-97e8f841b0a2",
            type = "app_usage",
            occurredAt = ms("2026-09-27T21:30:00Z"),
            endedAt = ms("2026-09-27T22:00:00Z"),
            payload = """{"package":"com.example.reader","app_label":"Reader","category":null,"foreground_ms":1800000,"launches":1}""",
            createdAt = 0,
        )
        val wire = entity.toWire("s24")
        assertThat(wire.occurredAt).isEqualTo("2026-09-27T21:30:00Z")
        assertThat(wire.endedAt).isEqualTo("2026-09-27T22:00:00Z")
        assertThat(WireJson.encodeToString(wire)).contains("\"category\":null")
    }
}
