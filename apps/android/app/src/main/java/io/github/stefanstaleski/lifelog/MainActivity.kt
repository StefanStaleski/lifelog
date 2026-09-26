package io.github.stefanstaleski.lifelog

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import dagger.hilt.android.AndroidEntryPoint
import io.github.stefanstaleski.lifelog.ui.HomeScreen
import io.github.stefanstaleski.lifelog.ui.LifelogTheme

@AndroidEntryPoint
class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LifelogTheme {
                HomeScreen(apiBaseUrl = BuildConfig.API_BASE_URL)
            }
        }
    }
}
