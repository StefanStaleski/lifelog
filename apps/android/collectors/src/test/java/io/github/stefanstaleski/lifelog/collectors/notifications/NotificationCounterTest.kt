package io.github.stefanstaleski.lifelog.collectors.notifications

import com.google.common.truth.Truth.assertThat
import org.junit.Test

class NotificationCounterTest {
    private val counter = NotificationCounter("io.github.stefanstaleski.lifelog")
    private fun post(pkg: String = "chat", key: String = "k1", ongoing: Boolean = false, summary: Boolean = false, quiet: Boolean = false) =
        PostedNotification(pkg, key, ongoing, summary, quiet)

    @Test fun countsRealArrivalsIncludingNewMessagesInTheSameConversation() {
        assertThat(counter.counts(post())).isTrue()
        assertThat(counter.counts(post())).isTrue() // chat apps re-post the same key per message
    }

    @Test fun ignoresOngoingSummariesOwnAndSilentUpdates() {
        assertThat(counter.counts(post(ongoing = true))).isFalse()
        assertThat(counter.counts(post(summary = true))).isFalse()
        assertThat(counter.counts(post(pkg = "io.github.stefanstaleski.lifelog"))).isFalse()
        assertThat(counter.counts(post(key = "dl", quiet = true))).isTrue() // first time it's new
        assertThat(counter.counts(post(key = "dl", quiet = true))).isFalse() // then a silent update
    }

    @Test fun hoursAreUtcHourStarts() {
        assertThat(hourStart(1_758_963_599_999)).isEqualTo(1_758_960_000_000)
    }
}
