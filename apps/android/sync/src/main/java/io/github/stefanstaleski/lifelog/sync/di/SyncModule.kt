package io.github.stefanstaleski.lifelog.sync.di

import dagger.Binds
import dagger.Module
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.stefanstaleski.lifelog.sync.AndroidDeviceStatusSource
import io.github.stefanstaleski.lifelog.sync.ConfigRefresher
import io.github.stefanstaleski.lifelog.sync.ConfigSync
import io.github.stefanstaleski.lifelog.sync.DeviceStatusSource

@Module
@InstallIn(SingletonComponent::class)
abstract class SyncModule {
    @Binds
    abstract fun deviceStatusSource(impl: AndroidDeviceStatusSource): DeviceStatusSource

    @Binds
    abstract fun configRefresher(impl: ConfigSync): ConfigRefresher
}
