package io.github.stefanstaleski.lifelog.core.data

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.db.LifelogDatabase
import io.github.stefanstaleski.lifelog.core.data.model.AppUsagePayload
import io.github.stefanstaleski.lifelog.core.data.model.CheckinPayload
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.HeartbeatPayload
import io.github.stefanstaleski.lifelog.core.data.model.UnlockPayload
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.serializer
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class EventWriterTest {
    private lateinit var db: LifelogDatabase
    private lateinit var writer: EventWriter

    @Before fun setUp() {
        db = inMemoryDb()
        writer = EventWriter(db.pendingEventDao(), LifelogJson, fixedClock("2026-09-27T08:00:00Z"))
    }

    @After fun tearDown() = db.close()

    private suspend fun stored() = db.pendingEventDao().pendingBatch(100)
    private fun json(s: String): JsonObject = Json.parseToJsonElement(s).jsonObject

    @Test fun defaultsToNowInUtcAndRandomId() = runTest {
        writer.write(EventType.UNLOCK, UnlockPayload())
        val e = stored().single()
        assertThat(e.type).isEqualTo("unlock")
        assertThat(e.occurredAt).isEqualTo(Instant.parse("2026-09-27T08:00:00Z").toEpochMilli())
        assertThat(e.endedAt).isNull()
        assertThat(UUID.fromString(e.id).version()).isEqualTo(4)
        assertThat(e.payload).isEqualTo("{}")
        assertThat(e.uploaded).isFalse()
    }

    @Test fun sameIdTwiceIsStoredOnce() = runTest {
        val id = UUID.randomUUID()
        assertThat(writer.write(EventType.UNLOCK, UnlockPayload(), id = id)).isTrue()
        assertThat(writer.write(EventType.UNLOCK, UnlockPayload(), id = id)).isFalse()
        assertThat(stored()).hasSize(1)
    }

    @Test fun appUsageUsesWireNamesAndExplicitNull() = runTest {
        writer.write(
            EventType.APP_USAGE,
            AppUsagePayload("com.example.chat", "Chat", null, foregroundMs = 754_000, launches = 6),
            occurredAt = Instant.parse("2026-09-27T08:00:00Z"),
            endedAt = Instant.parse("2026-09-27T08:30:00Z"),
        )
        val e = stored().single()
        assertThat(e.endedAt).isEqualTo(Instant.parse("2026-09-27T08:30:00Z").toEpochMilli())
        assertThat(json(e.payload)).isEqualTo(
            json("""{"package":"com.example.chat","app_label":"Chat","category":null,"foreground_ms":754000,"launches":6}"""),
        )
    }

    @Test fun checkinAndHeartbeatPayloads() = runTest {
        writer.write(EventType.CHECKIN, CheckinPayload("2026-09-27", 4, 3, 5, listOf("gym"), null))
        writer.write(EventType.HEARTBEAT, HeartbeatPayload("0.1.0", 12, false, true, false))
        val (checkin, heartbeat) = stored().sortedBy { it.type }
        assertThat(json(checkin.payload)).isEqualTo(
            json("""{"date":"2026-09-27","mood":4,"energy":3,"focus":5,"tags":["gym"],"note":null}"""),
        )
        assertThat(json(heartbeat.payload)).isEqualTo(
            json(
                """{"app_version":"0.1.0","pending_count":12,"collection_paused":false,
                   "usage_access_granted":true,"battery_optimization_ignored":false}""",
            ),
        )
    }

    @Test fun writeAllCountsOnlyNewEvents() = runTest {
        val id = UUID.randomUUID()
        val at = Instant.parse("2026-09-27T07:00:00Z")
        val unlock = NewEvent(EventType.UNLOCK, UnlockPayload(), serializer(), at, id = id)
        assertThat(writer.writeAll(listOf(unlock))).isEqualTo(1)
        assertThat(writer.writeAll(listOf(unlock, unlock.copy(id = UUID.randomUUID())))).isEqualTo(1)
    }
}
