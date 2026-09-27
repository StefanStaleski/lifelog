package io.github.stefanstaleski.lifelog.ui

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import io.github.stefanstaleski.lifelog.ui.common.minutesLabel
import io.github.stefanstaleski.lifelog.ui.common.relativeTime
import java.time.Instant
import org.junit.Test

class TimeFormatTest {
    // 18:00 local (CEST) on Sunday 27 Sep 2026
    private val now = Instant.parse("2026-09-27T16:00:00Z")
    private fun ago(iso: String) = relativeTime(Instant.parse(iso), now, LocalZone)

    @Test fun relative() {
        assertThat(ago("2026-09-27T15:59:30Z")).isEqualTo("just now")
        assertThat(ago("2026-09-27T15:55:00Z")).isEqualTo("5 min ago")
        assertThat(ago("2026-09-27T13:00:00Z")).isEqualTo("3 h ago")
        assertThat(ago("2026-09-27T02:30:00Z")).isEqualTo("today 04:30")
        assertThat(ago("2026-09-26T19:30:00Z")).isEqualTo("yesterday 21:30")
        assertThat(ago("2026-09-23T06:12:00Z")).isEqualTo("Wed 08:12")
        assertThat(ago("2026-09-12T10:00:00Z")).isEqualTo("12 Sep")
    }

    @Test fun minutes() {
        assertThat(minutesLabel(0)).isEqualTo("0 min")
        assertThat(minutesLabel(45)).isEqualTo("45 min")
        assertThat(minutesLabel(180)).isEqualTo("3 h")
        assertThat(minutesLabel(192)).isEqualTo("3 h 12 min")
    }
}
