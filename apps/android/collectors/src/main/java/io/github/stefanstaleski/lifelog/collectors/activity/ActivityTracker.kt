package io.github.stefanstaleski.lifelog.collectors.activity

import android.Manifest
import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.util.Log
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

/** Registers for Activity Recognition transitions. Registrations don't survive reboots or updates. */
@Singleton
class ActivityTracker @Inject constructor(@ApplicationContext private val context: Context) {
    fun granted(): Boolean =
        ContextCompat.checkSelfPermission(context, Manifest.permission.ACTIVITY_RECOGNITION) == PackageManager.PERMISSION_GRANTED

    /** Idempotent: the same PendingIntent replaces an earlier registration. */
    @SuppressLint("MissingPermission") // checked by granted()
    fun register() {
        if (!granted()) return
        val transitions = TRACKED_ACTIVITIES.keys.flatMap { type ->
            listOf(ActivityTransition.ACTIVITY_TRANSITION_ENTER, ActivityTransition.ACTIVITY_TRANSITION_EXIT).map {
                ActivityTransition.Builder().setActivityType(type).setActivityTransition(it).build()
            }
        }
        ActivityRecognition.getClient(context)
            .requestActivityTransitionUpdates(ActivityTransitionRequest(transitions), pendingIntent())
            .addOnFailureListener { Log.w("Lifelog", "activity transitions registration failed", it) }
    }

    // Mutable: Play Services adds the transition result to the intent.
    private fun pendingIntent(): PendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, ActivityTransitionReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE,
    )
}
