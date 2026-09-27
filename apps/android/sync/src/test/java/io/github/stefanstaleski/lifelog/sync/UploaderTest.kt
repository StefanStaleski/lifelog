package io.github.stefanstaleski.lifelog.sync

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.db.LifelogDatabase
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventEntity
import io.github.stefanstaleski.lifelog.core.network.LifelogApi
import io.github.stefanstaleski.lifelog.core.network.NetworkConfig
import io.github.stefanstaleski.lifelog.core.network.model.ConfigResponse
import io.github.stefanstaleski.lifelog.core.network.model.EventBatchRequest
import io.github.stefanstaleski.lifelog.core.network.model.HealthResponse
import io.github.stefanstaleski.lifelog.core.network.model.IngestResponse
import io.github.stefanstaleski.lifelog.core.network.model.RejectedEvent
import java.io.IOException
import java.time.Instant
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import okhttp3.ResponseBody.Companion.toResponseBody
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import retrofit2.HttpException
import retrofit2.Response

@RunWith(RobolectricTestRunner::class)
class UploaderTest {
    @get:Rule val tmp = TemporaryFolder()

    private lateinit var db: LifelogDatabase
    private lateinit var settings: LifelogSettings
    private val clock = MutableClock(Instant.parse("2026-09-27T08:00:00Z"))
    private val api = FakeApi()
    private lateinit var uploader: Uploader

    @Before fun setUp() {
        db = inMemoryDb()
        settings = testSettings(tmp.root)
        uploader = Uploader(db.pendingEventDao(), api, settings, NetworkConfig("http://x/", "t", "s24"), clock)
    }

    @After fun tearDown() = db.close()

    private suspend fun seed(n: Int, occurredAt: Instant = clock.now) {
        db.pendingEventDao().insertAll(
            (0 until n).map {
                PendingEventEntity("id-%05d".format(it), "unlock", occurredAt.toEpochMilli() + it, null, "{}", createdAt = 0)
            },
        )
    }

    private suspend fun pending() = db.pendingEventDao().pendingCount()

    @Test fun emptyQueueIsASuccess() = runTest {
        assertThat(uploader.uploadAll()).isEqualTo(UploadOutcome.Done(0, 0, morePending = false))
        assertThat(api.batches).isEmpty()
    }

    @Test fun drainsInBatchesOf500() = runTest {
        seed(1200)
        assertThat(uploader.uploadAll()).isEqualTo(UploadOutcome.Done(1200, 0, morePending = false))
        assertThat(api.batches.map { it.events.size }).containsExactly(500, 500, 200).inOrder()
        assertThat(api.batches.first().events.first().deviceId).isEqualTo("s24")
        assertThat(pending()).isEqualTo(0)
        assertThat(settings.syncStatus.first().lastSuccessAt).isEqualTo(clock.now)
    }

    @Test fun stopsAfterMaxBatchesAndReportsMorePending() = runTest {
        seed(30)
        assertThat(uploader.uploadAll(batchSize = 10, maxBatches = 2))
            .isEqualTo(UploadOutcome.Done(20, 0, morePending = true))
        assertThat(pending()).isEqualTo(10)
    }

    @Test fun serverRejectedEventsAreNotResent() = runTest {
        seed(3)
        api.rejectFirst = true
        assertThat(uploader.uploadAll()).isEqualTo(UploadOutcome.Done(3, 1, morePending = false))
        assertThat(pending()).isEqualTo(0)
    }

    @Test fun networkErrorKeepsEventsAndRetries() = runTest {
        seed(3)
        api.failWith = IOException("timeout")
        assertThat(uploader.uploadAll()).isInstanceOf(UploadOutcome.RetryLater::class.java)
        assertThat(pending()).isEqualTo(3)
        assertThat(settings.syncStatus.first().lastError).isEqualTo("network: timeout")
    }

    @Test fun serverErrorsRetryButAuthErrorsFail() = runTest {
        seed(1)
        api.failWith = http(503)
        assertThat(uploader.uploadAll()).isEqualTo(UploadOutcome.RetryLater("server: HTTP 503"))
        api.failWith = http(429)
        assertThat(uploader.uploadAll()).isInstanceOf(UploadOutcome.RetryLater::class.java)
        api.failWith = http(401)
        assertThat(uploader.uploadAll()).isEqualTo(UploadOutcome.Failed("device token rejected (HTTP 401)"))
        assertThat(pending()).isEqualTo(1)

        api.failWith = null
        assertThat(uploader.uploadAll()).isEqualTo(UploadOutcome.Done(1, 0, morePending = false))
        assertThat(settings.syncStatus.first().lastError).isNull()
    }

    @Test fun prunesUploadedEventsOlderThanAWeek() = runTest {
        seed(2, occurredAt = clock.now.minus(java.time.Duration.ofDays(8)))
        uploader.uploadAll()
        assertThat(db.pendingEventDao().observeLastEventByType().first()).isEmpty()
    }

    private fun http(code: Int) = HttpException(Response.error<Any>(code, "{}".toResponseBody()))

    class FakeApi : LifelogApi {
        val batches = mutableListOf<EventBatchRequest>()
        var failWith: Exception? = null
        var rejectFirst = false

        override suspend fun uploadBatch(batch: EventBatchRequest): IngestResponse {
            failWith?.let { throw it }
            batches += batch
            val rejected = if (rejectFirst) listOf(RejectedEvent(0, batch.events[0].id, "bad")) else emptyList()
            return IngestResponse(batch.events.size - rejected.size, 0, rejected)
        }

        override suspend fun config(): ConfigResponse = error("unused")
        override suspend fun health(): HealthResponse = error("unused")
    }
}
