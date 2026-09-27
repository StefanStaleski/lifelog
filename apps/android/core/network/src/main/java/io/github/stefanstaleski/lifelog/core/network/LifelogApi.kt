package io.github.stefanstaleski.lifelog.core.network

import io.github.stefanstaleski.lifelog.core.network.model.ConfigResponse
import io.github.stefanstaleski.lifelog.core.network.model.EventBatchRequest
import io.github.stefanstaleski.lifelog.core.network.model.HealthResponse
import io.github.stefanstaleski.lifelog.core.network.model.IngestResponse
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import retrofit2.Retrofit
import retrofit2.converter.kotlinx.serialization.asConverterFactory
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.POST

/** Non-2xx responses throw retrofit2.HttpException; network failures throw IOException. */
interface LifelogApi {
    @POST("api/v1/events/batch")
    suspend fun uploadBatch(@Body batch: EventBatchRequest): IngestResponse

    @GET("api/v1/config")
    suspend fun config(): ConfigResponse

    @GET("api/v1/health")
    suspend fun health(): HealthResponse
}

fun createApi(baseUrl: String, client: OkHttpClient): LifelogApi = Retrofit.Builder()
    .baseUrl(baseUrl)
    .client(client)
    .addConverterFactory(WireJson.asConverterFactory("application/json".toMediaType()))
    .build()
    .create(LifelogApi::class.java)
