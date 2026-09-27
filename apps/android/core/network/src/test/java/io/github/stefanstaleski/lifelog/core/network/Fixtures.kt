package io.github.stefanstaleski.lifelog.core.network

import java.io.File

/** Reads packages/shared/fixtures (path passed in by Gradle). */
object Fixtures {
    val dir = File(requireNotNull(System.getProperty("lifelog.fixturesDir")) { "lifelog.fixturesDir not set" })

    fun validEvents(): Map<String, String> =
        File(dir, "events/valid").listFiles { f -> f.extension == "json" }!!
            .sortedBy { it.name }
            .associate { it.nameWithoutExtension to it.readText() }

    fun api(name: String): String = File(dir, "api/$name").readText()
}
