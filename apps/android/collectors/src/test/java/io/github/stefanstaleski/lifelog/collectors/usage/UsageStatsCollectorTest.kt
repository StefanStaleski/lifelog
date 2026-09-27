package io.github.stefanstaleski.lifelog.collectors.usage

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.collectors.usage.UsageRecord.Kind
import io.github.stefanstaleski.lifelog.core.data.model.AppUsagePayload
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import java.time.Instant
import kotlinx.coroutines.test.runTest
import org.junit.Test

class UsageStatsCollectorTest {
    private val t0 = Instant.parse("2026-09-27T08:00:00Z")
    private fun at(min: Long) = t0.plusSeconds(min * 60)

    private val requested = mutableListOf<Pair<Instant, Instant>>()
    private var records = listOf<UsageRecord>()
    private val source = UsageEventSource { from, to -> requested += from to to; records }
    private val apps = object : AppInfoProvider {
        override fun info(packageName: String) = AppInfo(packageName.substringAfterLast('.').replaceFirstChar { it.uppercase() }, "social")
        override fun isExcluded(packageName: String) = packageName == "com.launcher"
    }
    private val collector = UsageStatsCollector(source, apps)

    private fun r(min: Long, kind: Kind, pkg: String) = UsageRecord(at(min).toEpochMilli(), kind, pkg, "Main")

    @Test fun emitsCompleteWindowsOnlyAndReadsStateFromEarlier() = runTest {
        records = listOf(
            r(10, Kind.ACTIVITY_RESUMED, "com.example.chat"),
            r(15, Kind.KEYGUARD_HIDDEN, "android"),
            r(40, Kind.ACTIVITY_PAUSED, "com.example.chat"),
        )
        // now = 08:47 → only 08:00–08:30 is complete
        val result = collector.collect(since = at(0), until = at(47))

        assertThat(result.watermark).isEqualTo(at(30))
        assertThat(requested.single()).isEqualTo(at(0).minus(UsageStatsCollector.STATE_LOOKBACK) to at(30))
        val usage = result.events.single { it.type == EventType.APP_USAGE }
        assertThat(usage.occurredAt).isEqualTo(at(0))
        assertThat(usage.endedAt).isEqualTo(at(30))
        assertThat(usage.payload).isEqualTo(AppUsagePayload("com.example.chat", "Chat", "social", 20 * 60_000L, 1))
        assertThat(result.events.single { it.type == EventType.UNLOCK }.occurredAt).isEqualTo(at(15))
    }

    @Test fun nothingToDoInsideAnUnfinishedWindow() = runTest {
        val result = collector.collect(since = at(30), until = at(47))
        assertThat(result.events).isEmpty()
        assertThat(result.watermark).isEqualTo(at(30))
        assertThat(requested).isEmpty()
    }

    @Test fun launcherTimeIsExcluded() = runTest {
        records = listOf(r(1, Kind.ACTIVITY_RESUMED, "com.launcher"), r(9, Kind.ACTIVITY_PAUSED, "com.launcher"))
        assertThat(collector.collect(at(0), at(30)).events).isEmpty()
    }

    @Test fun idsAreStableAcrossRecollection() = runTest {
        records = listOf(
            r(1, Kind.ACTIVITY_RESUMED, "com.example.chat"),
            r(2, Kind.KEYGUARD_HIDDEN, "android"),
            r(9, Kind.ACTIVITY_PAUSED, "com.example.chat"),
        )
        val first = collector.collect(at(0), at(30)).events.map { it.id }
        val second = collector.collect(at(0), at(30)).events.map { it.id }
        assertThat(first).hasSize(2)
        assertThat(second).isEqualTo(first)
    }

    @Test fun firstRunStartsAtAWindowBoundary() = runTest {
        collector.collect(since = at(7), until = at(95))
        assertThat(requested.single().second).isEqualTo(at(90))
        assertThat(requested.single().first).isEqualTo(at(0).minus(UsageStatsCollector.STATE_LOOKBACK))
    }
}
