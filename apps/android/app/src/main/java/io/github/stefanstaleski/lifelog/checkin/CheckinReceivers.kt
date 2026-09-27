package io.github.stefanstaleski.lifelog.checkin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import dagger.hilt.android.AndroidEntryPoint
import io.github.stefanstaleski.lifelog.collectors.activity.ActivityTracker
import io.github.stefanstaleski.lifelog.collectors.places.Geofencer
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import io.github.stefanstaleski.lifelog.sync.SyncScheduler
import java.time.Clock
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/** Fires at ~21:30: nudges unless today's check-in is already done, then arms tomorrow's. */
@AndroidEntryPoint
class CheckinAlarmReceiver : BroadcastReceiver() {
    @Inject lateinit var reminder: CheckinReminder
    @Inject lateinit var repository: CheckinRepository
    @Inject lateinit var clock: Clock

    override fun onReceive(context: Context, intent: Intent) {
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val date = checkinDateFor(clock.instant().atZone(LocalZone))
                if (repository.latestFor(date) == null) reminder.show()
            } finally {
                reminder.scheduleNext()
                pending.finish()
            }
        }
    }
}

/** Alarms and activity registrations don't survive a reboot or update; re-arm them. */
@AndroidEntryPoint
class BootReceiver : BroadcastReceiver() {
    @Inject lateinit var reminder: CheckinReminder
    @Inject lateinit var syncScheduler: SyncScheduler
    @Inject lateinit var activityTracker: ActivityTracker
    @Inject lateinit var geofencer: Geofencer

    override fun onReceive(context: Context, intent: Intent) {
        when (intent.action) {
            Intent.ACTION_BOOT_COMPLETED,
            Intent.ACTION_MY_PACKAGE_REPLACED,
            Intent.ACTION_TIME_CHANGED,
            Intent.ACTION_TIMEZONE_CHANGED,
            -> {
                reminder.scheduleNext()
                syncScheduler.schedulePeriodic()
                activityTracker.register()
                val pending = goAsync()
                CoroutineScope(Dispatchers.IO).launch {
                    try {
                        geofencer.registerStored()
                    } finally {
                        pending.finish()
                    }
                }
            }
        }
    }
}
