package io.github.stefanstaleski.lifelog.di

import android.os.Build
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.stefanstaleski.lifelog.BuildConfig
import io.github.stefanstaleski.lifelog.core.network.NetworkConfig

@Module
@InstallIn(SingletonComponent::class)
object AppModule {
    @Provides
    fun networkConfig(): NetworkConfig = NetworkConfig(
        baseUrl = BuildConfig.API_BASE_URL,
        deviceToken = BuildConfig.DEVICE_TOKEN,
        // e.g. "SM-S921B"; stable per phone and needs no permission.
        deviceId = Build.MODEL.take(64),
    )
}
