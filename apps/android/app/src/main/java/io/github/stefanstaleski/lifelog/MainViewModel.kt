package io.github.stefanstaleski.lifelog

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.stefanstaleski.lifelog.collectors.activity.ActivityTracker
import io.github.stefanstaleski.lifelog.collectors.health.HealthConnectStepsSource
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.sync.SyncScheduler
import io.github.stefanstaleski.lifelog.ui.common.DeviceChecks
import io.github.stefanstaleski.lifelog.ui.common.DeviceChecksRepository
import javax.inject.Inject
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

@HiltViewModel
class MainViewModel @Inject constructor(
    private val settings: LifelogSettings,
    private val deviceChecks: DeviceChecksRepository,
    private val scheduler: SyncScheduler,
    private val healthConnect: HealthConnectStepsSource,
    private val activityTracker: ActivityTracker,
) : ViewModel() {
    /** null while loading, to avoid flashing onboarding on start. */
    val onboardingDone: StateFlow<Boolean?> =
        settings.onboardingDone.stateIn(viewModelScope, SharingStarted.Eagerly, null)

    val checks: StateFlow<DeviceChecks> = deviceChecks.checks

    fun refreshChecks() {
        viewModelScope.launch { deviceChecks.refresh() }
    }

    /** After the activity-recognition permission dialog. */
    fun onActivityPermissionResult() {
        activityTracker.register()
        refreshChecks()
    }

    /** Health Connect permissions to request (steps, distance, background reading). */
    fun healthPermissions(): Set<String> = healthConnect.requiredPermissions()

    fun finishOnboarding() {
        viewModelScope.launch {
            settings.setOnboardingDone()
            scheduler.syncNow() // first collection right away, so the status screen fills up
        }
    }
}
