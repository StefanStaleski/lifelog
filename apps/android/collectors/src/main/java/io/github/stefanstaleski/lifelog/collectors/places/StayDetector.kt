package io.github.stefanstaleski.lifelog.collectors.places

import io.github.stefanstaleski.lifelog.core.data.model.KnownPlace
import java.time.Duration
import java.time.Instant
import kotlinx.serialization.Serializable

/** One location fix from a collection run. */
data class LocationSample(val lat: Double, val lng: Double, val at: Instant, val accuracyM: Float)

/** Where we seem to be staying, kept on the phone between runs (never uploaded as is). */
@Serializable
data class StayCandidate(val lat: Double, val lng: Double, val sinceMs: Long, val lastSeenMs: Long) {
    val since: Instant get() = Instant.ofEpochMilli(sinceMs)
    val lastSeen: Instant get() = Instant.ofEpochMilli(lastSeenMs)
}

/** A finished stay, rounded for upload. */
data class Stay(val lat: Double, val lng: Double, val arrived: Instant, val left: Instant)

data class StayStep(val finished: Stay?, val next: StayCandidate?)

/**
 * Detects stays of [MIN_STAY]+ outside named places from sparse fixes (one per collection run).
 * Named places are covered by geofences, so being inside one ends any candidate. Imprecise fixes
 * are ignored rather than trusted. A stay ends at the last fix seen there.
 */
object StayDetector {
    val MIN_STAY: Duration = Duration.ofMinutes(15)
    const val SAME_PLACE_M = 150.0
    const val MAX_ACCURACY_M = 200f

    fun step(candidate: StayCandidate?, sample: LocationSample?, places: List<KnownPlace>): StayStep {
        if (sample == null || sample.accuracyM > MAX_ACCURACY_M) return StayStep(null, candidate)

        val insideKnown = places.any { distanceM(it.lat, it.lng, sample.lat, sample.lng) <= it.radiusM }
        if (insideKnown) return StayStep(finish(candidate), null)

        val fresh = StayCandidate(sample.lat, sample.lng, sample.at.toEpochMilli(), sample.at.toEpochMilli())
        if (candidate == null) return StayStep(null, fresh)

        return if (distanceM(candidate.lat, candidate.lng, sample.lat, sample.lng) <= SAME_PLACE_M) {
            StayStep(null, candidate.copy(lastSeenMs = sample.at.toEpochMilli()))
        } else {
            StayStep(finish(candidate), fresh)
        }
    }

    private fun finish(c: StayCandidate?): Stay? =
        c?.takeIf { Duration.between(it.since, it.lastSeen) >= MIN_STAY }
            ?.let { Stay(round3(it.lat), round3(it.lng), it.since, it.lastSeen) }
}
