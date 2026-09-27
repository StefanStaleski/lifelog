package io.github.stefanstaleski.lifelog.ui

import android.os.Build
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.dynamicDarkColorScheme
import androidx.compose.material3.dynamicLightColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext

/** Fixed meaning colours (green = fine, amber = look at me), independent of the wallpaper palette. */
@Immutable
data class StatusColors(
    val good: Color,
    val onGood: Color,
    val attention: Color,
    val onAttention: Color,
    val goodDot: Color,
    val attentionDot: Color,
)

private val LightStatus = StatusColors(
    good = Color(0xFFDDF4E4),
    onGood = Color(0xFF0B5A2A),
    attention = Color(0xFFFFEFD2),
    onAttention = Color(0xFF6E4400),
    goodDot = Color(0xFF1E9E4A),
    attentionDot = Color(0xFFE08A00),
)

private val DarkStatus = StatusColors(
    good = Color(0xFF123A21),
    onGood = Color(0xFFB9F0C9),
    attention = Color(0xFF45300A),
    onAttention = Color(0xFFFFDCA0),
    goodDot = Color(0xFF5BD68A),
    attentionDot = Color(0xFFFFB84D),
)

val LocalStatusColors = staticCompositionLocalOf { LightStatus }

@Composable
fun LifelogTheme(content: @Composable () -> Unit) {
    val context = LocalContext.current
    val dark = isSystemInDarkTheme()
    // Material You (wallpaper) colours from Android 12; a fixed calm blue palette before that.
    val colors = when {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.S ->
            if (dark) dynamicDarkColorScheme(context) else dynamicLightColorScheme(context)
        dark -> darkColorScheme(primary = Color(0xFFA8C7FA))
        else -> lightColorScheme(primary = Color(0xFF2B4C8C))
    }
    CompositionLocalProvider(LocalStatusColors provides if (dark) DarkStatus else LightStatus) {
        MaterialTheme(colorScheme = colors, content = content)
    }
}
