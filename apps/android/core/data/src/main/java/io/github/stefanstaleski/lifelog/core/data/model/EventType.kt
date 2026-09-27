package io.github.stefanstaleski.lifelog.core.data.model

/** Event types of the wire contract (packages/shared/src/events.ts). */
enum class EventType(val wire: String) {
    APP_USAGE("app_usage"),
    UNLOCK("unlock"),
    CHECKIN("checkin"),
    HEARTBEAT("heartbeat"),
    ;

    companion object {
        fun fromWire(wire: String): EventType? = entries.firstOrNull { it.wire == wire }
    }
}
