package io.github.stefanstaleski.lifelog.collectors.usage

import android.content.Context
import android.content.Intent
import android.content.pm.ApplicationInfo
import android.content.pm.PackageManager
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

data class AppInfo(val label: String, val category: String?)

interface AppInfoProvider {
    fun info(packageName: String): AppInfo

    /** Home screen and system UI are not "using an app". */
    fun isExcluded(packageName: String): Boolean
}

@Singleton
class AndroidAppInfoProvider @Inject constructor(
    @ApplicationContext private val context: Context,
) : AppInfoProvider {
    private val pm = context.packageManager
    private val cache = mutableMapOf<String, AppInfo>()

    private val excluded: Set<String> by lazy {
        val home = pm.resolveActivity(Intent(Intent.ACTION_MAIN).addCategory(Intent.CATEGORY_HOME), 0)
            ?.activityInfo?.packageName
        setOfNotNull(home, "com.android.systemui", "android")
    }

    override fun isExcluded(packageName: String) = packageName in excluded

    override fun info(packageName: String): AppInfo = synchronized(cache) {
        cache.getOrPut(packageName) {
            try {
                val ai = pm.getApplicationInfo(packageName, 0)
                AppInfo(pm.getApplicationLabel(ai).toString().ifBlank { packageName }, categoryName(ai.category))
            } catch (_: PackageManager.NameNotFoundException) {
                AppInfo(packageName, null) // uninstalled since
            }
        }
    }

    private fun categoryName(category: Int): String? = when (category) {
        ApplicationInfo.CATEGORY_GAME -> "game"
        ApplicationInfo.CATEGORY_AUDIO -> "audio"
        ApplicationInfo.CATEGORY_VIDEO -> "video"
        ApplicationInfo.CATEGORY_IMAGE -> "image"
        ApplicationInfo.CATEGORY_SOCIAL -> "social"
        ApplicationInfo.CATEGORY_NEWS -> "news"
        ApplicationInfo.CATEGORY_MAPS -> "maps"
        ApplicationInfo.CATEGORY_PRODUCTIVITY -> "productivity"
        ApplicationInfo.CATEGORY_ACCESSIBILITY -> "accessibility"
        else -> null
    }
}
