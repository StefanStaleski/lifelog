package io.github.stefanstaleski.lifelog.sync

import androidx.datastore.preferences.core.PreferenceDataStoreFactory
import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.db.LifelogDatabase
import java.io.File
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob

fun inMemoryDb(): LifelogDatabase =
    Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), LifelogDatabase::class.java)
        .allowMainThreadQueries()
        .build()

fun testSettings(dir: File): LifelogSettings = LifelogSettings(
    PreferenceDataStoreFactory.create(scope = CoroutineScope(Dispatchers.IO + SupervisorJob())) {
        File(dir, "settings.preferences_pb")
    },
)

/** A clock the test can move. */
class MutableClock(var now: Instant) : Clock() {
    override fun getZone() = ZoneOffset.UTC
    override fun withZone(zone: java.time.ZoneId?) = this
    override fun instant(): Instant = now
}
