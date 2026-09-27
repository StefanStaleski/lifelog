package io.github.stefanstaleski.lifelog.sync

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.collectors.CollectResult
import io.github.stefanstaleski.lifelog.collectors.PolledCollector
import io.github.stefanstaleski.lifelog.core.data.EventWriter
import io.github.stefanstaleski.lifelog.core.data.LifelogJson
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.NewEvent
import io.github.stefanstaleski.lifelog.core.data.db.LifelogDatabase
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.HeartbeatPayload
import io.github.stefanstaleski.lifelog.core.data.model.UnlockPayload
import java.time.Duration
import java.time.Instant
import java.util.UUID
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.serializer
import org.junit.After
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

@RunWith(RobolectricTestRunner::class)
class CollectRunnerTest {
    @get:Rule val tmp = TemporaryFolder()

    private lateinit var db: LifelogDatabase
    private lateinit var settings: LifelogSettings
    private val clock = MutableClock(Instant.parse("2026-09-27T08:00:00Z"))
    private val status = DeviceStatus("0.1.0", usageAccessGranted = true, batteryOptimizationIgnored = false)

    @Before fun setUp() {
        db = inMemoryDb()
        settings = testSettings(tmp.root)
    }

    @After fun tearDown() = db.close()

    private fun runner(vararg collectors: PolledCollector) = CollectRunner(
        collectors.toSet(),
        EventWriter(db.pendingEventDao(), LifelogJson, clock),
        settings,
        db.pendingEventDao(),
    ) { status }

    private suspend fun stored() = db.pendingEventDao().pendingBatch(1000)

    private suspend fun heartbeat(): HeartbeatPayload =
        LifelogJson.decodeFromString(stored().last { it.type == "heartbeat" }.payload)

    /** Emits one unlock per call at `since`, with an id derived from it. */
    private class FakeCollector(override val name: String = "fake") : PolledCollector {
        val calls = mutableListOf<Pair<Instant, Instant>>()
        var fail = false
        override suspend fun collect(since: Instant, until: Instant): CollectResult {
            calls += since to until
            if (fail) error("boom")
            val id = UUID.nameUUIDFromBytes("$name@$since".toByteArray())
            return CollectResult(listOf(NewEvent(EventType.UNLOCK, UnlockPayload(), serializer(), since, id = id)), until)
        }
    }

    @Test fun firstRunLooksBackADayThenContinuesFromTheWatermark() = runTest {
        val collector = FakeCollector()
        val runner = runner(collector)

        runner.run()
        clock.now = clock.now.plus(Duration.ofMinutes(30))
        runner.run()

        assertThat(collector.calls).containsExactly(
            Instant.parse("2026-09-26T08:00:00Z") to Instant.parse("2026-09-27T08:00:00Z"),
            Instant.parse("2026-09-27T08:00:00Z") to Instant.parse("2026-09-27T08:30:00Z"),
        ).inOrder()
        assertThat(settings.watermark("fake")).isEqualTo(clock.now)
    }

    @Test fun writesAHeartbeatWithDeviceStatusAndQueueSize() = runTest {
        val summary = runner(FakeCollector()).run()
        assertThat(summary).isEqualTo(CollectSummary(written = 1, errors = emptyList()))
        assertThat(heartbeat()).isEqualTo(HeartbeatPayload("0.1.0", 1, false, true, false))
        assertThat(stored().map { it.type }).containsExactly("unlock", "heartbeat")
    }

    @Test fun pausedCollectsNothingButStillReportsIn() = runTest {
        val collector = FakeCollector()
        settings.setCollectionPaused(true)
        runner(collector).run()
        assertThat(collector.calls).isEmpty()
        assertThat(heartbeat().collectionPaused).isTrue()
    }

    @Test fun aFailingCollectorDoesNotStopTheOthers() = runTest {
        val broken = FakeCollector("a-broken").apply { fail = true }
        val ok = FakeCollector("b-ok")
        val summary = runner(broken, ok).run()

        assertThat(summary.errors).containsExactly("a-broken: boom")
        assertThat(summary.written).isEqualTo(1)
        assertThat(settings.watermark("a-broken")).isNull() // retried from the same point next run
        assertThat(settings.syncStatus.first().lastCollectError).isEqualTo("a-broken: boom")
    }

    @Test fun aWindowCollectedWithoutAccessIsCollectedLaterNotSkipped() = runTest {
        val collector = FakeCollector()
        collector.fail = true // e.g. usage access not granted yet
        runner(collector).run()
        clock.now = clock.now.plus(Duration.ofMinutes(5))
        collector.fail = false // access granted
        runner(collector).run()

        // The second run still starts a day back, not from the failed run's time.
        assertThat(collector.calls.last().first).isEqualTo(Instant.parse("2026-09-26T08:05:00Z"))
    }

    @Test fun recollectingTheSameWindowDoesNotDuplicate() = runTest {
        val collector = FakeCollector()
        runner(collector).run()
        settings.setWatermark("fake", Instant.parse("2026-09-26T08:00:00Z")) // as if it was never saved
        val summary = runner(collector).run()
        assertThat(summary.written).isEqualTo(0)
    }
}
