package io.github.stefanstaleski.lifelog.collectors.health

import android.content.Context
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.HealthConnectFeatures
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.request.AggregateGroupByDurationRequest
import androidx.health.connect.client.time.TimeRangeFilter
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Duration
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton

data class HourSteps(val hourStart: Instant, val hourEnd: Instant, val steps: Long, val distanceM: Double)

enum class HealthAccess { AVAILABLE, NOT_GRANTED, NOT_INSTALLED }

interface StepsSource {
    suspend fun access(): HealthAccess

    /** Hourly totals in [from, to); Health Connect de-duplicates across apps (Samsung Health, etc.). */
    suspend fun hourly(from: Instant, to: Instant): List<HourSteps>
}

@Singleton
class HealthConnectStepsSource @Inject constructor(
    @ApplicationContext private val context: Context,
) : StepsSource {
    private val client by lazy { HealthConnectClient.getOrCreate(context) }

    private fun installed() = HealthConnectClient.getSdkStatus(context) == HealthConnectClient.SDK_AVAILABLE

    /** What onboarding asks for. Background reading is needed because collection runs in WorkManager. */
    fun requiredPermissions(): Set<String> {
        val base = setOf(
            HealthPermission.getReadPermission(StepsRecord::class),
            HealthPermission.getReadPermission(DistanceRecord::class),
        )
        val background = installed() &&
            client.features.getFeatureStatus(HealthConnectFeatures.FEATURE_READ_HEALTH_DATA_IN_BACKGROUND) ==
            HealthConnectFeatures.FEATURE_STATUS_AVAILABLE
        return if (background) base + HealthPermission.PERMISSION_READ_HEALTH_DATA_IN_BACKGROUND else base
    }

    override suspend fun access(): HealthAccess {
        if (!installed()) return HealthAccess.NOT_INSTALLED
        val granted = client.permissionController.getGrantedPermissions()
        return if (granted.containsAll(requiredPermissions())) HealthAccess.AVAILABLE else HealthAccess.NOT_GRANTED
    }

    override suspend fun hourly(from: Instant, to: Instant): List<HourSteps> =
        client.aggregateGroupByDuration(
            AggregateGroupByDurationRequest(
                metrics = setOf(StepsRecord.COUNT_TOTAL, DistanceRecord.DISTANCE_TOTAL),
                timeRangeFilter = TimeRangeFilter.between(from, to),
                timeRangeSlicer = Duration.ofHours(1),
            ),
        ).map {
            HourSteps(
                hourStart = it.startTime,
                hourEnd = it.endTime,
                steps = it.result[StepsRecord.COUNT_TOTAL] ?: 0,
                distanceM = it.result[DistanceRecord.DISTANCE_TOTAL]?.inMeters ?: 0.0,
            )
        }
}
