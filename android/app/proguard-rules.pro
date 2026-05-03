# Murmur ProGuard Rules
# Keep all room entities and DAOs
-keep class com.murmur.app.data.local.entity.** { *; }
-keep class com.murmur.app.data.local.dao.** { *; }

# Keep domain models for serialization
-keep class com.murmur.app.domain.model.** { *; }

# Keep data classes
-keepattributes *Annotation*
-keepattributes Signature
