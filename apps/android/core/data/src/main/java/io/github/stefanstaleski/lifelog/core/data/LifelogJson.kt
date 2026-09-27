package io.github.stefanstaleski.lifelog.core.data

import kotlinx.serialization.json.Json

/** JSON settings for everything that crosses the wire. */
val LifelogJson = Json {
    explicitNulls = true
    encodeDefaults = true
    ignoreUnknownKeys = true
}
