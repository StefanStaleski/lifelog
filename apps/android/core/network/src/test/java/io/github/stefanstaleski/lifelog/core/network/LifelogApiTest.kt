package io.github.stefanstaleski.lifelog.core.network

import com.google.common.truth.Truth.assertThat
import io.github.stefanstaleski.lifelog.core.network.model.EventBatchRequest
import io.github.stefanstaleski.lifelog.core.network.model.WireEvent
import java.util.zip.GZIPInputStream
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.json.Json
import mockwebserver3.MockResponse
import mockwebserver3.MockWebServer
import okhttp3.OkHttpClient
import org.junit.After
import org.junit.Before
import org.junit.Test
import retrofit2.HttpException

class LifelogApiTest {
    private val server = MockWebServer()
    private lateinit var api: LifelogApi

    @Before fun setUp() {
        server.start()
        val client = OkHttpClient.Builder()
            .addInterceptor(AuthInterceptor("secret-token"))
            .addInterceptor(GzipRequestInterceptor())
            .build()
        api = createApi(server.url("/").toString(), client)
    }

    @After fun tearDown() = server.close()

    private fun json(code: Int, body: String) =
        MockResponse.Builder().code(code).addHeader("Content-Type", "application/json").body(body).build()

    @Test fun uploadsGzippedAuthenticatedBatch() = runTest {
        server.enqueue(json(200, Fixtures.api("ingest-response.json")))
        val event = WireJson.decodeFromString<WireEvent>(Fixtures.validEvents().getValue("unlock"))

        val result = api.uploadBatch(EventBatchRequest(listOf(event)))

        assertThat(result.accepted).isEqualTo(498)
        val request = server.takeRequest()
        assertThat(request.target).isEqualTo("/api/v1/events/batch")
        assertThat(request.headers["Authorization"]).isEqualTo("Bearer secret-token")
        assertThat(request.headers["Content-Encoding"]).isEqualTo("gzip")
        val sent = GZIPInputStream(request.body!!.toByteArray().inputStream()).readBytes().decodeToString()
        assertThat(Json.parseToJsonElement(sent)).isEqualTo(
            Json.parseToJsonElement("""{"events":[${Fixtures.validEvents().getValue("unlock")}]}"""),
        )
    }

    @Test fun getRequestsAreNotGzipped() = runTest {
        server.enqueue(json(200, Fixtures.api("config-response.json")))
        assertThat(api.config().collectionIntervalMin).isEqualTo(30)
        val request = server.takeRequest()
        assertThat(request.headers["Content-Encoding"]).isNull()
        assertThat(request.headers["Authorization"]).isEqualTo("Bearer secret-token")
    }

    @Test fun serverErrorsSurfaceAsHttpException() = runTest {
        server.enqueue(json(500, """{"error":"boom"}"""))
        val e = runCatching { api.health() }.exceptionOrNull()
        assertThat(e).isInstanceOf(HttpException::class.java)
        assertThat((e as HttpException).code()).isEqualTo(500)
    }
}
