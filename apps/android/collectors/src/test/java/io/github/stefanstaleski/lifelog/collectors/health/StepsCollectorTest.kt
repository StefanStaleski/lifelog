package io.github.stefanstaleski.lifelog.collectors.health

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.model.StepsPayload
import java.time.Duration
import java.time.Instant
import kotlinx.coroutines.test.runTest
import org.junit.Test

class StepsCollectorTest {
    private val t0 = Instant.parse("2026-09-27T08:00:00Z")
    private fun h(n: Long) = t0.plus(Duration.ofHours(n))

    private class FakeSource(var access: HealthAccess = HealthAccess.AVAILABLE) : StepsSource {
        val requests = mutableListOf<Pair<Instant, Instant>>()
        var data = mapOf<Instant, Pair<Long, Double>>()
        override suspend fun access() = access
        override suspend fun hourly(from: Instant, to: Instant): List<HourSteps> {
            requests += from to to
            return generateSequence(from) { it.plus(Duration.ofHours(1)) }.takeWhile { it.isBefore(to) }
                .map { hs -> data[hs].let { HourSteps(hs, hs.plus(Duration.ofHours(1)), it?.first ?: 0, it?.second ?: 0.0) } }
                .toList()
        }
    }

    private val source = FakeSource()
    private val collector = StepsCollector(source)

    @Test fun finishedHoursOnlyAndSkipsEmptyHours() = runTest {
        source.data = mapOf(h(-2) to (1200L to 950.4), h(-1) to (0L to 0.0))
        val result = collector.collect(since = h(-2), until = h(0).plusSeconds(1500)) // 08:25

        assertThat(result.watermark).isEqualTo(h(0))
        val e = result.events.single()
        assertThat(e.occurredAt).isEqualTo(h(-2))
        assertThat(e.endedAt).isEqualTo(h(-1))
        assertThat(e.payload).isEqualTo(StepsPayload(1200, 950))
    }

    @Test fun rereadsTheLastDayForLateSync() = runTest {
        collector.collect(since = h(0), until = h(1))
        assertThat(source.requests.single()).isEqualTo(h(1).minus(StepsCollector.RESYNC) to h(1))
    }

    @Test fun anUnchangedHourKeepsItsIdAChangedOneGetsANewId() = runTest {
        source.data = mapOf(h(-1) to (300L to 200.0))
        val first = collector.collect(h(-1), h(0)).events.single().id
        assertThat(collector.collect(h(-1), h(0)).events.single().id).isEqualTo(first)
        source.data = mapOf(h(-1) to (900L to 640.0)) // Samsung Health synced more
        assertThat(collector.collect(h(-1), h(0)).events.single().id).isNotEqualTo(first)
    }

    @Test fun withoutAccessNothingIsReadAndTheWatermarkStays() = runTest {
        source.access = HealthAccess.NOT_GRANTED
        val result = collector.collect(h(-5), h(0))
        assertThat(result.events).isEmpty()
        assertThat(result.watermark).isEqualTo(h(-5))
        assertThat(source.requests).isEmpty()
    }

    @Test fun capsImplausibleValuesToTheContractLimits() = runTest {
        source.data = mapOf(h(-1) to (250_000L to 500_000.0))
        assertThat(collector.collect(h(-1), h(0)).events.single().payload).isEqualTo(StepsPayload(100_000, 200_000))
    }
}
