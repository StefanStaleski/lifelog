package io.github.stefanstaleski.lifelog.collectors.places

import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import androidx.core.content.ContextCompat
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import dagger.hilt.android.qualifiers.ApplicationContext
import java.time.Instant
import javax.inject.Inject
import kotlin.coroutines.resume
import kotlinx.coroutines.suspendCancellableCoroutine
import kotlinx.coroutines.withTimeoutOrNull

data class LocationAccess(val precise: Boolean, val background: Boolean)

interface LocationSource {
    fun access(): LocationAccess

    /** One battery-friendly fix (cell/Wi-Fi level), or null when none comes quickly. */
    suspend fun current(): LocationSample?
}

class FusedLocationSource @Inject constructor(@ApplicationContext private val context: Context) : LocationSource {
    private fun has(p: String) = ContextCompat.checkSelfPermission(context, p) == PackageManager.PERMISSION_GRANTED

    override fun access() = LocationAccess(
        precise = has(Manifest.permission.ACCESS_FINE_LOCATION),
        background = has(Manifest.permission.ACCESS_BACKGROUND_LOCATION),
    )

    @SuppressLint("MissingPermission") // checked via access()
    override suspend fun current(): LocationSample? {
        val a = access()
        if (!a.precise || !a.background) return null
        val client = LocationServices.getFusedLocationProviderClient(context)
        val cancel = CancellationTokenSource()
        return withTimeoutOrNull(30_000) {
            suspendCancellableCoroutine { cont ->
                cont.invokeOnCancellation { cancel.cancel() }
                client.getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY, cancel.token)
                    .addOnSuccessListener { loc ->
                        cont.resume(loc?.let { LocationSample(it.latitude, it.longitude, Instant.ofEpochMilli(it.time), it.accuracy) })
                    }
                    .addOnFailureListener { cont.resume(null) }
            }
        }
    }
}
