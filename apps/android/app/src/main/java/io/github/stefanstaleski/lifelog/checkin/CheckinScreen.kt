package io.github.stefanstaleski.lifelog.checkin

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.selected
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.stefanstaleski.lifelog.ui.common.SectionCard
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.Locale

data class CheckinActions(
    val onAnswer: (key: String, value: Int) -> Unit = { _, _ -> },
    val onToggleTag: (String) -> Unit = {},
    val onNote: (String) -> Unit = {},
    val onSave: () -> Unit = {},
    val onClose: () -> Unit = {},
)

private val dateFormat = DateTimeFormatter.ofPattern("EEEE, d MMMM", Locale.ENGLISH)

@Composable
fun CheckinScreen(form: CheckinForm, today: LocalDate, saved: Boolean, actions: CheckinActions) {
    Scaffold { padding ->
        if (saved) {
            SavedMessage(Modifier.padding(padding), actions.onClose)
            return@Scaffold
        }
        Column(
            Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Spacer(Modifier.weight(1f))
                TextButton(onClick = actions.onClose) { Text("Close") }
            }
            Column(Modifier.padding(horizontal = 4.dp)) {
                Text("🌙", fontSize = 40.sp)
                Text("How was today?", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
                Text(
                    dateFormat.format(form.date) + if (form.date != today) " (last night)" else "",
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                )
            }
            listOf(MoodQuestion, EnergyQuestion, FocusQuestion).forEach { q ->
                ScaleCard(q, form.valueOf(q.key)) { actions.onAnswer(q.key, it) }
            }
            TagsCard(form.tags, actions.onToggleTag)
            SectionCard("Note · optional") {
                OutlinedTextField(
                    value = form.note,
                    onValueChange = actions.onNote,
                    placeholder = { Text("Anything worth remembering?") },
                    minLines = 3,
                    modifier = Modifier.fillMaxWidth(),
                    keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
                )
            }
            Button(
                onClick = actions.onSave,
                enabled = form.canSave,
                modifier = Modifier.fillMaxWidth().height(56.dp),
                shape = RoundedCornerShape(28.dp),
            ) {
                Text(if (form.editing) "Update check-in" else "Save check-in", style = MaterialTheme.typography.titleMedium)
            }
            if (!form.canSave) {
                Text(
                    "Pick mood, energy and focus to save.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    textAlign = TextAlign.Center,
                    modifier = Modifier.fillMaxWidth(),
                )
            }
            Spacer(Modifier.height(16.dp))
        }
    }
}

@Composable
private fun ScaleCard(question: Question, selected: Int?, onSelect: (Int) -> Unit) {
    SectionCard(question.title) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            question.options.forEach { option ->
                val isSelected = option.value == selected
                Surface(
                    onClick = { onSelect(option.value) },
                    shape = CircleShape,
                    color = if (isSelected) MaterialTheme.colorScheme.primaryContainer else MaterialTheme.colorScheme.surfaceContainerHighest,
                    border = if (isSelected) BorderStroke(3.dp, MaterialTheme.colorScheme.primary) else null,
                    modifier = Modifier
                        .size(56.dp)
                        .semantics {
                            this.selected = isSelected
                            contentDescription = "${question.title}: ${option.label}"
                        },
                ) {
                    Row(horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
                        Text(option.emoji, fontSize = if (isSelected) 30.sp else 26.sp)
                    }
                }
            }
        }
        Text(
            question.options.firstOrNull { it.value == selected }?.label ?: "Tap one",
            style = MaterialTheme.typography.titleSmall,
            color = if (selected != null) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@OptIn(ExperimentalLayoutApi::class)
@Composable
private fun TagsCard(tags: List<String>, onToggle: (String) -> Unit) {
    var custom by remember { mutableStateOf("") }
    val addCustom = {
        if (custom.isNotBlank()) onToggle(custom)
        custom = ""
    }
    SectionCard("Anything notable?") {
        FlowRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            // Suggestions first, then anything typed that isn't one of them.
            (SuggestedTags + tags.filterNot { it in SuggestedTags }).forEach { tag ->
                FilterChip(selected = tag in tags, onClick = { onToggle(tag) }, label = { Text(tag) })
            }
        }
        OutlinedTextField(
            value = custom,
            onValueChange = { custom = it.take(CheckinForm.MAX_TAG_LENGTH) },
            placeholder = { Text("Add your own") },
            singleLine = true,
            trailingIcon = { TextButton(onClick = addCustom, enabled = custom.isNotBlank()) { Text("Add") } },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Done),
            keyboardActions = KeyboardActions(onDone = { addCustom() }),
            modifier = Modifier.fillMaxWidth(),
        )
    }
}

@Composable
private fun SavedMessage(modifier: Modifier, onClose: () -> Unit) {
    Column(
        modifier.fillMaxSize().padding(32.dp),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text("✨", fontSize = 64.sp)
        Spacer(Modifier.height(16.dp))
        Text("Saved!", style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.SemiBold)
        Text(
            "Thanks. See you tomorrow evening.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(32.dp))
        Button(onClick = onClose, modifier = Modifier.fillMaxWidth().height(56.dp), shape = RoundedCornerShape(28.dp)) {
            Text("Done", style = MaterialTheme.typography.titleMedium)
        }
    }
}
