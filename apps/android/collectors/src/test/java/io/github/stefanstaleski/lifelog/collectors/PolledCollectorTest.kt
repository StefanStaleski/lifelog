package io.github.stefanstaleski.lifelog.collectors

import com.google.common.truth.Truth.assertThat
import java.time.Duration
import java.time.Instant
import org.junit.Test

class PolledCollectorTest {
    @Test fun firstRunLooksBackOneDayByDefault() {
        val collector = object : PolledCollector {
            override val name = "x"
            override suspend fun collect(since: Instant, until: Instant) = CollectResult(emptyList(), until)
        }
        assertThat(collector.initialLookback).isEqualTo(Duration.ofDays(1))
    }
}
