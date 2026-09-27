package io.github.stefanstaleski.lifelog.checkin

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.stefanstaleski.lifelog.R
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import java.time.Clock
import javax.inject.Inject
import javax.inject.Singleton

/** The 21:30 nudge: an inexact, Doze-tolerant alarm plus a notification with quick mood buttons. */
@Singleton
class CheckinReminder @Inject constructor(
    @ApplicationContext private val context: Context,
    private val clock: Clock,
) {
    /** Idempotent: replaces any pending reminder. No exact-alarm permission needed; a few minutes late is fine. */
    fun scheduleNext() {
        val at = nextReminderAt(clock.instant().atZone(LocalZone))
        context.getSystemService(AlarmManager::class.java)
            .setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, at.toInstant().toEpochMilli(), alarmIntent())
    }

    fun show() {
        if (ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) return
        ensureChannel()
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("How was today? 🌙")
            .setContentText("Mood, energy, focus: it takes 5 seconds.")
            .setContentIntent(openCheckin(REQUEST_OPEN, mood = null))
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_REMINDER)
            .addAction(0, "😞 Rough", openCheckin(REQUEST_MOOD_BASE + 1, mood = 1))
            .addAction(0, "😐 Okay", openCheckin(REQUEST_MOOD_BASE + 3, mood = 3))
            .addAction(0, "😄 Great", openCheckin(REQUEST_MOOD_BASE + 5, mood = 5))
            .build()
        NotificationManagerCompat.from(context).notify(NOTIFICATION_ID, notification)
    }

    fun dismiss() = NotificationManagerCompat.from(context).cancel(NOTIFICATION_ID)

    private fun ensureChannel() {
        val channel = NotificationChannel(CHANNEL_ID, "Evening check-in", NotificationManager.IMPORTANCE_DEFAULT)
            .apply { description = "A daily reminder to log mood, energy and focus" }
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
    }

    /** Opens the check-in screen; a quick-mood button pre-selects that mood (energy and focus are still asked). */
    private fun openCheckin(requestCode: Int, mood: Int?): PendingIntent {
        val intent = Intent(context, CheckinActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        if (mood != null) intent.putExtra(CheckinViewModel.EXTRA_MOOD, mood)
        return PendingIntent.getActivity(context, requestCode, intent, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    }

    private fun alarmIntent(): PendingIntent = PendingIntent.getBroadcast(
        context,
        REQUEST_ALARM,
        Intent(context, CheckinAlarmReceiver::class.java),
        PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT,
    )

    private companion object {
        const val CHANNEL_ID = "checkin"
        const val NOTIFICATION_ID = 2130
        const val REQUEST_ALARM = 1
        const val REQUEST_OPEN = 2
        const val REQUEST_MOOD_BASE = 10
    }
}
