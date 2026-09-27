package io.github.stefanstaleski.lifelog.core.data

import androidx.room.Room
import androidx.room.testing.MigrationTestHelper
import androidx.test.core.app.ApplicationProvider
import androidx.test.platform.app.InstrumentationRegistry
import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.db.LifelogDatabase
import kotlinx.coroutines.test.runTest
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/** The S24 already has a version-1 database; upgrading must keep its queue intact. */
@RunWith(RobolectricTestRunner::class)
class MigrationTest {
    private val name = "migration-test.db"

    @get:Rule
    val helper = MigrationTestHelper(InstrumentationRegistry.getInstrumentation(), LifelogDatabase::class.java)

    @Test fun v1ToV2KeepsPendingEventsAndAddsNotificationCounts() = runTest {
        helper.createDatabase(name, 1).use { db ->
            db.execSQL(
                "INSERT INTO pending_events (id, type, occurred_at, ended_at, payload, uploaded, created_at) " +
                    "VALUES ('e1', 'unlock', 1000, NULL, '{}', 0, 1000)",
            )
        }
        helper.runMigrationsAndValidate(name, 2, true).close()

        val db = Room.databaseBuilder(ApplicationProvider.getApplicationContext(), LifelogDatabase::class.java, name)
            .allowMainThreadQueries()
            .build()
        try {
            assertThat(db.pendingEventDao().pendingBatch(10).single().id).isEqualTo("e1")
            db.notificationCountDao().increment(3_600_000, "chat")
            db.notificationCountDao().increment(3_600_000, "chat")
            assertThat(db.notificationCountDao().between(0, 7_200_000).single().count).isEqualTo(2)
        } finally {
            db.close()
        }
    }
}
