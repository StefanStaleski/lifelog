package io.github.stefanstaleski.lifelog.checkin

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dagger.hilt.android.AndroidEntryPoint
import io.github.stefanstaleski.lifelog.ui.LifelogTheme

/** Its own activity so the notification can open it directly, on top of whatever is running. */
@AndroidEntryPoint
class CheckinActivity : ComponentActivity() {
    private val viewModel: CheckinViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val form by viewModel.form.collectAsStateWithLifecycle()
            val saved by viewModel.saved.collectAsStateWithLifecycle()
            LifelogTheme {
                CheckinScreen(
                    form,
                    viewModel.today,
                    saved,
                    CheckinActions(
                        onAnswer = viewModel::answer,
                        onToggleTag = viewModel::toggleTag,
                        onNote = viewModel::setNote,
                        onSave = viewModel::save,
                        onClose = ::finish,
                    ),
                )
            }
        }
    }
}
