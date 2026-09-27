package io.github.stefanstaleski.lifelog.core.data.di

import android.content.Context
import androidx.room.Room
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.github.stefanstaleski.lifelog.core.data.LifelogJson
import io.github.stefanstaleski.lifelog.core.data.db.LifelogDatabase
import io.github.stefanstaleski.lifelog.core.data.db.PendingEventDao
import java.time.Clock
import javax.inject.Singleton
import kotlinx.serialization.json.Json

@Module
@InstallIn(SingletonComponent::class)
object DataModule {
    @Provides
    @Singleton
    fun database(@ApplicationContext context: Context): LifelogDatabase =
        Room.databaseBuilder(context, LifelogDatabase::class.java, "lifelog.db").build()

    @Provides
    fun pendingEventDao(db: LifelogDatabase): PendingEventDao = db.pendingEventDao()

    /** Wire JSON, see [LifelogJson]. */
    @Provides
    @Singleton
    fun json(): Json = LifelogJson

    @Provides
    @Singleton
    fun clock(): Clock = Clock.systemUTC()
}
