package io.github.stefanstaleski.lifelog.collectors.notifications

/** What we look at in a posted notification: flags only, never its title or text. */
data class PostedNotification(
    val packageName: String,
    val key: String,
    val ongoing: Boolean,
    val groupSummary: Boolean,
    val onlyAlertOnce: Boolean,
)

/**
 * Decides whether a post counts as "a notification arrived". Ongoing ones (music, navigation,
 * downloads) and group summaries aren't; a silent update of one we already counted isn't either.
 */
class NotificationCounter(private val ownPackage: String) {
    private val seenKeys = LinkedHashSet<String>()

    fun counts(n: PostedNotification): Boolean {
        if (n.packageName == ownPackage || n.ongoing || n.groupSummary) return false
        val seen = !seenKeys.add(n.key)
        if (seenKeys.size > MAX_KEYS) seenKeys.remove(seenKeys.first())
        return !(seen && n.onlyAlertOnce)
    }

    private companion object {
        const val MAX_KEYS = 500
    }
}

fun hourStart(epochMs: Long): Long = Math.floorDiv(epochMs, 3_600_000L) * 3_600_000L
