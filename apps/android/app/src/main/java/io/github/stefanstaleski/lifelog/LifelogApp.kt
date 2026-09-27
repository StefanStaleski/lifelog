package io.github.stefanstaleski.lifelog

import android.app.Application
import androidx.hilt.work.HiltWorkerFactory
import androidx.work.Configuration
import dagger.hilt.android.HiltAndroidApp
import io.github.stefanstaleski.lifelog.checkin.CheckinReminder
import io.github.stefanstaleski.lifelog.sync.SyncScheduler
import javax.inject.Inject

@HiltAndroidApp
class LifelogApp : Application(), Configuration.Provider {
    @Inject lateinit var workerFactory: HiltWorkerFactory
    @Inject lateinit var syncScheduler: SyncScheduler
    @Inject lateinit var checkinReminder: CheckinReminder

    override val workManagerConfiguration: Configuration
        get() = Configuration.Builder().setWorkerFactory(workerFactory).build()

    override fun onCreate() {
        super.onCreate()
        syncScheduler.schedulePeriodic()
        checkinReminder.scheduleNext()
    }
}
