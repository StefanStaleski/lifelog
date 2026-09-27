package io.github.stefanstaleski.lifelog.core.data.db

import androidx.room.AutoMigration
import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [PendingEventEntity::class, NotificationCountEntity::class],
    version = 2,
    exportSchema = true,
    autoMigrations = [AutoMigration(from = 1, to = 2)],
)
abstract class LifelogDatabase : RoomDatabase() {
    abstract fun pendingEventDao(): PendingEventDao
    abstract fun notificationCountDao(): NotificationCountDao
}
