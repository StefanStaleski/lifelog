package io.github.stefanstaleski.lifelog.collectors.notifications

import android.app.Notification
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import dagger.hilt.android.AndroidEntryPoint
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.db.NotificationCountDao
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch

/** Counts notifications per app per hour. Reads flags only; no title, text or extras. */
@AndroidEntryPoint
class LifelogNotificationListener : NotificationListenerService() {
    @Inject lateinit var counts: NotificationCountDao
    @Inject lateinit var settings: LifelogSettings

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private lateinit var counter: NotificationCounter
    @Volatile private var paused = false

    override fun onCreate() {
        super.onCreate()
        counter = NotificationCounter(packageName)
        settings.collectionPaused.onEach { paused = it }.launchIn(scope)
    }

    override fun onNotificationPosted(sbn: StatusBarNotification) {
        if (paused) return
        val flags = sbn.notification.flags
        val posted = PostedNotification(
            packageName = sbn.packageName,
            key = sbn.key,
            ongoing = sbn.isOngoing,
            groupSummary = flags and Notification.FLAG_GROUP_SUMMARY != 0,
            onlyAlertOnce = flags and Notification.FLAG_ONLY_ALERT_ONCE != 0,
        )
        if (!counter.counts(posted)) return
        val hour = hourStart(sbn.postTime)
        scope.launch { counts.increment(hour, sbn.packageName) }
    }

    override fun onDestroy() {
        scope.cancel()
        super.onDestroy()
    }
}
