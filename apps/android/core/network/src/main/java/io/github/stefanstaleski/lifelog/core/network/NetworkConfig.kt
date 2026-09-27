package io.github.stefanstaleski.lifelog.core.network

/** Provided by :app from BuildConfig / local.properties. */
data class NetworkConfig(
    /** Absolute, with a trailing slash. */
    val baseUrl: String,
    val deviceToken: String,
    /** Identifies this phone in `events.device_id`. */
    val deviceId: String,
)
