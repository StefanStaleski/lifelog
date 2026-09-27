package io.github.stefanstaleski.lifelog.collectors.usage

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.collectors.usage.UsageRecord.Kind
import java.time.Instant
import org.junit.Test

class UsageAggregatorTest {
    private val t0 = Instant.parse("2026-09-27T08:00:00Z")
    private fun at(min: Double) = t0.toEpochMilli() + (min * 60_000).toLong()
    private fun win(min: Long) = t0.plusSeconds(min * 60)
    private fun ms(min: Double) = (min * 60_000).toLong()

    private fun resumed(min: Double, pkg: String, cls: String = "Main") = UsageRecord(at(min), Kind.ACTIVITY_RESUMED, pkg, cls)
    private fun paused(min: Double, pkg: String, cls: String = "Main") = UsageRecord(at(min), Kind.ACTIVITY_PAUSED, pkg, cls)
    private fun screenOff(min: Double) = UsageRecord(at(min), Kind.SCREEN_OFF, "android")
    private fun unlock(min: Double) = UsageRecord(at(min), Kind.KEYGUARD_HIDDEN, "android")

    private fun run(vararg r: UsageRecord, fromMin: Long = 0, toMin: Long = 60) =
        UsageAggregator.aggregate(r.toList(), win(fromMin), win(toMin))

    @Test fun singleSessionInsideAWindow() {
        val result = run(resumed(5.0, "chat"), paused(17.0, "chat"))
        assertThat(result.usage).containsExactly(WindowUsage(win(0), "chat", ms(12.0), 1))
    }

    @Test fun sessionAcrossAWindowBoundaryIsSplit() {
        val result = run(resumed(20.0, "video"), paused(40.0, "video"))
        assertThat(result.usage).containsExactly(
            WindowUsage(win(0), "video", ms(10.0), 1),
            WindowUsage(win(30), "video", ms(10.0), 0),
        ).inOrder()
    }

    @Test fun appAlreadyOpenBeforeTheRangeCountsFromTheRangeStart() {
        val result = run(resumed(-50.0, "reader"), paused(10.0, "reader"))
        assertThat(result.usage).containsExactly(WindowUsage(win(0), "reader", ms(10.0), 0))
    }

    @Test fun overlappingActivitiesOfOneAppAreNotDoubleCounted() {
        val result = run(
            resumed(0.0, "shop", "List"),
            resumed(4.0, "shop", "Detail"), // Detail resumes before List pauses
            paused(4.1, "shop", "List"),
            paused(10.0, "shop", "Detail"),
        )
        assertThat(result.usage).containsExactly(WindowUsage(win(0), "shop", ms(10.0), 1))
    }

    @Test fun activityTransitionGapsUnderTwoSecondsAreOneLaunch() {
        val result = run(
            resumed(1.0, "mail", "Inbox"),
            paused(3.0, "mail", "Inbox"),
            resumed(3.0 + 1.0 / 60, "mail", "Message"), // 1 s later
            paused(6.0, "mail", "Message"),
            resumed(20.0, "mail", "Inbox"), // real relaunch
            paused(21.0, "mail", "Inbox"),
        )
        assertThat(result.usage.single().launches).isEqualTo(2)
    }

    @Test fun screenOffEndsSessionsWithoutAPauseEvent() {
        val result = run(resumed(0.0, "chat"), screenOff(7.0), paused(45.0, "chat"))
        assertThat(result.usage).containsExactly(WindowUsage(win(0), "chat", ms(7.0), 1))
    }

    @Test fun stillOpenAtTheEndCountsUpToTheEnd() {
        val result = run(resumed(50.0, "maps"))
        assertThat(result.usage).containsExactly(WindowUsage(win(30), "maps", ms(10.0), 0 + 1))
    }

    @Test fun eventsAfterTheRangeAreIgnored() {
        val result = run(resumed(10.0, "chat"), paused(20.0, "chat"), resumed(70.0, "chat"), unlock(75.0))
        assertThat(result.usage).hasSize(1)
        assertThat(result.unlocks).isEmpty()
    }

    @Test fun twoAppsInTheSameWindow() {
        val result = run(resumed(0.0, "a"), paused(5.0, "a"), resumed(5.0, "b"), paused(8.0, "b"))
        assertThat(result.usage.map { it.packageName to it.foregroundMs })
            .containsExactly("a" to ms(5.0), "b" to ms(3.0))
    }

    @Test fun foregroundTimeNeverExceedsTheWindow() {
        val result = run(resumed(-600.0, "tv"), toMin = 120)
        assertThat(result.usage.map { it.foregroundMs }).containsExactly(ms(30.0), ms(30.0), ms(30.0), ms(30.0))
    }

    @Test fun unlocksInsideTheRangeOnlyAndDeduplicated() {
        val result = run(unlock(-1.0), unlock(2.0), unlock(2.0), unlock(59.9), unlock(60.0))
        assertThat(result.unlocks).containsExactly(
            Instant.ofEpochMilli(at(2.0)),
            Instant.ofEpochMilli(at(59.9)),
        ).inOrder()
    }

    @Test fun screenChangesInsideTheRangeInOrder() {
        val result = run(
            UsageRecord(at(-5.0), Kind.SCREEN_ON, "android"),
            UsageRecord(at(3.0), Kind.SCREEN_ON, "android"),
            UsageRecord(at(20.0), Kind.SCREEN_OFF, "android"),
            UsageRecord(at(61.0), Kind.SCREEN_OFF, "android"),
        )
        assertThat(result.screen).containsExactly(
            ScreenChange(Instant.ofEpochMilli(at(3.0)), on = true),
            ScreenChange(Instant.ofEpochMilli(at(20.0)), on = false),
        ).inOrder()
    }

    @Test fun screenOnDoesNotStartOrEndAppSessions() {
        val result = run(resumed(0.0, "chat"), UsageRecord(at(2.0), Kind.SCREEN_ON, "android"), paused(6.0, "chat"))
        assertThat(result.usage.single().foregroundMs).isEqualTo(ms(6.0))
    }

    @Test(expected = IllegalArgumentException::class)
    fun rangeMustBeWholeWindows() {
        UsageAggregator.aggregate(emptyList(), win(0), win(45))
    }
}
