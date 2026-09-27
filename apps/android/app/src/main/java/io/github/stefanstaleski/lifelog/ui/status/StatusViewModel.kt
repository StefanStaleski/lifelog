package io.github.stefanstaleski.lifelog.ui.status

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.stefanstaleski.lifelog.core.data.LifelogSettings
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventDao
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.sync.SyncScheduler
import io.github.stefanstaleski.lifelog.ui.common.DeviceChecksRepository
import java.time.Clock
import java.time.Instant
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json

@HiltViewModel
class StatusViewModel @Inject constructor(
    private val settings: LifelogSettings,
    private val dao: PendingEventDao,
    private val deviceChecks: DeviceChecksRepository,
    private val scheduler: SyncScheduler,
    private val clock: Clock,
    private val json: Json,
) : ViewModel() {
    private val checks = deviceChecks.checks

    /** Re-ticks every 30 s so "5 min ago" stays true. */
    private val ticker = flow {
        while (true) {
            emit(clock.instant())
            delay(30_000)
        }
    }

    @OptIn(ExperimentalCoroutinesApi::class)
    private val today = ticker.map { it.atZone(LocalZone).toLocalDate() }.distinctUntilChanged().flatMapLatest { day ->
        val start = day.atStartOfDay(LocalZone).toInstant().toEpochMilli()
        dao.observeSince(listOf(EventType.APP_USAGE.wire, EventType.UNLOCK.wire, EventType.STEPS.wire), start)
            .map { todaySummary(it, day, LocalZone, json) }
    }

    private val lastByType = dao.observeLastEventByType().map { rows ->
        rows.associate { it.type to Instant.ofEpochMilli(it.lastOccurredAt) }
    }

    val ui: StateFlow<StatusUi?> = combine(
        combine(ticker, settings.collectionPaused, checks, settings.samsungSleepChecked) { t, p, c, s -> Quad(t, p, c, s) },
        settings.syncStatus,
        dao.observePendingCount(),
        lastByType,
        today,
    ) { (now, paused, checks, samsungChecked), sync, pending, last, today ->
        buildStatusUi(now, paused, checks.device, checks.notificationsAllowed, sync, pending, last, today, samsungChecked)
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), null)

    val now: StateFlow<Instant> = ticker.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), clock.instant())

    fun syncNow() = scheduler.syncNow()

    fun confirmSamsungBattery() {
        viewModelScope.launch { settings.setSamsungSleepChecked() }
    }

    private data class Quad<A, B, C, D>(val a: A, val b: B, val c: C, val d: D)

    fun setPaused(paused: Boolean) {
        viewModelScope.launch {
            settings.setCollectionPaused(paused)
            scheduler.syncNow() // report the change right away
        }
    }
}
