package io.github.stefanstaleski.lifelog.ui.common

import android.content.ActivityNotFoundException
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.provider.Settings

/** Deep links into the Settings pages onboarding and the status screen send people to. */
object SystemSettings {
    fun openUsageAccess(context: Context) = context.startFirst(
        // Some builds open straight to this app's switch when given the package.
        Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS, Uri.fromParts("package", context.packageName, null)),
        Intent(Settings.ACTION_USAGE_ACCESS_SETTINGS),
    )

    fun requestIgnoreBatteryOptimizations(context: Context) = context.startFirst(
        Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:${context.packageName}")),
        Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS),
    )

    fun openNotificationSettings(context: Context) = context.startFirst(
        Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE, context.packageName),
        appDetails(context),
    )

    /** The app's "Remove permissions if app is unused" switch (Android 11+). */
    fun openAutoRevoke(context: Context) = context.startFirst(
        Intent(Intent.ACTION_AUTO_REVOKE_PERMISSIONS, Uri.fromParts("package", context.packageName, null)),
        appDetails(context),
    )

    /**
     * Samsung's battery pages, where "Never sleeping apps" lives. The screen names differ between
     * One UI versions, so try the known ones and fall back to the general battery page, then App info.
     */
    fun openSamsungBattery(context: Context) = context.startFirst(
        Intent().setComponent(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.battery.ui.BatteryActivity")),
        Intent().setComponent(ComponentName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity")),
        Intent().setComponent(ComponentName("com.samsung.android.sm", "com.samsung.android.sm.ui.battery.BatteryActivity")),
        Intent(Intent.ACTION_POWER_USAGE_SUMMARY),
        appDetails(context),
    )

    /** App info → Battery → "Unrestricted" (Samsung keeps its own sleeping-apps list too). */
    fun openAppInfo(context: Context) = context.startFirst(appDetails(context))

    private fun appDetails(context: Context) =
        Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.fromParts("package", context.packageName, null))

    private fun Context.startFirst(vararg intents: Intent) {
        for (intent in intents) {
            try {
                startActivity(intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
                return
            } catch (_: ActivityNotFoundException) {
                // try the next, more generic screen
            } catch (_: SecurityException) {
            }
        }
    }
}
