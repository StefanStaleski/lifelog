package io.github.stefanstaleski.lifelog.collectors.places

import android.annotation.SuppressLint
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import com.google.android.gms.location.Geofence
import com.google.android.gms.location.GeofencingEvent
import com.google.android.gms.location.GeofencingRequest
import com.google.android.gms.location.LocationServices
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.stefanstaleski.lifelog.core.data.EventWriter
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.NewEvent
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.core.data.model.GeofencePayload
import io.github.stefanstaleski.lifelog.core.data.model.KnownPlace
import java.time.Instant
import java.util.UUID
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import kotlinx.serialization.serializer

interface Geofencer {
    fun register(places: List<KnownPlace>)

    /** After a reboot or permission grant: register the places we already know. */
    suspend fun registerStored()
}

/** Keeps Android's geofences in line with the named places. Registrations die on reboot. */
@Singleton
class GeofenceRegistrar @Inject constructor(
    @ApplicationContext private val context: Context,
    private val location: LocationSource,
    private val store: PlacesStore,
) : Geofencer {
    override suspend fun registerStored() = register(store.places())

    @SuppressLint("MissingPermission") // checked via access()
    override fun register(places: List<KnownPlace>) {
        val client = LocationServices.getGeofencingClient(context)
        client.removeGeofences(pendingIntent())
        val access = location.access()
        if (places.isEmpty() || !access.precise || !access.background) return
        val request = GeofencingRequest.Builder()
            // Report "enter" for places we're already in, so a visit starts right away.
            .setInitialTrigger(GeofencingRequest.INITIAL_TRIGGER_ENTER)
            .addGeofences(
                places.take(MAX_GEOFENCES).map {
                    Geofence.Builder()
                        .setRequestId(it.id)
                        .setCircularRegion(it.lat, it.lng, it.radiusM.toFloat())
                        .setExpirationDuration(Geofence.NEVER_EXPIRE)
                        .setTransitionTypes(Geofence.GEOFENCE_TRANSITION_ENTER or Geofence.GEOFENCE_TRANSITION_EXIT)
                        .build()
                },
            )
            .build()
        client.addGeofences(request, pendingIntent())
            .addOnFailureListener { Log.w("Lifelog", "geofence registration failed", it) }
    }

    private fun pendingIntent(): PendingIntent = PendingIntent.getBroadcast(
        context,
        0,
        Intent(context, GeofenceReceiver::class.java),
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE, // Play Services adds the event
    )

    private companion object {
        const val MAX_GEOFENCES = 100 // Android's per-app limit
    }
}

/** Geofence transitions → `geofence` events. Ids from content, since deliveries can repeat. */
fun geofenceEvents(placeIds: List<String>, transition: Int, at: Instant): List<NewEvent<GeofencePayload>> {
    val name = when (transition) {
        Geofence.GEOFENCE_TRANSITION_ENTER -> "enter"
        Geofence.GEOFENCE_TRANSITION_EXIT -> "exit"
        else -> return emptyList()
    }
    return placeIds.map { id ->
        NewEvent(
            type = EventType.GEOFENCE,
            payload = GeofencePayload(id, name),
            serializer = serializer<GeofencePayload>(),
            occurredAt = at,
            id = UUID.nameUUIDFromBytes("geofence|$id|$name|${at.toEpochMilli()}".toByteArray()),
        )
    }
}

@AndroidEntryPoint
class GeofenceReceiver : BroadcastReceiver() {
    @Inject lateinit var writer: EventWriter
    @Inject lateinit var settings: LifelogSettings

    override fun onReceive(context: Context, intent: Intent) {
        val event = GeofencingEvent.fromIntent(intent) ?: return
        if (event.hasError()) return
        val at = event.triggeringLocation?.time?.let(Instant::ofEpochMilli) ?: writer.now()
        val events = geofenceEvents(event.triggeringGeofences.orEmpty().map { it.requestId }, event.geofenceTransition, at)
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                if (!settings.collectionPaused.first()) writer.writeAll(events)
            } finally {
                pending.finish()
            }
        }
    }
}
