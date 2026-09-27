package io.github.stefanstaleski.lifelog.core.network

import okhttp3.Interceptor
import okhttp3.MediaType
import okhttp3.RequestBody
import okhttp3.Response
import okio.BufferedSink
import okio.GzipSink
import okio.buffer

/** Adds `Authorization: Bearer <device token>` to every request. */
class AuthInterceptor(private val token: String) : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response =
        chain.proceed(chain.request().newBuilder().header("Authorization", "Bearer $token").build())
}

/** Gzips request bodies (event batches shrink ~10x). The server accepts `Content-Encoding: gzip`. */
class GzipRequestInterceptor : Interceptor {
    override fun intercept(chain: Interceptor.Chain): Response {
        val request = chain.request()
        val body = request.body ?: return chain.proceed(request)
        if (request.header("Content-Encoding") != null) return chain.proceed(request)
        return chain.proceed(
            request.newBuilder()
                .header("Content-Encoding", "gzip")
                .method(request.method, GzipBody(body))
                .build(),
        )
    }

    private class GzipBody(private val body: RequestBody) : RequestBody() {
        override fun contentType(): MediaType? = body.contentType()
        override fun contentLength(): Long = -1 // unknown until compressed
        override fun writeTo(sink: BufferedSink) {
            GzipSink(sink).buffer().use { body.writeTo(it) }
        }
    }
}
