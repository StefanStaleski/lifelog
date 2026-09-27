package io.github.stefanstaleski.lifelog.core.data.db

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(entities = [PendingEventEntity::class], version = 1, exportSchema = true)
abstract class LifelogDatabase : RoomDatabase() {
    abstract fun pendingEventDao(): PendingEventDao
}
