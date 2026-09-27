package io.github.stefanstaleski.lifelog.collectors.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.IntoSet
import dagger.multibindings.Multibinds
import io.github.stefanstaleski.lifelog.collectors.PolledCollector
import io.github.stefanstaleski.lifelog.collectors.usage.AndroidAppInfoProvider
import io.github.stefanstaleski.lifelog.collectors.usage.AndroidUsageEventSource
import io.github.stefanstaleski.lifelog.collectors.usage.AppInfoProvider
import io.github.stefanstaleski.lifelog.collectors.usage.UsageEventSource
import io.github.stefanstaleski.lifelog.collectors.usage.UsageStatsCollector

/** Collectors join the set with `@Binds @IntoSet`. */
@Module
@InstallIn(SingletonComponent::class)
abstract class CollectorsModule {
    @Multibinds
    abstract fun polledCollectors(): Set<PolledCollector>

    @Binds
    @IntoSet
    abstract fun usageStats(impl: UsageStatsCollector): PolledCollector

    @Binds
    abstract fun usageEventSource(impl: AndroidUsageEventSource): UsageEventSource

    @Binds
    abstract fun appInfoProvider(impl: AndroidAppInfoProvider): AppInfoProvider
}
