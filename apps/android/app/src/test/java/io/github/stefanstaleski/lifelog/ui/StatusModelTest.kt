package io.github.stefanstaleski.lifelog.ui

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.LifelogJson
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import io.github.stefanstaleski.lifelog.core.data.SyncStatus
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventEntity
import io.github.stefanstaleski.lifelog.core.data.model.AppUsagePayload
import io.github.stefanstaleski.lifelog.core.data.model.StepsPayload
import io.github.stefanstaleski.lifelog.collectors.health.HealthAccess
import io.github.stefanstaleski.lifelog.sync.DeviceStatus
import io.github.stefanstaleski.lifelog.ui.status.AppTime
import io.github.stefanstaleski.lifelog.ui.status.Fix
import io.github.stefanstaleski.lifelog.ui.status.Health
import io.github.stefanstaleski.lifelog.ui.status.TodaySummary
import io.github.stefanstaleski.lifelog.ui.status.buildStatusUi
import io.github.stefanstaleski.lifelog.ui.status.todaySummary
import java.time.Instant
import java.time.LocalDate
import org.junit.Test

class StatusModelTest {
    private val now = Instant.parse("2026-09-27T16:00:00Z")
    private val allOk = DeviceStatus("0.1.0", usageAccessGranted = true, batteryOptimizationIgnored = true)

    private fun usage(at: String, pkg: String, label: String, minutes: Int) = PendingEventEntity(
        id = "$pkg@$at",
        type = "app_usage",
        occurredAt = Instant.parse(at).toEpochMilli(),
        endedAt = Instant.parse(at).plusSeconds(1800).toEpochMilli(),
        payload = LifelogJson.encodeToString(AppUsagePayload(pkg, label, null, minutes * 60_000L, 1)),
        createdAt = 0,
    )

    private fun unlock(at: String) = PendingEventEntity("u@$at", "unlock", Instant.parse(at).toEpochMilli(), null, "{}", createdAt = 0)

    @Test fun todaySummaryUsesTheLocalDay() {
        val events = listOf(
            usage("2026-09-26T21:30:00Z", "chat", "Chat", 20), // 23:30 local on the 26th: yesterday
            usage("2026-09-26T22:00:00Z", "chat", "Chat", 10), // 00:00 local on the 27th: today
            usage("2026-09-27T08:00:00Z", "chat", "Chat v2", 15),
            usage("2026-09-27T08:00:00Z", "maps", "Maps", 25),
            usage("2026-09-27T09:00:00Z", "web", "Browser", 3),
            usage("2026-09-27T09:30:00Z", "clock", "Clock", 0),
            unlock("2026-09-26T21:59:00Z"),
            unlock("2026-09-27T07:00:00Z"),
        )
        val summary = todaySummary(events, LocalDate.of(2026, 9, 27), LocalZone, LifelogJson)
        assertThat(summary).isEqualTo(
            TodaySummary(53, 1, listOf(AppTime("Chat v2", 25), AppTime("Maps", 25), AppTime("Browser", 3))),
        )
    }

    private fun ui(
        paused: Boolean = false,
        device: DeviceStatus = allOk,
        notifications: Boolean = true,
        sync: SyncStatus = SyncStatus(lastSuccessAt = now.minusSeconds(600)),
        last: Map<String, Instant> = emptyMap(),
    ) = buildStatusUi(now, paused, device, notifications, sync, 0, last, TodaySummary.EMPTY)

    @Test fun allGood() {
        val ui = ui()
        assertThat(ui.health).isEqualTo(Health.GOOD)
        assertThat(ui.problems).isEmpty()
    }

    @Test fun pausedWinsOverProblems() {
        val ui = ui(paused = true, device = allOk.copy(usageAccessGranted = false))
        assertThat(ui.health).isEqualTo(Health.PAUSED)
        assertThat(ui.problems.map { it.fix }).containsExactly(Fix.USAGE_ACCESS)
    }

    @Test fun eachMissingPermissionIsAProblem() {
        val ui = ui(device = DeviceStatus("0.1.0", false, false), notifications = false)
        assertThat(ui.health).isEqualTo(Health.ATTENTION)
        assertThat(ui.headline).isEqualTo("3 things need you")
        assertThat(ui.problems.map { it.fix }).containsExactly(Fix.USAGE_ACCESS, Fix.BATTERY, Fix.NOTIFICATIONS).inOrder()
    }

    @Test fun uploadErrorsOnlyMatterOnceTheyPersist() {
        val recent = SyncStatus(lastSuccessAt = now.minusSeconds(3600), lastError = "network: timeout")
        assertThat(ui(sync = recent).problems).isEmpty()

        val stuck = SyncStatus(lastSuccessAt = now.minusSeconds(4 * 3600), lastError = "network: timeout")
        assertThat(ui(sync = stuck).problems.single().fix).isEqualTo(Fix.SYNC_NOW)

        val never = SyncStatus(lastError = "device token rejected (HTTP 401)")
        assertThat(ui(sync = never).problems.single().detail).isEqualTo("device token rejected (HTTP 401)")
    }

    @Test fun stepsTodayKeepTheLargestCountPerHour() {
        fun steps(at: String, n: Int) = PendingEventEntity(
            "s@$at@$n", "steps", Instant.parse(at).toEpochMilli(), Instant.parse(at).plusSeconds(3600).toEpochMilli(),
            LifelogJson.encodeToString(StepsPayload(n, n)), createdAt = 0,
        )
        val events = listOf(steps("2026-09-27T07:00:00Z", 300), steps("2026-09-27T07:00:00Z", 900), steps("2026-09-27T09:00:00Z", 100))
        assertThat(todaySummary(events, LocalDate.of(2026, 9, 27), LocalZone, LifelogJson).steps).isEqualTo(1000)
        assertThat(todaySummary(emptyList(), LocalDate.of(2026, 9, 27), LocalZone, LifelogJson).steps).isNull()
    }

    @Test fun activityPermissionMissingIsAProblemOnlyWhenKnown() {
        assertThat(ui(device = allOk.copy(activityRecognitionGranted = false)).problems.map { it.fix }).containsExactly(Fix.ACTIVITY)
        assertThat(ui(device = allOk.copy(activityRecognitionGranted = null)).problems).isEmpty()
    }

    @Test fun samsungSleepingAppsIsAChecklistItemUntilConfirmed() {
        val samsung = allOk.copy(isSamsung = true, batteryOptimizationIgnored = false)
        fun fixes(device: DeviceStatus, checked: Boolean) =
            buildStatusUi(now, false, device, true, SyncStatus(lastSuccessAt = now), 0, emptyMap(), TodaySummary.EMPTY, samsungSleepChecked = checked)
                .problems.map { it.fix }

        val samsungCard = buildStatusUi(now, false, samsung, true, SyncStatus(lastSuccessAt = now), 0, emptyMap(), TodaySummary.EMPTY, samsungSleepChecked = false)
            .problems.single { it.fix == Fix.SAMSUNG_BATTERY }
        assertThat(samsungCard.secondary).isEqualTo("I've done it" to Fix.SAMSUNG_BATTERY_DONE)
        assertThat(fixes(samsung, checked = false)).containsExactly(Fix.BATTERY, Fix.SAMSUNG_BATTERY).inOrder()
        assertThat(fixes(samsung, checked = true)).containsExactly(Fix.BATTERY)
        // Unrestricted on battery: Samsung won't even list the app, so no card
        assertThat(fixes(allOk.copy(isSamsung = true), checked = false)).isEmpty()
        assertThat(buildStatusUi(now, false, allOk, true, SyncStatus(lastSuccessAt = now), 0, emptyMap(), TodaySummary.EMPTY, samsungSleepChecked = false).problems).isEmpty()
    }

    @Test fun autoRevokeAndRestrictedBucketAreProblems() {
        assertThat(ui(device = allOk.copy(autoRevokeExempt = false)).problems.map { it.fix }).containsExactly(Fix.AUTO_REVOKE)
        assertThat(ui(device = allOk.copy(standbyRestricted = true)).problems.map { it.fix }).containsExactly(Fix.APP_INFO)
    }

    @Test fun notificationAccessMissingIsAProblem() {
        assertThat(ui(device = allOk.copy(notificationListenerGranted = false)).problems.map { it.fix }).containsExactly(Fix.NOTIFICATION_ACCESS)
    }

    @Test fun locationProblemsAskForTheRightStep() {
        assertThat(ui(device = allOk.copy(locationGranted = false, backgroundLocationGranted = false)).problems.single().title)
            .isEqualTo("Places are off")
        assertThat(ui(device = allOk.copy(locationGranted = true, backgroundLocationGranted = false)).problems.single().title)
            .isEqualTo("Location only while using the app")
        assertThat(ui(device = allOk.copy(locationGranted = true, backgroundLocationGranted = true)).problems).isEmpty()
    }

    @Test fun placesAreFreshFromEitherGeofencesOrStays() {
        val places = ui(last = mapOf("stay" to now.minusSeconds(3600))).sources.single { it.name == "Places" }
        assertThat(places.fresh).isTrue()
        assertThat(places.lastSeen).isEqualTo(now.minusSeconds(3600))
    }

    @Test fun healthConnectNotGrantedIsAProblemButNotInstalledIsNot() {
        assertThat(ui(device = allOk.copy(healthConnect = HealthAccess.NOT_GRANTED)).problems.map { it.fix })
            .containsExactly(Fix.HEALTH_CONNECT)
        assertThat(ui(device = allOk.copy(healthConnect = HealthAccess.NOT_INSTALLED)).problems).isEmpty()
    }

    @Test fun sourcesAreFreshWithinTheirAllowance() {
        val ui = ui(
            last = mapOf(
                "heartbeat" to now.minusSeconds(3 * 3600), // allowance 2 h
                "unlock" to now.minusSeconds(3 * 3600), // allowance 24 h
            ),
        )
        val fresh = ui.sources.associate { it.name to it.fresh }
        assertThat(fresh).containsExactly(
            "Screen time", false,
            "Unlocks", true,
            "Steps", false,
            "Notifications", false,
            "Movement", false,
            "Places", false,
            "Evening check-in", false,
            "Background check", false,
        )
    }
}
