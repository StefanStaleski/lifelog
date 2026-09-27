package io.github.stefanstaleski.lifelog.core.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Dao
interface PendingEventDao {
    /** Returns the row id, or -1 when an event with the same id already exists. */
    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insert(event: PendingEventEntity): Long

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertAll(events: List<PendingEventEntity>): List<Long>

    /** Oldest not-yet-uploaded events first. */
    @Query("SELECT * FROM pending_events WHERE uploaded = 0 ORDER BY occurred_at, id LIMIT :limit")
    suspend fun pendingBatch(limit: Int): List<PendingEventEntity>

    @Query("UPDATE pending_events SET uploaded = 1 WHERE id IN (:ids)")
    suspend fun markUploaded(ids: List<String>): Int

    @Query("SELECT COUNT(*) FROM pending_events WHERE uploaded = 0")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT COUNT(*) FROM pending_events WHERE uploaded = 0")
    suspend fun pendingCount(): Int

    @Query("SELECT type, MAX(occurred_at) AS last_occurred_at FROM pending_events GROUP BY type")
    fun observeLastEventByType(): Flow<List<LastEventByType>>

    /** Drops uploaded events older than [before] (epoch ms); pending ones are never deleted. */
    @Query("DELETE FROM pending_events WHERE uploaded = 1 AND occurred_at < :before")
    suspend fun pruneUploaded(before: Long): Int
}
