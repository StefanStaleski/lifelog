package io.github.stefanstaleski.lifelog.collectors.health

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.os.SystemClock
import android.util.Log
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.stefanstaleski.lifelog.collectors.CollectResult
import io.github.stefanstaleski.lifelog.collectors.PolledCollector
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.NewEvent
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.StepsPayload
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer

/** Reads the phone's cumulative step counter (steps since boot), or null if there's none / no reading. */
fun interface StepCounterReader {
    suspend fun read(): Long?
}

class AndroidStepCounterReader @Inject constructor(@ApplicationContext private val context: Context) : StepCounterReader {
    override suspend fun read(): Long? {
        val sm = context.getSystemService(SensorManager::class.java)
        val sensor = sm.getDefaultSensor(Sensor.TYPE_STEP_COUNTER) ?: return null
        return withTimeoutOrNull(10_000) {
            suspendCancellableCoroutine { cont ->
                val listener = object : SensorEventListener {
                    override fun onSensorChanged(event: SensorEvent) {
                        sm.unregisterListener(this)
                        if (cont.isActive) cont.resume(event.values[0].toLong())
                    }

                    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) = Unit
                }
                cont.invokeOnCancellation { sm.unregisterListener(listener) }
                sm.registerListener(listener, sensor, SensorManager.SENSOR_DELAY_NORMAL)
            }
        }
    }
}

/**
 * Steps from the phone's own step counter, independent of Samsung Health / Health Connect. Sends
 * finished hours as `steps` events; the server keeps the larger value when Health Connect also
 * reports an hour. Distance is estimated from an average stride.
 */
class StepSensorCollector @Inject constructor(
    private val reader: StepCounterReader,
    private val settings: LifelogSettings,
    private val json: Json,
) : PolledCollector {
    override val name = "step_sensor"

    override suspend fun collect(since: Instant, until: Instant): CollectResult {
        val value = reader.read()
        if (value == null) {
            Log.i("Lifelog", "step_sensor: no reading")
            return CollectResult(emptyList(), until)
        }
        val now = until.toEpochMilli()
        val bootMs = System.currentTimeMillis() - SystemClock.elapsedRealtime()
        val prev = settings.readString(STATE)?.let { runCatching { json.decodeFromString<StepCounterState>(it) }.getOrNull() }
        val next = StepCounterMath.update(prev, value, now, bootMs)
        settings.writeString(STATE, json.encodeToString(next))
        Log.i("Lifelog", "step_sensor: counter=$value, hours=${next.hours}")

        val events = StepCounterMath.finished(next, now).map { (hour, steps) ->
            val start = Instant.ofEpochMilli(hour)
            val s = steps.coerceAtMost(100_000).toInt()
            val distance = (s * STRIDE_M).toInt().coerceAtMost(200_000)
            NewEvent(
                type = EventType.STEPS,
                payload = StepsPayload(s, distance),
                serializer = serializer<StepsPayload>(),
                occurredAt = start,
                endedAt = start.plusSeconds(3600),
                id = UUID.nameUUIDFromBytes("step_sensor|$hour|$s".toByteArray()),
            )
        }
        return CollectResult(events, until)
    }

    private companion object {
        const val STATE = "step_sensor_state"
        const val STRIDE_M = 0.75
    }
}
