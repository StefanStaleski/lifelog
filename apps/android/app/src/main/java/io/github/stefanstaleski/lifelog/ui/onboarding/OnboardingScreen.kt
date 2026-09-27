package io.github.stefanstaleski.lifelog.ui.onboarding

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilledTonalButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.stefanstaleski.lifelog.collectors.health.HealthAccess
import io.github.stefanstaleski.lifelog.sync.DeviceStatus
import io.github.stefanstaleski.lifelog.ui.LifelogTheme
import io.github.stefanstaleski.lifelog.ui.LocalStatusColors
import io.github.stefanstaleski.lifelog.ui.common.DeviceChecks
import io.github.stefanstaleski.lifelog.ui.common.EmojiBadge

data class OnboardingActions(
    val onUsageAccess: () -> Unit = {},
    val onBattery: () -> Unit = {},
    val onNotifications: () -> Unit = {},
    val onHealthConnect: () -> Unit = {},
    val onActivity: () -> Unit = {},
    val onLocation: () -> Unit = {},
    val onAppInfo: () -> Unit = {},
    val onFinish: () -> Unit = {},
)

private data class Step(
    val emoji: String,
    val title: String,
    val why: String,
    val done: Boolean,
    val required: Boolean,
    val action: String,
    val onClick: () -> Unit,
)

@Composable
fun OnboardingScreen(checks: DeviceChecks, actions: OnboardingActions) {
    val steps = listOf(
        Step(
            "📊", "Count screen time & unlocks",
            "Open Usage access, find Lifelog and switch it on. That's what lets it count.",
            checks.device.usageAccessGranted, required = true, "Open settings", actions.onUsageAccess,
        ),
        Step(
            "🔋", "Keep running in the background",
            "So Android doesn't pause Lifelog to save battery. It uses very little.",
            checks.device.batteryOptimizationIgnored, required = false, "Allow", actions.onBattery,
        ),
        Step(
            "🔔", "Evening reminder",
            "A gentle nudge at 21:30 for your 5-second check-in.",
            checks.notificationsAllowed, required = false, "Allow", actions.onNotifications,
        ),
        Step(
            "👟", "Steps from Samsung Health",
            "Reads your steps and distance from Health Connect. In Samsung Health, make sure Settings → Health Connect sync is on.",
            checks.device.healthConnect == HealthAccess.AVAILABLE, required = false, "Allow", actions.onHealthConnect,
        ).takeIf { checks.device.healthConnect != HealthAccess.NOT_INSTALLED },
        Step(
            "🚶", "Walking, driving or still",
            "Lets Android tell Lifelog when you start walking, driving or sit still. It also helps the sleep estimate.",
            checks.device.activityRecognitionGranted != false, required = false, "Allow", actions.onActivity,
        ),
        Step(
            "📍", "Places you go",
            if (checks.device.locationGranted == true) {
                "One more tap: choose \"Allow all the time\" so Lifelog notices when you arrive home or at work."
            } else {
                "Counts time at home, work and the gym. Only the rough area (about 100 m) of other stops is kept."
            },
            checks.device.backgroundLocationGranted != false, required = false,
            if (checks.device.locationGranted == true) "Allow all the time" else "Allow", actions.onLocation,
        ),
    ).filterNotNull()
    val ready = steps.filter { it.required }.all { it.done }

    Scaffold { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = 20.dp,
                end = 20.dp,
                top = padding.calculateTopPadding() + 32.dp,
                bottom = padding.calculateBottomPadding() + 24.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("👋", fontSize = 48.sp)
                    Text("Hi! Let's set up Lifelog", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
                    Text(
                        "A couple of quick taps. Lifelog only counts things. It never reads your messages or notifications.",
                        style = MaterialTheme.typography.bodyLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            items(steps.size) { i -> StepCard(i + 1, steps[i]) }
            item { SamsungTip(actions.onAppInfo) }
            item {
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth()) {
                    Spacer(Modifier.height(8.dp))
                    Button(
                        onClick = actions.onFinish,
                        enabled = ready,
                        modifier = Modifier.fillMaxWidth().height(56.dp),
                        shape = RoundedCornerShape(28.dp),
                    ) {
                        Text("Start collecting", style = MaterialTheme.typography.titleMedium)
                    }
                    Spacer(Modifier.height(8.dp))
                    Text(
                        if (ready) "You can change any of this later." else "Step 1 is needed to start. The others are recommended.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun StepCard(number: Int, step: Step) {
    val status = LocalStatusColors.current
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(
            containerColor = if (step.done) status.good else MaterialTheme.colorScheme.surfaceContainerLow,
        ),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                EmojiBadge(step.emoji)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(
                        "STEP $number" + if (step.required) " · NEEDED" else " · RECOMMENDED",
                        style = MaterialTheme.typography.labelMedium,
                        color = if (step.done) status.onGood else MaterialTheme.colorScheme.primary,
                    )
                    Text(step.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                }
            }
            Text(step.why, style = MaterialTheme.typography.bodyMedium)
            if (step.done) {
                Text("✓ Done", style = MaterialTheme.typography.titleSmall, color = status.onGood, fontWeight = FontWeight.SemiBold)
            } else {
                FilledTonalButton(onClick = step.onClick, modifier = Modifier.fillMaxWidth()) { Text(step.action) }
            }
        }
    }
}

@Composable
private fun SamsungTip(onAppInfo: () -> Unit) {
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceContainerLow),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text("💡 Samsung tip", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            Text(
                "Samsung phones also put apps to sleep. In App info → Battery choose \"Unrestricted\", and add " +
                    "Lifelog to Battery → Background usage limits → Never sleeping apps.",
                style = MaterialTheme.typography.bodyMedium,
            )
            OutlinedButton(onClick = onAppInfo) { Text("Open app info") }
        }
    }
}

@Preview(showBackground = true, heightDp = 1300)
@Composable
private fun OnboardingPreview() {
    LifelogTheme {
        OnboardingScreen(
            DeviceChecks(DeviceStatus("0.1.0", usageAccessGranted = true, batteryOptimizationIgnored = false), false),
            OnboardingActions(),
        )
    }
}
