package io.github.stefanstaleski.lifelog.sync

import android.util.Log
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventDao
import io.github.stefanstaleski.lifelog.core.network.LifelogApi
import io.github.stefanstaleski.lifelog.core.network.NetworkConfig
import io.github.stefanstaleski.lifelog.core.network.model.EventBatchRequest
import io.github.stefanstaleski.lifelog.core.network.toWire
import java.io.IOException
import java.time.Clock
import java.time.Duration
import javax.inject.Inject
import retrofit2.HttpException

sealed interface UploadOutcome {
    data class Done(val uploaded: Int, val rejected: Int, val morePending: Boolean) : UploadOutcome

    /** Temporary problem (offline, 5xx, rate limit): try again with backoff. */
    data class RetryLater(val reason: String) : UploadOutcome

    /** Needs a human (wrong token, bad request): retrying won't help. Events stay queued. */
    data class Failed(val reason: String) : UploadOutcome
}

/** Drains the local queue in batches. Events are only marked uploaded after a 2xx. */
class Uploader @Inject constructor(
    private val dao: PendingEventDao,
    private val api: LifelogApi,
    private val settings: LifelogSettings,
    private val config: NetworkConfig,
    private val clock: Clock,
) {
    suspend fun uploadAll(batchSize: Int = BATCH_SIZE, maxBatches: Int = MAX_BATCHES_PER_RUN): UploadOutcome {
        var uploaded = 0
        var rejected = 0
        repeat(maxBatches) {
            val batch = dao.pendingBatch(batchSize)
            if (batch.isEmpty()) return done(uploaded, rejected, morePending = false)

            val response = try {
                api.uploadBatch(EventBatchRequest(batch.map { it.toWire(config.deviceId) }))
            } catch (e: HttpException) {
                return fail(classify(e))
            } catch (e: IOException) {
                return fail(UploadOutcome.RetryLater("network: ${e.message ?: e::class.simpleName}"))
            }

            // Rejected events were refused permanently by the server; resending can't fix them.
            response.rejected.forEach { Log.w(TAG, "server rejected event ${it.id}: ${it.error}") }
            dao.markUploaded(batch.map { it.id })
            uploaded += batch.size
            rejected += response.rejected.size
        }
        return done(uploaded, rejected, morePending = dao.pendingCount() > 0)
    }

    private fun classify(e: HttpException): UploadOutcome = when (val code = e.code()) {
        408, 429, in 500..599 -> UploadOutcome.RetryLater("server: HTTP $code")
        401, 403 -> UploadOutcome.Failed("device token rejected (HTTP $code)")
        else -> UploadOutcome.Failed("request refused: HTTP $code")
    }

    private suspend fun done(uploaded: Int, rejected: Int, morePending: Boolean): UploadOutcome {
        val now = clock.instant()
        settings.recordSyncSuccess(now, uploaded)
        dao.pruneUploaded(before = now.minus(KEEP_UPLOADED).toEpochMilli())
        return UploadOutcome.Done(uploaded, rejected, morePending)
    }

    private suspend fun fail(outcome: UploadOutcome): UploadOutcome {
        val reason = when (outcome) {
            is UploadOutcome.RetryLater -> outcome.reason
            is UploadOutcome.Failed -> outcome.reason
            is UploadOutcome.Done -> error("not a failure")
        }
        settings.recordSyncFailure(clock.instant(), reason)
        return outcome
    }

    companion object {
        const val BATCH_SIZE = 500
        const val MAX_BATCHES_PER_RUN = 20

        /** Uploaded events stay on the phone this long (status screen, debugging). */
        val KEEP_UPLOADED: Duration = Duration.ofDays(7)
        private const val TAG = "Lifelog"
    }
}
