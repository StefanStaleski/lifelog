package io.github.stefanstaleski.lifelog.ui.status

import androidx.compose.foundation.clickable
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
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.tooling.preview.Preview
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import io.github.stefanstaleski.lifelog.ui.LifelogTheme
import io.github.stefanstaleski.lifelog.ui.LocalStatusColors
import io.github.stefanstaleski.lifelog.ui.common.Dot
import io.github.stefanstaleski.lifelog.ui.common.EmojiBadge
import io.github.stefanstaleski.lifelog.ui.common.SectionCard
import io.github.stefanstaleski.lifelog.ui.common.minutesLabel
import io.github.stefanstaleski.lifelog.ui.common.relativeTime
import java.time.Instant

data class StatusActions(
    val onFix: (Fix) -> Unit = {},
    val onSyncNow: () -> Unit = {},
    val onPausedChange: (Boolean) -> Unit = {},
    /** null until the check-in screen exists; hides the card. */
    val onCheckin: (() -> Unit)? = null,
)

@Composable
fun StatusScreen(ui: StatusUi, now: Instant, actions: StatusActions) {
    Scaffold { padding ->
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(
                start = 16.dp,
                end = 16.dp,
                top = padding.calculateTopPadding() + 16.dp,
                bottom = padding.calculateBottomPadding() + 24.dp,
            ),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            item { Header() }
            item { HeroCard(ui) }
            items(ui.problems.size) { i -> ProblemCard(ui.problems[i], actions.onFix) }
            actions.onCheckin?.let { onCheckin -> item { CheckinCard(onCheckin) } }
            item { TodayCard(ui.today) }
            item { SourcesCard(ui.sources, now) }
            item { UploadCard(ui, now, actions.onSyncNow) }
            item { PauseCard(ui.paused, actions.onPausedChange) }
            item {
                Text(
                    "Lifelog only counts things. It never reads messages, notifications or what's on screen.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 8.dp),
                )
            }
        }
    }
}

@Composable
private fun Header() {
    Column(Modifier.padding(horizontal = 4.dp)) {
        Text("Lifelog", style = MaterialTheme.typography.headlineLarge, fontWeight = FontWeight.SemiBold)
        Text(
            "Your day, quietly noted",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun HeroCard(ui: StatusUi) {
    val status = LocalStatusColors.current
    val (container, content, emoji) = when (ui.health) {
        Health.GOOD -> Triple(status.good, status.onGood, "✅")
        Health.ATTENTION -> Triple(status.attention, status.onAttention, "⚠️")
        Health.PAUSED -> Triple(MaterialTheme.colorScheme.surfaceVariant, MaterialTheme.colorScheme.onSurfaceVariant, "⏸️")
    }
    Card(
        shape = RoundedCornerShape(28.dp),
        colors = CardDefaults.cardColors(containerColor = container, contentColor = content),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(24.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(emoji, fontSize = 40.sp)
            Spacer(Modifier.width(16.dp))
            Column {
                Text(ui.headline, style = MaterialTheme.typography.headlineSmall, fontWeight = FontWeight.SemiBold)
                Text(ui.subline, style = MaterialTheme.typography.bodyMedium)
            }
        }
    }
}

@Composable
private fun ProblemCard(problem: Problem, onFix: (Fix) -> Unit) {
    val status = LocalStatusColors.current
    Card(
        shape = RoundedCornerShape(24.dp),
        colors = CardDefaults.cardColors(containerColor = status.attention, contentColor = status.onAttention),
        modifier = Modifier.fillMaxWidth(),
    ) {
        Row(Modifier.padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(problem.emoji, fontSize = 28.sp)
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(problem.title, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(problem.detail, style = MaterialTheme.typography.bodyMedium)
            }
            if (problem.action != null) {
                Spacer(Modifier.width(8.dp))
                Button(onClick = { onFix(problem.fix) }) { Text(problem.action) }
            }
        }
    }
}

@Composable
private fun CheckinCard(onCheckin: () -> Unit) {
    SectionCard(title = null, modifier = Modifier.clickable(onClick = onCheckin)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EmojiBadge("🌙")
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("How was today?", style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    "5-second check-in: mood, energy, focus",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            FilledTonalButton(onClick = onCheckin) { Text("Check in") }
        }
    }
}

@Composable
private fun TodayCard(today: TodaySummary) {
    SectionCard("Today") {
        Row(Modifier.fillMaxWidth()) {
            BigNumber(minutesLabel(today.screenTimeMin), "screen time", Modifier.weight(1f))
            BigNumber(today.unlocks.toString(), "unlocks", Modifier.weight(1f))
            today.steps?.let { BigNumber("%,d".format(it), "steps", Modifier.weight(1f)) }
        }
        if (today.topApps.isNotEmpty()) {
            HorizontalDivider()
            Text("Most used", style = MaterialTheme.typography.titleSmall)
            val max = today.topApps.maxOf { it.minutes }.coerceAtLeast(1)
            today.topApps.forEach { app ->
                Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                    Row {
                        Text(app.label, style = MaterialTheme.typography.bodyLarge, modifier = Modifier.weight(1f))
                        Text(minutesLabel(app.minutes), style = MaterialTheme.typography.bodyLarge, fontWeight = FontWeight.Medium)
                    }
                    LinearProgressIndicator(
                        progress = { app.minutes.toFloat() / max },
                        modifier = Modifier.fillMaxWidth().height(8.dp),
                        strokeCap = StrokeCap.Round,
                        drawStopIndicator = {},
                    )
                }
            }
        }
        Text(
            "Updates every 30 minutes.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )
    }
}

@Composable
private fun BigNumber(value: String, label: String, modifier: Modifier = Modifier) {
    Column(modifier) {
        Text(value, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Text(label, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun SourcesCard(sources: List<SourceRow>, now: Instant) {
    val status = LocalStatusColors.current
    SectionCard("What's being recorded") {
        sources.forEach { s ->
            Row(verticalAlignment = Alignment.CenterVertically) {
                EmojiBadge(s.emoji)
                Spacer(Modifier.width(14.dp))
                Column(Modifier.weight(1f)) {
                    Text(s.name, style = MaterialTheme.typography.titleSmall)
                    Text(
                        s.hint,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
                Spacer(Modifier.width(12.dp))
                Column(horizontalAlignment = Alignment.End) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Dot(if (s.fresh) status.goodDot else status.attentionDot)
                        Spacer(Modifier.width(6.dp))
                        Text(
                            s.lastSeen?.let { relativeTime(it, now, LocalZone) } ?: "not yet",
                            style = MaterialTheme.typography.bodyMedium,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun UploadCard(ui: StatusUi, now: Instant, onSyncNow: () -> Unit) {
    SectionCard("Backup to your dashboard") {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EmojiBadge("☁️")
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text(
                    if (ui.pending == 0) "Everything is uploaded" else "${ui.pending} waiting to upload",
                    style = MaterialTheme.typography.titleSmall,
                )
                Text(
                    ui.lastUploadAt?.let { "Last upload ${relativeTime(it, now, LocalZone)}" } ?: "No upload yet",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            TextButton(onClick = onSyncNow) { Text("Sync now") }
        }
    }
}

@Composable
private fun PauseCard(paused: Boolean, onPausedChange: (Boolean) -> Unit) {
    SectionCard(title = null) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            EmojiBadge(if (paused) "⏸️" else "▶️")
            Spacer(Modifier.width(14.dp))
            Column(Modifier.weight(1f)) {
                Text("Pause collection", style = MaterialTheme.typography.titleSmall)
                Text(
                    if (paused) "Paused. Nothing new is recorded." else "Stop recording for a while, any time.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            Switch(checked = paused, onCheckedChange = onPausedChange)
        }
    }
}

private val previewNow = Instant.parse("2026-09-27T16:00:00Z")

private fun previewUi(health: Health) = StatusUi(
    health = health,
    headline = if (health == Health.GOOD) "All good" else "One thing needs you",
    subline = if (health == Health.GOOD) "Lifelog is quietly collecting in the background." else "Tap a card below to fix it.",
    problems = if (health == Health.GOOD) emptyList() else listOf(
        Problem("🔋", "Battery saver may pause Lifelog", "Allow it to run in the background so no data is missed.", Fix.BATTERY, "Allow"),
    ),
    today = TodaySummary(192, 47, listOf(AppTime("Chat", 74), AppTime("Browser", 41), AppTime("Maps", 12))),
    sources = listOf(
        SourceRow("📱", "Screen time", previewNow.minusSeconds(900), true, "Counted in 30-minute blocks"),
        SourceRow("🔓", "Unlocks", previewNow.minusSeconds(300), true, "Each time you unlock the phone"),
        SourceRow("👟", "Steps", previewNow.minusSeconds(3000), true, "Hourly, from Health Connect"),
        SourceRow("🌙", "Evening check-in", null, false, "Once a day, at 21:30"),
        SourceRow("💓", "Background check", previewNow.minusSeconds(600), true, "Lifelog checking in every 30 min"),
    ),
    pending = 12,
    lastUploadAt = previewNow.minusSeconds(420),
    paused = false,
)

@Preview(showBackground = true, heightDp = 1400)
@Composable
private fun StatusGoodPreview() {
    LifelogTheme { StatusScreen(previewUi(Health.GOOD), previewNow, StatusActions()) }
}

@Preview(showBackground = true, heightDp = 1500)
@Composable
private fun StatusAttentionPreview() {
    LifelogTheme { StatusScreen(previewUi(Health.ATTENTION), previewNow, StatusActions()) }
}
