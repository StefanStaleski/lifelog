package io.github.stefanstaleski.lifelog.checkin

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.ZonedDateTime
import org.junit.Test

class CheckinScheduleTest {
    private fun local(s: String): ZonedDateTime = LocalDateTime.parse(s).atZone(LocalZone)

    @Test fun lateNightCheckinsCountForTheEveningBefore() {
        assertThat(checkinDateFor(local("2026-09-27T21:45"))).isEqualTo(LocalDate.of(2026, 9, 27))
        assertThat(checkinDateFor(local("2026-09-28T00:40"))).isEqualTo(LocalDate.of(2026, 9, 27))
        assertThat(checkinDateFor(local("2026-09-28T03:59"))).isEqualTo(LocalDate.of(2026, 9, 27))
        assertThat(checkinDateFor(local("2026-09-28T04:00"))).isEqualTo(LocalDate.of(2026, 9, 28))
    }

    @Test fun nextReminderIsTodayOrTomorrowAt2130() {
        assertThat(nextReminderAt(local("2026-09-27T08:00"))).isEqualTo(local("2026-09-27T21:30"))
        assertThat(nextReminderAt(local("2026-09-27T21:30"))).isEqualTo(local("2026-09-28T21:30"))
        assertThat(nextReminderAt(local("2026-09-27T23:00"))).isEqualTo(local("2026-09-28T21:30"))
    }

    @Test fun staysAt2130LocalAcrossDaylightSavingChanges() {
        // Clocks go back on 25 Oct 2026 and forward on 29 Mar 2026 in Europe/Skopje.
        val autumn = nextReminderAt(local("2026-10-24T22:00"))
        assertThat(autumn.toLocalDateTime()).isEqualTo(LocalDateTime.parse("2026-10-25T21:30"))
        assertThat(autumn.offset.totalSeconds).isEqualTo(3600)

        val spring = nextReminderAt(local("2026-03-28T22:00"))
        assertThat(spring.toLocalDateTime()).isEqualTo(LocalDateTime.parse("2026-03-29T21:30"))
        assertThat(spring.offset.totalSeconds).isEqualTo(7200)
    }
}
