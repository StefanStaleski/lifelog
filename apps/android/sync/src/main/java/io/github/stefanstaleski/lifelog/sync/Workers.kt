package io.github.stefanstaleski.lifelog.sync

import android.content.Context
import androidx.hilt.work.HiltWorker
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import dagger.assisted.Assisted
import dagger.assisted.AssistedInject

/** Every 30 min: polled collectors + heartbeat, then queues an upload. */
@HiltWorker
class CollectWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val runner: CollectRunner,
    private val scheduler: SyncScheduler,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        runner.run()
        scheduler.enqueueUpload()
        return Result.success()
    }
}

/** Uploads the queue when there is network; retries with exponential backoff. */
@HiltWorker
class UploadWorker @AssistedInject constructor(
    @Assisted context: Context,
    @Assisted params: WorkerParameters,
    private val uploader: Uploader,
    private val scheduler: SyncScheduler,
) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result = when (val outcome = uploader.uploadAll()) {
        is UploadOutcome.Done -> {
            if (outcome.morePending) scheduler.enqueueUpload()
            Result.success()
        }
        // The next collection run queues a fresh upload anyway, so give up after a while.
        is UploadOutcome.RetryLater -> if (runAttemptCount < 8) Result.retry() else Result.failure()
        is UploadOutcome.Failed -> Result.failure()
    }
}
