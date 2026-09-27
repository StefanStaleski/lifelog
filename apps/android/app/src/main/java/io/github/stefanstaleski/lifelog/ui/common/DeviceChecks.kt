package io.github.stefanstaleski.lifelog.ui.common

import android.content.Context
import androidx.core.app.NotificationManagerCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.stefanstaleski.lifelog.sync.DeviceStatus
import io.github.stefanstaleski.lifelog.sync.DeviceStatusSource
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/** Everything onboarding and the status screen check. */
data class DeviceChecks(val device: DeviceStatus, val notificationsAllowed: Boolean) {
    companion object {
        val UNKNOWN = DeviceChecks(DeviceStatus("", usageAccessGranted = true, batteryOptimizationIgnored = true), true)
    }
}

/** Permission state can change in Settings at any time, so it is re-read whenever the app resumes. */
@Singleton
class DeviceChecksRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val source: DeviceStatusSource,
) {
    private val state = MutableStateFlow(DeviceChecks.UNKNOWN)
    val checks: StateFlow<DeviceChecks> = state.asStateFlow()

    fun refresh() {
        state.value = DeviceChecks(source.read(), NotificationManagerCompat.from(context).areNotificationsEnabled())
    }
}
