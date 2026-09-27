package io.github.stefanstaleski.lifelog.checkin

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.data.model.CheckinPayload
import java.time.LocalDate
import org.junit.Test

class CheckinFormTest {
    private val empty = CheckinForm(LocalDate.of(2026, 9, 27))

    @Test fun needsAllThreeAnswers() {
        val partial = empty.answer("mood", 4).answer("energy", 2)
        assertThat(partial.canSave).isFalse()
        assertThat(partial.answer("focus", 5).canSave).isTrue()
    }

    @Test fun answeringAgainChangesTheAnswer() {
        assertThat(empty.answer("mood", 2).answer("mood", 5).mood).isEqualTo(5)
    }

    @Test fun tagsAreNormalisedAndToggle() {
        val form = empty.toggleTag("  Deep   Work ").toggleTag("gym").toggleTag("deep work")
        assertThat(form.tags).containsExactly("gym")
        assertThat(empty.toggleTag("   ").tags).isEmpty()
        assertThat(empty.toggleTag("x".repeat(60)).tags.single()).hasLength(CheckinForm.MAX_TAG_LENGTH)
    }

    @Test fun atMostTwentyTags() {
        val full = (1..25).fold(empty) { f, i -> f.toggleTag("tag$i") }
        assertThat(full.tags).hasSize(CheckinForm.MAX_TAGS)
    }

    @Test fun payloadTrimsNoteAndUsesNullWhenBlank() {
        val base = empty.answer("mood", 4).answer("energy", 3).answer("focus", 5).toggleTag("gym")
        assertThat(base.withNote("   ").toPayload()).isEqualTo(CheckinPayload("2026-09-27", 4, 3, 5, listOf("gym"), null))
        assertThat(base.withNote("  Long walk. ").toPayload().note).isEqualTo("Long walk.")
        assertThat(base.withNote("x".repeat(3000)).note).hasLength(CheckinForm.MAX_NOTE)
    }

    @Test fun editingStartsFromTheSavedCheckin() {
        val form = CheckinForm.from(CheckinPayload("2026-09-27", 1, 2, 3, listOf("sick"), "Flu"))
        assertThat(form.editing).isTrue()
        assertThat(form.toPayload()).isEqualTo(CheckinPayload("2026-09-27", 1, 2, 3, listOf("sick"), "Flu"))
    }
}
