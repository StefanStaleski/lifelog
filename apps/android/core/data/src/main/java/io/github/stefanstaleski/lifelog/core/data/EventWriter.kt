package io.github.stefanstaleski.lifelog.core.data

import io.github.stefanstaleski.lifelog.core.data.db.PendingEventDao
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventEntity
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import java.time.Clock
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

/** The only way events enter the app's store. Timestamps are UTC instants. */
@Singleton
class EventWriter @Inject constructor(
    private val dao: PendingEventDao,
    private val json: Json,
    private val clock: Clock,
) {
    /**
     * Stores one event. Pass a deterministic [id] when the same real-world event may be captured
     * twice (e.g. re-collecting a usage window); a repeat is then ignored.
     * @return true if stored, false if an event with this id already existed.
     */
    suspend fun <T> write(
        type: EventType,
        payload: T,
        serializer: KSerializer<T>,
        occurredAt: Instant = clock.instant(),
        endedAt: Instant? = null,
        id: UUID = UUID.randomUUID(),
    ): Boolean = dao.insert(entity(type, payload, serializer, occurredAt, endedAt, id)) != -1L

    suspend inline fun <reified T> write(
        type: EventType,
        payload: T,
        occurredAt: Instant = now(),
        endedAt: Instant? = null,
        id: UUID = UUID.randomUUID(),
    ): Boolean = write(type, payload, serializer<T>(), occurredAt, endedAt, id)

    /** Stores several events in one transaction; returns how many were new. */
    suspend fun writeAll(events: List<NewEvent<*>>): Int =
        dao.insertAll(events.map { it.toEntity() }).count { it != -1L }

    fun now(): Instant = clock.instant()

    private fun <T> NewEvent<T>.toEntity() = entity(type, payload, serializer, occurredAt, endedAt, id)

    private fun <T> entity(
        type: EventType,
        payload: T,
        serializer: KSerializer<T>,
        occurredAt: Instant,
        endedAt: Instant?,
        id: UUID,
    ) = PendingEventEntity(
        id = id.toString(),
        type = type.wire,
        occurredAt = occurredAt.toEpochMilli(),
        endedAt = endedAt?.toEpochMilli(),
        payload = json.encodeToString(serializer, payload),
        createdAt = clock.millis(),
    )
}

/** An event to store via [EventWriter.writeAll]. */
data class NewEvent<T>(
    val type: EventType,
    val payload: T,
    val serializer: KSerializer<T>,
    val occurredAt: Instant,
    val endedAt: Instant? = null,
    val id: UUID = UUID.randomUUID(),
)
