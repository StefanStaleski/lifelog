package io.github.stefanstaleski.lifelog.collectors.activity

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import com.google.android.gms.location.ActivityTransitionResult
import dagger.hilt.android.AndroidEntryPoint
import io.github.stefanstaleski.lifelog.core.data.EventWriter
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import javax.inject.Inject
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/** Receives transitions from Play Services, even when the app isn't running, and stores them locally. */
@AndroidEntryPoint
class ActivityTransitionReceiver : BroadcastReceiver() {
    @Inject lateinit var writer: EventWriter
    @Inject lateinit var settings: LifelogSettings

    override fun onReceive(context: Context, intent: Intent) {
        val result = ActivityTransitionResult.extractResult(intent) ?: return
        val raw = result.transitionEvents.map { RawTransition(it.activityType, it.transitionType, it.elapsedRealTimeNanos) }
        val elapsedNow = SystemClock.elapsedRealtimeNanos()
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!settings.collectionPaused.first()) writer.writeAll(toEvents(raw, writer.now(), elapsedNow))
            } finally {
                pending.finish()
            }
        }
    }
}
