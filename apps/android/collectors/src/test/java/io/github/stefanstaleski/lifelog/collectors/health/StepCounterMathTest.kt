package io.github.stefanstaleski.lifelog.collectors.health

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class StepCounterMathTest {
    private val h = 3_600_000L
    private val boot = 1_000L
    private val t0 = 100 * h // an hour boundary

    @Test fun firstReadingIsOnlyABaseline() {
        val s = StepCounterMath.update(null, 5000, t0, boot)
        assertThat(s.hours).isEmpty()
        assertThat(s.value).isEqualTo(5000)
    }

    @Test fun stepsBetweenReadingsAreSpreadOverTheHoursByTime() {
        var s = StepCounterMath.update(null, 1000, t0 + h / 2, boot) // 30 min into hour 100
        s = StepCounterMath.update(s, 1600, t0 + h + h / 4, boot) // 45 min later: 600 steps
        assertThat(s.hours).containsExactly(t0, 400L, t0 + h, 200L)
        assertThat(s.hours.values.sum()).isEqualTo(600)
    }

    @Test fun onlyFinishedHoursAreReported() {
        var s = StepCounterMath.update(null, 0, t0, boot)
        s = StepCounterMath.update(s, 300, t0 + h + h / 2, boot)
        assertThat(StepCounterMath.finished(s, t0 + h + h / 2)).containsExactly(t0, 200L)
    }

    @Test fun aRebootRestartsTheCounterFromZero() {
        var s = StepCounterMath.update(null, 9000, t0, boot)
        val newBoot = t0 + h / 2
        s = StepCounterMath.update(s, 150, t0 + h, newBoot) // 150 steps since the reboot
        assertThat(s.hours.values.sum()).isEqualTo(150)
        assertThat(s.hours).containsExactly(t0, 150L) // all after the reboot, in hour 100
    }

    @Test fun noStepsNoChange() {
        var s = StepCounterMath.update(null, 700, t0, boot)
        s = StepCounterMath.update(s, 700, t0 + 2 * h, boot)
        assertThat(s.hours).isEmpty()
        assertThat(s.atMs).isEqualTo(t0 + 2 * h)
    }

    @Test fun oldHoursAreForgotten() {
        var s = StepCounterMath.update(null, 0, t0, boot)
        s = StepCounterMath.update(s, 100, t0 + h, boot)
        s = StepCounterMath.update(s, 100, t0 + 60 * h, boot)
        assertThat(s.hours).isEmpty()
    }
}
