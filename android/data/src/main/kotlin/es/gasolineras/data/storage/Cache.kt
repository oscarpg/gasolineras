package es.gasolineras.data.storage

import kotlinx.serialization.KSerializer
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.longOrNull

/**
 * JSON cache on top of a [KeyValueStorage], with expiry and eviction. Port of storage/cache.ts:
 * same entry format `{"v": value, "e": expiresAt|null, "w": writtenAt}`.
 *
 * When the storage is full, the oldest entries of this cache are removed one by one until the
 * new value fits. Entries outside the namespace are never touched.
 */
class Cache(
    private val storage: KeyValueStorage,
    /** Prefix for every key, including a version so the format can change safely. */
    private val namespace: String,
    private val now: () -> Long = System::currentTimeMillis,
) {
    private val json = Json { ignoreUnknownKeys = true }

    private fun fullKey(key: String) = namespace + key

    private class Entry(val value: JsonElement, val expiresAt: Long?, val writtenAt: Long)

    private fun read(storageKey: String): Entry? {
        val raw = storage.getItem(storageKey) ?: return null
        return try {
            val o = json.parseToJsonElement(raw).jsonObject
            Entry(o.getValue("v"), (o["e"] as? JsonPrimitive)?.longOrNull, (o["w"] as JsonPrimitive).longOrNull!!)
        } catch (e: Exception) {
            storage.removeItem(storageKey)
            null
        }
    }

    private fun Entry.isExpired() = expiresAt != null && expiresAt <= now()

    private fun ownKeys() = storage.keys().filter { it.startsWith(namespace) }

    private fun evictOldest(except: String): Boolean {
        val oldest = ownKeys().filter { it != except }.minByOrNull { read(it)?.writtenAt ?: Long.MIN_VALUE } ?: return false
        storage.removeItem(oldest)
        return true
    }

    fun <T> get(key: String, serializer: KSerializer<T>): T? {
        val storageKey = fullKey(key)
        val entry = read(storageKey) ?: return null
        if (entry.isExpired()) {
            storage.removeItem(storageKey)
            return null
        }
        return try {
            json.decodeFromJsonElement(serializer, entry.value)
        } catch (e: Exception) {
            storage.removeItem(storageKey)
            null
        }
    }

    /** Returns false if the value couldn't be stored even after evicting everything else in the cache. */
    fun <T> set(key: String, value: T, serializer: KSerializer<T>, ttlMs: Long? = null): Boolean {
        val storageKey = fullKey(key)
        val t = now()
        val serialized = JsonObject(
            mapOf(
                "v" to json.encodeToJsonElement(serializer, value),
                "e" to (ttlMs?.let { JsonPrimitive(t + it) } ?: JsonNull),
                "w" to JsonPrimitive(t),
            ),
        ).toString()
        while (true) {
            try {
                storage.setItem(storageKey, serialized)
                return true
            } catch (e: StorageFullException) {
                if (!evictOldest(storageKey)) return false
            }
        }
    }

    fun delete(key: String) = storage.removeItem(fullKey(key))

    /** Removes expired and unreadable entries; returns how many were removed. */
    fun purgeExpired(): Int {
        var removed = 0
        for (key in ownKeys()) {
            val entry = read(key)
            if (entry == null || entry.isExpired()) {
                storage.removeItem(key)
                removed++
            }
        }
        return removed
    }
}
