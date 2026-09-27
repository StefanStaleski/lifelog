package io.github.stefanstaleski.lifelog.sync

import android.app.AppOpsManager
import android.content.Context
import android.os.PowerManager
import android.os.Process
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject

/** Permission and battery state that decides whether collection can keep running. */
data class DeviceStatus(
    val appVersion: String,
    val usageAccessGranted: Boolean,
    val batteryOptimizationIgnored: Boolean,
)

fun interface DeviceStatusSource {
    fun read(): DeviceStatus
}

class AndroidDeviceStatusSource @Inject constructor(
    @ApplicationContext private val context: Context,
) : DeviceStatusSource {
    override fun read(): DeviceStatus {
        val appOps = context.getSystemService(AppOpsManager::class.java)
        val usageMode = appOps.unsafeCheckOpNoThrow(
            AppOpsManager.OPSTR_GET_USAGE_STATS,
            Process.myUid(),
            context.packageName,
        )
        val power = context.getSystemService(PowerManager::class.java)
        return DeviceStatus(
            appVersion = context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "unknown",
            usageAccessGranted = usageMode == AppOpsManager.MODE_ALLOWED,
            batteryOptimizationIgnored = power.isIgnoringBatteryOptimizations(context.packageName),
        )
    }
}
