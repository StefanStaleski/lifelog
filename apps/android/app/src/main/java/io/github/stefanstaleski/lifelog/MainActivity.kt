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
