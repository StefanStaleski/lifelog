package io.github.stefanstaleski.lifelog

import android.Manifest
import android.content.Intent
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.platform.LocalContext
import androidx.health.connect.client.PermissionController
import androidx.hilt.lifecycle.viewmodel.compose.hiltViewModel
import androidx.lifecycle.compose.LifecycleResumeEffect
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import io.github.stefanstaleski.lifelog.checkin.CheckinActivity
import io.github.stefanstaleski.lifelog.ui.LifelogTheme
import io.github.stefanstaleski.lifelog.ui.common.SystemSettings
import io.github.stefanstaleski.lifelog.ui.onboarding.OnboardingActions
import io.github.stefanstaleski.lifelog.ui.onboarding.OnboardingScreen
import io.github.stefanstaleski.lifelog.ui.status.Fix
import io.github.stefanstaleski.lifelog.ui.status.StatusActions
import io.github.stefanstaleski.lifelog.ui.status.StatusScreen
import io.github.stefanstaleski.lifelog.ui.status.StatusViewModel

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LifelogTheme { AppRoot() }
        }
    }
}

@Composable
private fun AppRoot(main: MainViewModel = hiltViewModel()) {
    val context = LocalContext.current
    val onboardingDone by main.onboardingDone.collectAsStateWithLifecycle()
    val checks by main.checks.collectAsStateWithLifecycle()

    // Permissions can change in Settings while we're away.
    LifecycleResumeEffect(Unit) {
        main.refreshChecks()
        onPauseOrDispose {}
    }

    val notificationPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) SystemSettings.openNotificationSettings(context)
        main.refreshChecks()
    }
    val healthPermission = rememberLauncherForActivityResult(PermissionController.createRequestPermissionResultContract()) {
        main.refreshChecks()
    }
    val requestHealthConnect = { healthPermission.launch(main.healthPermissions()) }

    val activityPermission = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) { granted ->
        if (!granted) SystemSettings.openAppInfo(context) // denied twice: Android won't ask again
        main.onActivityPermissionResult()
    }
    val requestActivity = { activityPermission.launch(Manifest.permission.ACTIVITY_RECOGNITION) }

    // Location is two steps on Android 11+: "while using" first, then "all the time" in Settings.
    val backgroundLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission()) {
        main.onLocationPermissionResult()
    }
    val foregroundLocation = rememberLauncherForActivityResult(ActivityResultContracts.RequestMultiplePermissions()) { result ->
        if (result[Manifest.permission.ACCESS_FINE_LOCATION] == true) {
            backgroundLocation.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        } else {
            SystemSettings.openAppInfo(context)
        }
        main.onLocationPermissionResult()
    }
    val requestLocation = {
        if (checks.device.locationGranted == true) {
            backgroundLocation.launch(Manifest.permission.ACCESS_BACKGROUND_LOCATION)
        } else {
            foregroundLocation.launch(arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION))
        }
    }

    val requestNotifications = {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            notificationPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
        } else {
            SystemSettings.openNotificationSettings(context)
        }
    }

    when (onboardingDone) {
        null -> Unit // still loading
        false -> OnboardingScreen(
            checks,
            OnboardingActions(
                onUsageAccess = { SystemSettings.openUsageAccess(context) },
                onBattery = { SystemSettings.requestIgnoreBatteryOptimizations(context) },
                onNotifications = requestNotifications,
                onHealthConnect = requestHealthConnect,
                onActivity = requestActivity,
                onLocation = requestLocation,
                onNotificationAccess = { SystemSettings.openNotificationAccess(context) },
                onAppInfo = { SystemSettings.openAppInfo(context) },
                onFinish = main::finishOnboarding,
            ),
        )
        true -> {
            val status: StatusViewModel = hiltViewModel()
            val ui by status.ui.collectAsStateWithLifecycle()
            val now by status.now.collectAsStateWithLifecycle()
            ui?.let {
                StatusScreen(
                    it,
                    now,
                    StatusActions(
                        onFix = { fix ->
                            when (fix) {
                                Fix.USAGE_ACCESS -> SystemSettings.openUsageAccess(context)
                                Fix.BATTERY -> SystemSettings.requestIgnoreBatteryOptimizations(context)
                                Fix.NOTIFICATIONS -> requestNotifications()
                                Fix.HEALTH_CONNECT -> requestHealthConnect()
                                Fix.ACTIVITY -> requestActivity()
                                Fix.LOCATION -> requestLocation()
                                Fix.AUTO_REVOKE -> SystemSettings.openAutoRevoke(context)
                                Fix.NOTIFICATION_ACCESS -> SystemSettings.openNotificationAccess(context)
                                Fix.APP_INFO -> SystemSettings.openAppInfo(context)
                                Fix.SAMSUNG_BATTERY -> SystemSettings.openSamsungBattery(context)
                                Fix.SAMSUNG_BATTERY_DONE -> status.confirmSamsungBattery()
                                Fix.SYNC_NOW -> status.syncNow()
                                Fix.NONE -> Unit
                            }
                        },
                        onSyncNow = status::syncNow,
                        onPausedChange = status::setPaused,
                        onCheckin = { context.startActivity(Intent(context, CheckinActivity::class.java)) },
                    ),
                )
            }
        }
    }
}
