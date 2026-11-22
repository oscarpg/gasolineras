package es.gasolineras.data.storage

import java.io.File
import java.io.IOException
import java.net.URLDecoder
import java.net.URLEncoder

/** Thrown by [KeyValueStorage.setItem] when the value doesn't fit. */
class StorageFullException(message: String) : IOException(message)

/** String key-value storage (the role localStorage plays in the web app). */
interface KeyValueStorage {
    fun getItem(key: String): String?

    /** @throws StorageFullException when the value doesn't fit. */
    fun setItem(key: String, value: String)
    fun removeItem(key: String)
    fun keys(): List<String>

    /** Whether [key] has a value, without reading it. */
    fun contains(key: String): Boolean = getItem(key) != null
}

/** In-memory storage with an optional size limit (counted as key + value characters). For tests. */
class MemoryStorage(private val capacity: Int = Int.MAX_VALUE) : KeyValueStorage {
    private val data = LinkedHashMap<String, String>()

    @Synchronized override fun getItem(key: String) = data[key]

    @Synchronized override fun setItem(key: String, value: String) {
        val used = data.entries.filter { it.key != key }.sumOf { it.key.length + it.value.length }
        if (used + key.length + value.length > capacity) throw StorageFullException("Memory storage full")
        data[key] = value
    }

    @Synchronized override fun removeItem(key: String) {
        data.remove(key)
    }

    @Synchronized override fun keys() = data.keys.toList()

    @Synchronized override fun contains(key: String) = key in data
}

/**
 * One file per key in [directory], written atomically (temp file + rename), with a total
 * size limit in bytes. Keys are URL-encoded into file names.
 */
class FileStorage(private val directory: File, private val maxBytes: Long = Long.MAX_VALUE) : KeyValueStorage {
    private fun fileFor(key: String) = File(directory, URLEncoder.encode(key, "UTF-8") + SUFFIX)

    @Synchronized override fun getItem(key: String): String? =
        fileFor(key).takeIf { it.isFile }?.let { runCatching { it.readText() }.getOrNull() }

    @Synchronized override fun setItem(key: String, value: String) {
        directory.mkdirs()
        val target = fileFor(key)
        val bytes = value.toByteArray()
        val used = files().filter { it != target }.sumOf { it.length() }
        if (used + bytes.size > maxBytes) throw StorageFullException("Storage limit of $maxBytes bytes reached")
        val temp = File(directory, target.name + ".tmp")
        temp.writeBytes(bytes)
        if (!temp.renameTo(target)) {
            target.delete()
            if (!temp.renameTo(target)) throw IOException("Could not write ${target.name}")
        }
    }

    @Synchronized override fun removeItem(key: String) {
        fileFor(key).delete()
    }

    @Synchronized override fun contains(key: String) = fileFor(key).isFile

    @Synchronized override fun keys(): List<String> =
        files().map { URLDecoder.decode(it.name.removeSuffix(SUFFIX), "UTF-8") }

    private fun files(): List<File> =
        directory.listFiles { f -> f.isFile && f.name.endsWith(SUFFIX) }?.toList().orEmpty()

    private companion object {
        const val SUFFIX = ".json"
    }
}
