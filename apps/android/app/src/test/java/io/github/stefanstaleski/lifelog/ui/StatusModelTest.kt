package io.github.stefanstaleski.lifelog.ui

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.LifelogJson
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import io.github.stefanstaleski.lifelog.core.data.SyncStatus
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventEntity
import io.github.stefanstaleski.lifelog.core.data.model.AppUsagePayload
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
            "Evening check-in", false,
            "Background check", false,
        )
    }
}
