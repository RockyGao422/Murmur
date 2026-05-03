package com.murmur.app.data.local.entity

import androidx.room.ColumnInfo
import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(
    tableName = "tool_catalog_items",
    indices = [
        Index(value = ["id"], unique = true)
    ]
)
data class ToolCatalogItemEntity(
    @PrimaryKey
    val id: String = "",

    @ColumnInfo(name = "name")
    val name: String = "",

    @ColumnInfo(name = "aliases_json")
    val aliasesJson: String = "[]",

    @ColumnInfo(name = "android_package_names_json")
    val androidPackageNamesJson: String = "[]",

    @ColumnInfo(name = "web_domains_json")
    val webDomainsJson: String = "[]",

    @ColumnInfo(name = "url_patterns_json")
    val urlPatternsJson: String = "[]",

    @ColumnInfo(name = "default_enabled")
    val defaultEnabled: Boolean = true,

    @ColumnInfo(name = "detection_enabled")
    val detectionEnabled: Boolean = true,

    @ColumnInfo(name = "is_default")
    val isDefault: Boolean = true,

    @ColumnInfo(name = "user_defined")
    val userDefined: Boolean = false,

    @ColumnInfo(name = "sort_order")
    val sortOrder: Int = 0,

    @ColumnInfo(name = "confidence_package_name")
    val confidencePackageName: Float = 0.98f,

    @ColumnInfo(name = "confidence_domain")
    val confidenceDomain: Float = 0.95f,

    @ColumnInfo(name = "confidence_url_pattern")
    val confidenceUrlPattern: Float = 0.90f,

    @ColumnInfo(name = "confidence_app_name")
    val confidenceAppName: Float = 0.85f,

    @ColumnInfo(name = "confidence_title")
    val confidenceTitle: Float = 0.65f,

    @ColumnInfo(name = "confidence_user_mapping")
    val confidenceUserMapping: Float = 1.0f
)
