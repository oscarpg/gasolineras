package es.gasolineras.data

import es.gasolineras.data.storage.Cache
import es.gasolineras.data.storage.FileStorage
import es.gasolineras.data.storage.MemoryStorage
import es.gasolineras.data.storage.StorageFullException
import kotlinx.serialization.builtins.serializer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class StorageTest {
    @get:Rule val tmp = TemporaryFolder()

    private class Clock(var t: Long = 1_000_000) {
        fun advance(ms: Long) { t += ms }
    }

    private val S = String.serializer()
    private val I = Int.serializer()

    @Test fun `stores and reads values under its namespace`() {
        val storage = MemoryStorage()
        val cache = Cache(storage, "ns:")
        assertTrue(cache.set("a", mapOf("x" to 1), kotlinx.serialization.builtins.MapSerializer(S, I)))
        assertEquals(mapOf("x" to 1), cache.get("a", kotlinx.serialization.builtins.MapSerializer(S, I)))
        assertEquals(listOf("ns:a"), storage.keys())
        assertNull(cache.get("missing", I))
    }

    @Test fun `uses the web entry format`() {
        val storage = MemoryStorage()
        Cache(storage, "ns:", now = { 5 }).set("a", 1, I, ttlMs = 10)
        assertEquals("""{"v":1,"e":15,"w":5}""", storage.getItem("ns:a"))
    }

    @Test fun `expires entries after their TTL`() {
        val c = Clock()
        val cache = Cache(MemoryStorage(), "ns:", now = { c.t })
        cache.set("a", 1, I, ttlMs = 1000)
        c.advance(999)
        assertEquals(1, cache.get("a", I))
        c.advance(1)
        assertNull(cache.get("a", I))
    }

    @Test fun `keeps entries without TTL forever`() {
        val c = Clock()
        val cache = Cache(MemoryStorage(), "ns:", now = { c.t })
        cache.set("a", 1, I)
        c.advance(1_000_000_000_000)
        assertEquals(1, cache.get("a", I))
    }

    @Test fun `drops corrupted entries instead of throwing`() {
        val storage = MemoryStorage()
        storage.setItem("ns:a", "{not json")
        assertNull(Cache(storage, "ns:").get("a", I))
        assertNull(storage.getItem("ns:a"))
    }

    @Test fun `evicts the oldest entries of its own namespace when storage is full`() {
        val c = Clock()
        val storage = MemoryStorage(200)
        storage.setItem("other", "x".repeat(20)) // not ours: must survive
        val cache = Cache(storage, "ns:", now = { c.t })
        cache.set("old", "a".repeat(40), S)
        c.advance(1)
        cache.set("mid", "b".repeat(40), S)
        c.advance(1)
        assertTrue(cache.set("new", "c".repeat(60), S))
        assertNull(cache.get("old", S))
        assertEquals("b".repeat(40), cache.get("mid", S))
        assertEquals("c".repeat(60), cache.get("new", S))
        assertEquals("x".repeat(20), storage.getItem("other"))
    }

    @Test fun `returns false when a value cannot fit even after evicting everything`() {
        val cache = Cache(MemoryStorage(50), "ns:")
        cache.set("small", 1, I)
        assertFalse(cache.set("huge", "z".repeat(500), S))
        assertNull(cache.get("huge", S))
    }

    @Test fun `purgeExpired removes only expired and unreadable entries`() {
        val c = Clock()
        val storage = MemoryStorage()
        val cache = Cache(storage, "ns:", now = { c.t })
        cache.set("short", 1, I, ttlMs = 10)
        cache.set("long", 2, I, ttlMs = 10_000)
        storage.setItem("ns:broken", "???")
        c.advance(20)
        assertEquals(2, cache.purgeExpired())
        assertEquals(2, cache.get("long", I))
    }

    @Test fun `file storage round-trips keys with any characters and survives a new instance`() {
        val dir = tmp.newFolder("cache")
        val storage = FileStorage(dir)
        storage.setItem("stations:28:2026-11-21", "[1]")
        storage.setItem("history:28:20-11-2026/ü", "{}")
        assertEquals(setOf("stations:28:2026-11-21", "history:28:20-11-2026/ü"), FileStorage(dir).keys().toSet())
        assertEquals("[1]", FileStorage(dir).getItem("stations:28:2026-11-21"))
        storage.removeItem("stations:28:2026-11-21")
        assertNull(storage.getItem("stations:28:2026-11-21"))
    }

    @Test fun `file storage enforces its size limit, and the cache evicts to make room`() {
        val c = Clock()
        val storage = FileStorage(tmp.newFolder("small"), maxBytes = 120)
        try {
            storage.setItem("big", "x".repeat(200))
            throw AssertionError("expected StorageFullException")
        } catch (e: StorageFullException) {
            // expected
        }
        val cache = Cache(storage, "ns:", now = { c.t })
        cache.set("a", "a".repeat(40), S)
        c.advance(1)
        cache.set("b", "b".repeat(40), S)
        c.advance(1)
        assertTrue(cache.set("c", "c".repeat(40), S))
        assertNull(cache.get("a", S))
        assertEquals("c".repeat(40), cache.get("c", S))
    }
}
