package io.github.stefanstaleski.lifelog.checkin

import io.github.stefanstaleski.lifelog.core.data.model.CheckinPayload
import java.time.LocalDate

/** Everything on the check-in screen. Pure, so the rules are easy to test. */
data class CheckinForm(
    val date: LocalDate,
    val mood: Int? = null,
    val energy: Int? = null,
    val focus: Int? = null,
    /** In the order they were picked. */
    val tags: List<String> = emptyList(),
    val note: String = "",
    /** True when this date already has a saved check-in (the screen says "Update"). */
    val editing: Boolean = false,
) {
    val canSave: Boolean get() = mood != null && energy != null && focus != null

    fun answer(key: String, value: Int) = when (key) {
        MoodQuestion.key -> copy(mood = value)
        EnergyQuestion.key -> copy(energy = value)
        FocusQuestion.key -> copy(focus = value)
        else -> this
    }

    fun valueOf(key: String): Int? = when (key) {
        MoodQuestion.key -> mood
        EnergyQuestion.key -> energy
        FocusQuestion.key -> focus
        else -> null
    }

    fun toggleTag(raw: String): CheckinForm {
        val tag = normalizeTag(raw) ?: return this
        return when {
            tag in tags -> copy(tags = tags - tag)
            tags.size >= MAX_TAGS -> this
            else -> copy(tags = tags + tag)
        }
    }

    fun withNote(text: String) = copy(note = text.take(MAX_NOTE))

    fun toPayload(): CheckinPayload {
        check(canSave) { "mood, energy and focus are required" }
        return CheckinPayload(
            date = date.toString(),
            mood = mood!!,
            energy = energy!!,
            focus = focus!!,
            tags = tags,
            note = note.trim().ifEmpty { null },
        )
    }

    companion object {
        /** Limits from the wire contract (packages/shared/src/events.ts). */
        const val MAX_TAGS = 20
        const val MAX_TAG_LENGTH = 40
        const val MAX_NOTE = 2000

        fun normalizeTag(raw: String): String? =
            raw.trim().lowercase().replace(Regex("\\s+"), " ").take(MAX_TAG_LENGTH).ifEmpty { null }

        fun from(payload: CheckinPayload) = CheckinForm(
            date = LocalDate.parse(payload.date),
            mood = payload.mood,
            energy = payload.energy,
            focus = payload.focus,
            tags = payload.tags,
            note = payload.note.orEmpty(),
            editing = true,
        )
    }
}
