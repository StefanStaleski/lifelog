package io.github.stefanstaleski.lifelog

import org.junit.Assert.assertTrue
import org.junit.Test

class BuildConfigTest {
    @Test
    fun apiBaseUrlIsAbsoluteWithTrailingSlash() {
        // Retrofit rejects a base URL without a trailing slash
        assertTrue(BuildConfig.API_BASE_URL, BuildConfig.API_BASE_URL.endsWith("/"))
        assertTrue(BuildConfig.API_BASE_URL, BuildConfig.API_BASE_URL.matches(Regex("^https?://.+")))
    }
}
