package io.github.stefanstaleski.lifelog.core.data.db

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/**
 * Every captured event, written here before any network call (local-first).
 * Timestamps are epoch milliseconds, UTC. `payload` is the JSON payload object.
 */
@Entity(
    tableName = "pending_events",
    indices = [Index("uploaded", "occurred_at"), Index("type", "occurred_at")],
)
data class PendingEventEntity(
    /** UUID generated on the device; the server dedupes on it. */
    @PrimaryKey val id: String,
    val type: String,
    @ColumnInfo(name = "occurred_at") val occurredAt: Long,
    @ColumnInfo(name = "ended_at") val endedAt: Long?,
    val payload: String,
    val uploaded: Boolean = false,
    @ColumnInfo(name = "created_at") val createdAt: Long,
)

/** Latest captured event of one type, for the status screen. */
data class LastEventByType(
    val type: String,
    @ColumnInfo(name = "last_occurred_at") val lastOccurredAt: Long,
)
