package io.github.stefanstaleski.lifelog

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.stefanstaleski.lifelog.ui.LifelogTheme

/** Shown by Health Connect when someone asks why Lifelog wants health data (required by the platform). */
class HealthRationaleActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            LifelogTheme {
                Scaffold { padding ->
                    Column(
                        Modifier.fillMaxSize().padding(padding).padding(24.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        Text("👟", fontSize = 48.sp)
                        Text("Why Lifelog reads steps", style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                        Text(
                            "Lifelog reads your step count and walking distance per hour so you can see how active " +
                                "each day was next to your sleep, screen time and mood.",
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Text(
                            "It reads nothing else from Health Connect, never writes to it, and only sends hourly " +
                                "totals to your own private dashboard.",
                            style = MaterialTheme.typography.bodyLarge,
                        )
                        Button(onClick = ::finish) { Text("Got it") }
                    }
                }
            }
        }
    }
}
