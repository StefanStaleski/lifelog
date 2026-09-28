package io.github.stefanstaleski.lifelog.core.data.model

/**
 * Event types the phone sends (packages/shared/src/events.ts). The laptop-only types
 * (`desktop_usage`, `desktop_heartbeat`) are not listed: the phone never sends them.
 */
enum class EventType(val wire: String) {
    APP_USAGE("app_usage"),
    UNLOCK("unlock"),
    CHECKIN("checkin"),
    HEARTBEAT("heartbeat"),
    STEPS("steps"),
    ACTIVITY("activity"),
    SCREEN("screen"),
    GEOFENCE("geofence"),
    STAY("stay"),
    NOTIFICATIONS("notifications"),
    CALL("call"),
    SMS("sms"),
    MESSAGES("messages"),
    ;

    companion object {
        fun fromWire(wire: String): EventType? = entries.firstOrNull { it.wire == wire }
    }
}
