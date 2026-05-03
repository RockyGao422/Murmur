package com.murmur.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "ignored_targets",
    indices = [
        Index(value = ["package_name_or_domain"], unique = true)
    ]
)
data class IgnoredTargetEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,

    @ColumnInfo(name = "package_name_or_domain")
    val packageNameOrDomain: String = "",

    @ColumnInfo(name = "reason")
    val reason: String = "",

    @ColumnInfo(name = "created_at")
    val createdAt: Long = 0,

    @ColumnInfo(name = "expires_at")
    val expiresAt: Long? = null,

    @ColumnInfo(name = "permanent")
    val permanent: Boolean = false
)
