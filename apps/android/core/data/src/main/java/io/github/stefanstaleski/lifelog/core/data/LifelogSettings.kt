package io.github.stefanstaleski.lifelog.core.data

import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import java.time.Instant
import javax.inject.Inject
import javax.inject.Singleton
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map

/** Result of the latest upload attempt, for the status screen. */
data class SyncStatus(
    val lastSuccessAt: Instant? = null,
    val lastAttemptAt: Instant? = null,
    /** null when the latest attempt succeeded. */
    val lastError: String? = null,
    val lastCollectAt: Instant? = null,
    /** Collector failures from the latest collection run, if any. */
    val lastCollectError: String? = null,
)

/** Small persistent app state: the pause switch, collector watermarks and sync bookkeeping. */
@Singleton
class LifelogSettings @Inject constructor(private val store: DataStore<Preferences>) {
    private object Keys {
        val paused = booleanPreferencesKey("collection_paused")
        val lastSuccess = longPreferencesKey("sync_last_success_at")
        val lastAttempt = longPreferencesKey("sync_last_attempt_at")
        val lastError = stringPreferencesKey("sync_last_error")
        val lastCollect = longPreferencesKey("collect_last_at")
        val lastCollectError = stringPreferencesKey("collect_last_error")
        val lastUploadCount = intPreferencesKey("sync_last_upload_count")
        fun watermark(collector: String) = longPreferencesKey("watermark_$collector")
    }

    val collectionPaused: Flow<Boolean> = store.data.map { it[Keys.paused] ?: false }

    suspend fun setCollectionPaused(paused: Boolean) {
        store.edit { it[Keys.paused] = paused }
    }

    /** Collected up to (exclusive) this instant; null before the first run. */
    suspend fun watermark(collector: String): Instant? =
        store.data.first()[Keys.watermark(collector)]?.let(Instant::ofEpochMilli)

    suspend fun setWatermark(collector: String, at: Instant) {
        store.edit { it[Keys.watermark(collector)] = at.toEpochMilli() }
    }

    val syncStatus: Flow<SyncStatus> = store.data.map { p ->
        SyncStatus(
            lastSuccessAt = p[Keys.lastSuccess]?.let(Instant::ofEpochMilli),
            lastAttemptAt = p[Keys.lastAttempt]?.let(Instant::ofEpochMilli),
            lastError = p[Keys.lastError],
            lastCollectAt = p[Keys.lastCollect]?.let(Instant::ofEpochMilli),
            lastCollectError = p[Keys.lastCollectError],
        )
    }

    suspend fun recordSyncSuccess(at: Instant, uploaded: Int) {
        store.edit {
            it[Keys.lastSuccess] = at.toEpochMilli()
            it[Keys.lastAttempt] = at.toEpochMilli()
            it[Keys.lastUploadCount] = uploaded
            it.remove(Keys.lastError)
        }
    }

    suspend fun recordSyncFailure(at: Instant, error: String) {
        store.edit {
            it[Keys.lastAttempt] = at.toEpochMilli()
            it[Keys.lastError] = error
        }
    }

    suspend fun recordCollect(at: Instant, errors: List<String>) {
        store.edit {
            it[Keys.lastCollect] = at.toEpochMilli()
            if (errors.isEmpty()) it.remove(Keys.lastCollectError) else it[Keys.lastCollectError] = errors.joinToString("; ")
        }
    }
}
