package io.github.stefanstaleski.lifelog.ui

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp

/** Placeholder until the status screen (task 14). */
@Composable
fun HomeScreen(apiBaseUrl: String) {
    Scaffold { padding ->
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(24.dp),
        ) {
            Text("Lifelog", style = MaterialTheme.typography.headlineMedium)
            Text("Collector not running yet.", style = MaterialTheme.typography.bodyLarge)
            Text("API: $apiBaseUrl", style = MaterialTheme.typography.bodySmall)
        }
    }
}

@Preview(showBackground = true)
@Composable
private fun HomeScreenPreview() {
    HomeScreen(apiBaseUrl = "http://localhost:3000/")
}
