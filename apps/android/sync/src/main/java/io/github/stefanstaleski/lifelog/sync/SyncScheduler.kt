package io.github.stefanstaleski.lifelog.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import dagger.hilt.android.qualifiers.ApplicationContext
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SyncScheduler @Inject constructor(@ApplicationContext private val context: Context) {
    private val workManager get() = WorkManager.getInstance(context)

    /** Idempotent; call on every app start. */
    fun schedulePeriodic() {
        workManager.enqueueUniquePeriodicWork(
            COLLECT_PERIODIC,
            ExistingPeriodicWorkPolicy.UPDATE,
            PeriodicWorkRequestBuilder<CollectWorker>(COLLECT_INTERVAL_MIN, TimeUnit.MINUTES).build(),
        )
    }

    fun enqueueUpload() {
        workManager.enqueueUniqueWork(
            UPLOAD,
            // Runs after an in-flight upload instead of dropping the request.
            ExistingWorkPolicy.APPEND_OR_REPLACE,
            OneTimeWorkRequestBuilder<UploadWorker>()
                .setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 1, TimeUnit.MINUTES)
                .build(),
        )
    }

    /** "Sync now" from the status screen: collect immediately, then upload. */
    fun syncNow() {
        workManager.enqueueUniqueWork(
            COLLECT_NOW,
            ExistingWorkPolicy.KEEP,
            OneTimeWorkRequestBuilder<CollectWorker>().build(),
        )
    }

    companion object {
        const val COLLECT_INTERVAL_MIN = 30L
        const val COLLECT_PERIODIC = "collect-periodic"
        const val COLLECT_NOW = "collect-now"
        const val UPLOAD = "upload"
    }
}
