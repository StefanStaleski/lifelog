package io.github.stefanstaleski.lifelog.core.data.db

import androidx.room.ColumnInfo
import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Query

/** Notifications posted per app per UTC hour, counted by the listener. Never any content. */
@Entity(tableName = "notification_counts", primaryKeys = ["hour_start", "package"])
data class NotificationCountEntity(
    @ColumnInfo(name = "hour_start") val hourStart: Long,
    @ColumnInfo(name = "package") val packageName: String,
    val count: Int,
)

@Dao
interface NotificationCountDao {
    @Query(
        "INSERT INTO notification_counts (hour_start, package, count) VALUES (:hourStart, :packageName, 1) " +
            "ON CONFLICT (hour_start, package) DO UPDATE SET count = count + 1",
    )
    suspend fun increment(hourStart: Long, packageName: String)

    @Query("SELECT * FROM notification_counts WHERE hour_start >= :fromMs AND hour_start < :toMs ORDER BY hour_start, package")
    suspend fun between(fromMs: Long, toMs: Long): List<NotificationCountEntity>

    @Query("DELETE FROM notification_counts WHERE hour_start < :beforeMs")
    suspend fun pruneBefore(beforeMs: Long): Int
}
