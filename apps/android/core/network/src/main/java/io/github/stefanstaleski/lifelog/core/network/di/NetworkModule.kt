package io.github.stefanstaleski.lifelog.core.network.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.stefanstaleski.lifelog.core.network.AuthInterceptor
import io.github.stefanstaleski.lifelog.core.network.GzipRequestInterceptor
import io.github.stefanstaleski.lifelog.core.network.LifelogApi
import io.github.stefanstaleski.lifelog.core.network.NetworkConfig
import io.github.stefanstaleski.lifelog.core.network.createApi
import java.util.concurrent.TimeUnit
import javax.inject.Singleton
import okhttp3.OkHttpClient

@Module
@InstallIn(SingletonComponent::class)
object NetworkModule {
    @Provides
    @Singleton
    fun okHttp(config: NetworkConfig): OkHttpClient = OkHttpClient.Builder()
        .addInterceptor(AuthInterceptor(config.deviceToken))
        .addInterceptor(GzipRequestInterceptor())
        .connectTimeout(20, TimeUnit.SECONDS)
        .readTimeout(60, TimeUnit.SECONDS)
        .build()

    @Provides
    @Singleton
    fun api(config: NetworkConfig, client: OkHttpClient): LifelogApi = createApi(config.baseUrl, client)
}
