package io.github.stefanstaleski.lifelog.sync

import android.app.AppOpsManager
import android.content.Context
import android.app.usage.UsageStatsManager
import android.os.BatteryManager
import android.os.Build
import androidx.core.app.NotificationManagerCompat
import android.os.PowerManager
import android.os.Process
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.stefanstaleski.lifelog.collectors.activity.ActivityTracker
import io.github.stefanstaleski.lifelog.collectors.health.HealthAccess
import io.github.stefanstaleski.lifelog.collectors.places.LocationSource
import io.github.stefanstaleski.lifelog.collectors.health.StepsSource
import javax.inject.Inject

/** Permission and battery state that decides whether collection can keep running. */
data class DeviceStatus(
    val appVersion: String,
    val usageAccessGranted: Boolean,
    val batteryOptimizationIgnored: Boolean,
    val charging: Boolean? = null,
    val batteryPct: Int? = null,
    /** Exempt from "remove permissions if app is unused" (Android 11+ auto-revoke). */
    val autoRevokeExempt: Boolean? = null,
    val healthConnect: HealthAccess? = null,
    val activityRecognitionGranted: Boolean? = null,
    val locationGranted: Boolean? = null,
    val backgroundLocationGranted: Boolean? = null,
    /** Android put the app in the "restricted" standby bucket: background work barely runs. */
    val standbyRestricted: Boolean? = null,
    val isSamsung: Boolean = false,
    val notificationListenerGranted: Boolean? = null,
)

interface DeviceStatusSource {
    suspend fun read(): DeviceStatus
}

class AndroidDeviceStatusSource @Inject constructor(
    @ApplicationContext private val context: Context,
    private val steps: StepsSource,
    private val activity: ActivityTracker,
    private val location: LocationSource,
) : DeviceStatusSource {
    override suspend fun read(): DeviceStatus {
        val appOps = context.getSystemService(AppOpsManager::class.java)
        val usageMode = appOps.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName,
        )
        val power = context.getSystemService(PowerManager::class.java)
        val battery = context.getSystemService(BatteryManager::class.java)
        return DeviceStatus(
            appVersion = context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown",
            usageAccessGranted = usageMode == AppOpsManager.MODE_ALLOWED,
            batteryOptimizationIgnored = power.isIgnoringBatteryOptimizations(context.packageName),
            charging = battery.isCharging,
            batteryPct = battery.getIntProperty(BatteryManager.BATTERY_PROPERTY_CAPACITY).takeIf { it in 0..100 },
            autoRevokeExempt = context.packageManager.isAutoRevokeWhitelisted,
            healthConnect = runCatching { steps.access() }.getOrDefault(HealthAccess.NOT_INSTALLED),
            activityRecognitionGranted = activity.granted(),
            locationGranted = location.access().precise,
            backgroundLocationGranted = location.access().background,
            standbyRestricted = context.getSystemService(UsageStatsManager::class.java).appStandbyBucket >=
                UsageStatsManager.STANDBY_BUCKET_RESTRICTED,
            isSamsung = Build.MANUFACTURER.equals("samsung", ignoreCase = true),
            notificationListenerGranted = context.packageName in NotificationManagerCompat.getEnabledListenerPackages(context),
        )
    }
}
