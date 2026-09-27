package io.github.stefanstaleski.lifelog.core.data

import androidx.room.Room
import androidx.test.core.app.ApplicationProvider
import io.github.stefanstaleski.lifelog.core.data.db.LifelogDatabase
import java.time.Clock
import java.time.Instant
import java.time.ZoneOffset

fun inMemoryDb(): LifelogDatabase =
    Room.inMemoryDatabaseBuilder(ApplicationProvider.getApplicationContext(), LifelogDatabase::class.java)
        .allowMainThreadQueries()
        .build()

fun fixedClock(at: String = "2026-09-27T08:00:00Z"): Clock = Clock.fixed(Instant.parse(at), ZoneOffset.UTC)
