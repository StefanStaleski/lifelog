package io.github.stefanstaleski.lifelog.ui

import androidx.compose.runtime.Composable
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import io.github.stefanstaleski.lifelog.checkin.CheckinActions
import io.github.stefanstaleski.lifelog.checkin.CheckinForm
import io.github.stefanstaleski.lifelog.checkin.CheckinScreen
import io.github.stefanstaleski.lifelog.sync.DeviceStatus
import io.github.stefanstaleski.lifelog.ui.common.DeviceChecks
import io.github.stefanstaleski.lifelog.ui.onboarding.OnboardingActions
import io.github.stefanstaleski.lifelog.ui.onboarding.OnboardingScreen
import io.github.stefanstaleski.lifelog.ui.status.AppTime
import io.github.stefanstaleski.lifelog.ui.status.Fix
import io.github.stefanstaleski.lifelog.ui.status.Health
import io.github.stefanstaleski.lifelog.ui.status.Problem
import io.github.stefanstaleski.lifelog.ui.status.SourceRow
import io.github.stefanstaleski.lifelog.ui.status.StatusActions
import io.github.stefanstaleski.lifelog.ui.status.StatusScreen
import io.github.stefanstaleski.lifelog.ui.status.StatusUi
import io.github.stefanstaleski.lifelog.ui.status.TodaySummary
import java.time.Instant
import java.time.LocalDate
import org.junit.Assume.assumeTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/** Renders screens to PNG for visual review; runs only with -Plifelog.screenshots. */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(qualifiers = "w411dp-h1400dp-xxhdpi")
class ScreenshotTest {
    @get:Rule val compose = createComposeRule()

    @Before fun onlyWhenAsked() = assumeTrue(System.getProperty("lifelog.screenshots") == "true")

    private fun shoot(name: String, content: @Composable () -> Unit) {
        compose.setContent { LifelogTheme(content) }
        compose.onRoot().captureRoboImage("build/screenshots/$name.png")
    }

    private val now = Instant.parse("2026-09-27T16:00:00Z")

    private fun status(health: Health, problems: List<Problem> = emptyList(), paused: Boolean = false) = StatusUi(
        health = health,
        headline = when (health) {
            Health.GOOD -> "All good"
            Health.ATTENTION -> "One thing needs you"
            Health.PAUSED -> "Paused"
        },
        subline = when (health) {
            Health.GOOD -> "Lifelog is quietly collecting in the background."
            Health.ATTENTION -> "Tap a card below to fix it."
            Health.PAUSED -> "Nothing is being recorded until you resume."
        },
        problems = problems,
        today = TodaySummary(192, 47, listOf(AppTime("Chat", 74), AppTime("Browser", 41), AppTime("Maps", 12))),
        sources = listOf(
            SourceRow("📱", "Screen time", now.minusSeconds(900), true, "Counted in 30-minute blocks"),
            SourceRow("🔓", "Unlocks", now.minusSeconds(300), true, "Each time you unlock the phone"),
            SourceRow("🌙", "Evening check-in", null, false, "Once a day, at 21:30"),
            SourceRow("💓", "Background check", now.minusSeconds(600), true, "Lifelog checking in every 30 min"),
        ),
        pending = 12,
        lastUploadAt = now.minusSeconds(420),
        paused = paused,
    )

    @Test fun statusGood() = shoot("status-good") {
        StatusScreen(status(Health.GOOD), now, StatusActions(onCheckin = {}))
    }

    @Test fun statusAttention() = shoot("status-attention") {
        StatusScreen(
            status(
                Health.ATTENTION,
                listOf(
                    Problem("🔋", "Battery saver may pause Lifelog", "Allow it to run in the background so no data is missed.", Fix.BATTERY, "Allow"),
                    Problem(
                        "🛌", "Keep Lifelog awake on Samsung",
                        "Battery → Background usage limits → Never sleeping apps → add Lifelog.",
                        Fix.SAMSUNG_BATTERY, "Open", secondary = "I've done it" to Fix.SAMSUNG_BATTERY_DONE,
                    ),
                ),
            ),
            now,
            StatusActions(onCheckin = {}),
        )
    }

    @Test fun statusPaused() = shoot("status-paused") {
        StatusScreen(status(Health.PAUSED, paused = true), now, StatusActions())
    }

    @Test fun onboarding() = shoot("onboarding") {
        OnboardingScreen(
            DeviceChecks(DeviceStatus("0.1.0", usageAccessGranted = true, batteryOptimizationIgnored = false), false),
            OnboardingActions(),
        )
    }

    @Test fun checkin() = shoot("checkin") {
        val date = LocalDate.of(2026, 9, 27)
        CheckinScreen(
            CheckinForm(date, mood = 4, energy = 2).toggleTag("gym").toggleTag("dog walk"),
            date,
            saved = false,
            CheckinActions(),
        )
    }

    @Test fun checkinSaved() = shoot("checkin-saved") {
        val date = LocalDate.of(2026, 9, 27)
        CheckinScreen(CheckinForm(date), date, saved = true, CheckinActions())
    }
}
