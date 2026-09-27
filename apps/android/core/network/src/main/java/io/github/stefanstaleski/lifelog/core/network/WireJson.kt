package io.github.stefanstaleski.lifelog.core.network

import kotlinx.serialization.json.Json

/**
 * Envelope JSON: absent optionals (`ended_at`) are omitted, because the server's strict schemas
 * reject unknown or null keys where a field is not allowed. Payloads are JsonObjects already
 * encoded by :core:data, so their explicit nulls are kept.
 */
val WireJson = Json {
    explicitNulls = false
    ignoreUnknownKeys = true
}
