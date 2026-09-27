package io.github.stefanstaleski.lifelog.core.network

import io.github.stefanstaleski.lifelog.core.data.db.PendingEventEntity
import io.github.stefanstaleski.lifelog.core.network.model.WireEvent
import java.time.Instant
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject

/** Stored event → wire format. Timestamps become ISO-8601 UTC (`…Z`). */
fun PendingEventEntity.toWire(deviceId: String): WireEvent = WireEvent(
    id = id,
    type = type,
    occurredAt = Instant.ofEpochMilli(occurredAt).toString(),
    endedAt = endedAt?.let { Instant.ofEpochMilli(it).toString() },
    deviceId = deviceId,
    payload = Json.parseToJsonElement(payload).jsonObject,
)
