package io.github.stefanstaleski.lifelog.collectors.di

import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import dagger.multibindings.Multibinds
import io.github.stefanstaleski.lifelog.collectors.PolledCollector

/** Collectors join the set with `@Binds @IntoSet`. */
@Module
@InstallIn(SingletonComponent::class)
abstract class CollectorsModule {
    @Multibinds
    abstract fun polledCollectors(): Set<PolledCollector>
}
