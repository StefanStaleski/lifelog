package io.github.stefanstaleski.lifelog.collectors.places

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.model.KnownPlace
import java.time.Instant
import org.junit.Test

class StayDetectorTest {
    private val t0 = Instant.parse("2026-09-27T10:00:00Z")
    private fun at(min: Long) = t0.plusSeconds(min * 60)
    private fun fix(lat: Double, lng: Double, min: Long, acc: Float = 20f) = LocationSample(lat, lng, at(min), acc)

    // A café ~2 km from home; ~80 m hop inside the café area; home geofence 150 m.
    private val cafe = 41.99612 to 21.43188
    private val home = KnownPlace("h", "Home", "home", 41.9981, 21.4054, 150)

    private fun run(vararg samples: LocationSample?, places: List<KnownPlace> = listOf(home)): Pair<List<Stay>, StayCandidate?> {
        var c: StayCandidate? = null
        val stays = mutableListOf<Stay>()
        for (s in samples) {
            val step = StayDetector.step(c, s, places)
            step.finished?.let(stays::add)
            c = step.next
        }
        return stays to c
    }

    @Test fun aStayIsReportedWhenLeavingRoundedToAHundredMetres() {
        val (stays, _) = run(fix(cafe.first, cafe.second, 0), fix(cafe.first + 0.0007, cafe.second, 30), fix(42.02, 21.44, 60))
        assertThat(stays).containsExactly(Stay(41.996, 21.432, at(0), at(30)))
    }

    @Test fun shortStopsAreNotStays() {
        val (stays, _) = run(fix(cafe.first, cafe.second, 0), fix(cafe.first, cafe.second, 10), fix(42.02, 21.44, 40))
        assertThat(stays).isEmpty()
    }

    @Test fun anOngoingStayIsKeptNotReported() {
        val (stays, candidate) = run(fix(cafe.first, cafe.second, 0), fix(cafe.first, cafe.second, 30), fix(cafe.first, cafe.second, 60))
        assertThat(stays).isEmpty()
        assertThat(candidate?.since).isEqualTo(at(0))
        assertThat(candidate?.lastSeen).isEqualTo(at(60))
    }

    @Test fun arrivingAtANamedPlaceEndsTheStayAndStartsNothing() {
        val (stays, candidate) = run(fix(cafe.first, cafe.second, 0), fix(cafe.first, cafe.second, 30), fix(home.lat, home.lng + 0.0005, 60))
        assertThat(stays).hasSize(1)
        assertThat(candidate).isNull()
    }

    @Test fun impreciseOrMissingFixesChangeNothing() {
        val (stays, candidate) = run(fix(cafe.first, cafe.second, 0), fix(42.2, 21.9, 30, acc = 900f), null, fix(cafe.first, cafe.second, 60))
        assertThat(stays).isEmpty()
        assertThat(candidate?.since).isEqualTo(at(0))
    }

    @Test fun distanceIsRoughlyRight() {
        // 0.001° latitude ≈ 111 m
        assertThat(distanceM(41.0, 21.0, 41.001, 21.0)).isWithin(1.0).of(111.2)
        assertThat(round3(41.99651)).isEqualTo(41.997)
    }
}
