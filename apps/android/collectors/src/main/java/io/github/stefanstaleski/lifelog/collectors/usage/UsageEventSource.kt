package io.github.stefanstaleski.lifelog.collectors.usage

import android.app.AppOpsManager
import android.app.usage.UsageEvents
import android.app.usage.UsageStatsManager
import android.content.Context
import android.os.Process
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import javax.inject.Inject

fun interface UsageEventSource {
    /**
     * Events in [from, to).
     * @throws UsageAccessMissingException without usage access, because Android then returns an
     * empty list that would look like "phone not used" and the window would be skipped for good.
     */
    fun read(from: Instant, to: Instant): List<UsageRecord>
}

class UsageAccessMissingException : IllegalStateException("usage access not granted")

class AndroidUsageEventSource @Inject constructor(
    @ApplicationContext private val context: Context,
) : UsageEventSource {
    override fun read(from: Instant, to: Instant): List<UsageRecord> {
        val mode = context.getSystemService(AppOpsManager::class.java)
            .unsafeCheckOpNoThrow(AppOpsManager.OPSTR_GET_USAGE_STATS, Process.myUid(), context.packageName)
        if (mode != AppOpsManager.MODE_ALLOWED) throw UsageAccessMissingException()

        val usm = context.getSystemService(UsageStatsManager::class.java)
        val events = usm.queryEvents(from.toEpochMilli(), to.toEpochMilli())
        val out = mutableListOf<UsageRecord>()
        val e = UsageEvents.Event()
        while (events.hasNextEvent()) {
            events.getNextEvent(e)
            val kind = when (e.eventType) {
                UsageEvents.Event.ACTIVITY_RESUMED -> UsageRecord.Kind.ACTIVITY_RESUMED
                UsageEvents.Event.ACTIVITY_PAUSED -> UsageRecord.Kind.ACTIVITY_PAUSED
                UsageEvents.Event.ACTIVITY_STOPPED -> UsageRecord.Kind.ACTIVITY_STOPPED
                UsageEvents.Event.SCREEN_NON_INTERACTIVE -> UsageRecord.Kind.SCREEN_OFF
                UsageEvents.Event.KEYGUARD_HIDDEN -> UsageRecord.Kind.KEYGUARD_HIDDEN
                UsageEvents.Event.DEVICE_SHUTDOWN -> UsageRecord.Kind.SHUTDOWN
                else -> null
            } ?: continue
            out += UsageRecord(e.timeStamp, kind, e.packageName, e.className)
        }
        return out
    }
}
