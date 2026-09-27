package io.github.stefanstaleski.lifelog.core.data

import java.time.ZoneId

/** The zone "today" and every local date are computed in; must match the server (packages/shared). */
val LocalZone: ZoneId = ZoneId.of("Europe/Skopje")
