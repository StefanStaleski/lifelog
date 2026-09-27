package io.github.stefanstaleski.lifelog.checkin

import io.github.stefanstaleski.lifelog.core.data.EventWriter
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventDao
import io.github.stefanstaleski.lifelog.core.data.model.CheckinPayload
import io.github.stefanstaleski.lifelog.core.data.model.EventType
import io.github.stefanstaleski.lifelog.sync.SyncScheduler
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.first
import kotlinx.serialization.json.Json

class CheckinRepository @Inject constructor(
    private val dao: PendingEventDao,
    private val writer: EventWriter,
    private val json: Json,
    private val scheduler: SyncScheduler,
) {
    /** The latest saved check-in for [date], if it is still on the phone (kept 7 days). */
    suspend fun latestFor(date: LocalDate): CheckinPayload? {
        // A check-in for `date` is made that evening or, at the latest, early the next morning.
        val from = date.atStartOfDay(LocalZone).toInstant().toEpochMilli()
        return dao.observeSince(listOf(EventType.CHECKIN.wire), from).first()
            .asReversed()
            .map { json.decodeFromString<CheckinPayload>(it.payload) }
            .firstOrNull { it.date == date.toString() }
    }

    /** Stores locally first, then asks for an upload as soon as there is network. */
    suspend fun save(payload: CheckinPayload) {
        writer.write(EventType.CHECKIN, payload)
        scheduler.enqueueUpload()
    }
}
