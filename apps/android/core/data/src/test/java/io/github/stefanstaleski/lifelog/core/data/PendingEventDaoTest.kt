package io.github.stefanstaleski.lifelog.core.data

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.db.LastEventByType
import io.github.stefanstaleski.lifelog.core.data.db.LifelogDatabase
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventDao
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventEntity
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class PendingEventDaoTest {
    private lateinit var db: LifelogDatabase
    private lateinit var dao: PendingEventDao

    @Before fun setUp() {
        db = inMemoryDb()
        dao = db.pendingEventDao()
    }

    @After fun tearDown() = db.close()

    private fun event(id: String, occurredAt: Long, type: String = "unlock") =
        PendingEventEntity(id, type, occurredAt, null, "{}", createdAt = occurredAt)

    @Test fun duplicateIdIsIgnored() = runTest {
        assertThat(dao.insert(event("a", 1))).isNotEqualTo(-1L)
        assertThat(dao.insert(event("a", 2))).isEqualTo(-1L)
        assertThat(dao.pendingBatch(10).single().occurredAt).isEqualTo(1)
    }

    @Test fun pendingBatchIsOldestFirstAndLimited() = runTest {
        dao.insertAll(listOf(event("c", 30), event("a", 10), event("b", 20)))
        assertThat(dao.pendingBatch(2).map { it.id }).containsExactly("a", "b").inOrder()
    }

    @Test fun uploadedEventsLeaveTheQueue() = runTest {
        dao.insertAll(listOf(event("a", 10), event("b", 20), event("c", 30)))
        assertThat(dao.markUploaded(listOf("a", "b"))).isEqualTo(2)
        assertThat(dao.pendingBatch(10).map { it.id }).containsExactly("c")
        assertThat(dao.pendingCount()).isEqualTo(1)
        assertThat(dao.observePendingCount().first()).isEqualTo(1)
    }

    @Test fun pruneOnlyDeletesOldUploadedEvents() = runTest {
        dao.insertAll(listOf(event("old-up", 10), event("old-pending", 10), event("new-up", 100)))
        dao.markUploaded(listOf("old-up", "new-up"))
        assertThat(dao.pruneUploaded(before = 50)).isEqualTo(1)
        assertThat(dao.pendingBatch(10).map { it.id }).containsExactly("old-pending")
        assertThat(dao.observeLastEventByType().first()).containsExactly(LastEventByType("unlock", 100))
    }

    @Test fun lastEventPerType() = runTest {
        dao.insertAll(listOf(event("a", 10), event("b", 20), event("c", 15, type = "heartbeat")))
        assertThat(dao.observeLastEventByType().first())
            .containsExactly(LastEventByType("unlock", 20), LastEventByType("heartbeat", 15))
    }
}
