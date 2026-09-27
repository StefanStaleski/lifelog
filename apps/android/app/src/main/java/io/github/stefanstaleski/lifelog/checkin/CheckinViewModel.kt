package io.github.stefanstaleski.lifelog.checkin

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.stefanstaleski.lifelog.core.data.LocalZone
import java.time.Clock
import java.time.LocalDate
import javax.inject.Inject
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch

@HiltViewModel
class CheckinViewModel @Inject constructor(
    savedState: SavedStateHandle,
    clock: Clock,
    private val repository: CheckinRepository,
    private val reminder: CheckinReminder,
) : ViewModel() {
    val today: LocalDate = clock.instant().atZone(LocalZone).toLocalDate()
    private val date = checkinDateFor(clock.instant().atZone(LocalZone))

    private val _form = MutableStateFlow(CheckinForm(date))
    val form: StateFlow<CheckinForm> = _form.asStateFlow()

    private val _saved = MutableStateFlow(false)
    val saved: StateFlow<Boolean> = _saved.asStateFlow()

    init {
        val quickMood = savedState.get<Int>(EXTRA_MOOD)?.takeIf { it in 1..5 }
        viewModelScope.launch {
            val existing = repository.latestFor(date)?.let(CheckinForm::from)
            _form.value = (existing ?: CheckinForm(date)).let { f -> quickMood?.let { f.copy(mood = it) } ?: f }
        }
    }

    fun answer(key: String, value: Int) = _form.update { it.answer(key, value) }
    fun toggleTag(tag: String) = _form.update { it.toggleTag(tag) }
    fun setNote(text: String) = _form.update { it.withNote(text) }

    fun save() {
        val form = _form.value
        if (!form.canSave) return
        viewModelScope.launch {
            repository.save(form.toPayload())
            reminder.dismiss()
            _saved.value = true
        }
    }

    companion object {
        /** Intent extra: mood picked from a notification button. */
        const val EXTRA_MOOD = "mood"
    }
}
