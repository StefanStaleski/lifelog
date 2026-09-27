package io.github.stefanstaleski.lifelog.checkin

/** One answer on a 1–5 scale: what the button shows and what it means. */
data class ScaleOption(val value: Int, val emoji: String, val label: String)

data class Question(val key: String, val title: String, val options: List<ScaleOption>)

val MoodQuestion = Question(
    "mood", "Mood",
    listOf(
        ScaleOption(1, "😞", "Rough"),
        ScaleOption(2, "😕", "Meh"),
        ScaleOption(3, "😐", "Okay"),
        ScaleOption(4, "🙂", "Good"),
        ScaleOption(5, "😄", "Great"),
    ),
)

val EnergyQuestion = Question(
    "energy", "Energy",
    listOf(
        ScaleOption(1, "😩", "Drained"),
        ScaleOption(2, "😴", "Tired"),
        ScaleOption(3, "😐", "Okay"),
        ScaleOption(4, "🔋", "Good"),
        ScaleOption(5, "⚡", "Buzzing"),
    ),
)

val FocusQuestion = Question(
    "focus", "Focus",
    listOf(
        ScaleOption(1, "🌫️", "Scattered"),
        ScaleOption(2, "🌀", "Distracted"),
        ScaleOption(3, "😐", "Okay"),
        ScaleOption(4, "🎯", "Focused"),
        ScaleOption(5, "🧠", "In the zone"),
    ),
)

/** Quick picks; anything else can be typed. Kept short so they fit on two rows. */
val SuggestedTags = listOf("gym", "walk", "deep work", "social", "family", "travel", "stress", "sick", "alcohol", "late night")
