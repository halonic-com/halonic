package com.halonic.studio

import java.net.InetAddress
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * How `NearbyComputersPlugin` reads a hit and queues its resolves
 * (studio.src-tauri.phone-nearby-commands, HAL-16824).
 */
class NearbyHitsTest {
  private fun ip(vararg bytes: Int) = InetAddress.getByAddress(ByteArray(bytes.size) { bytes[it].toByte() })

  @Test
  fun name_is_the_txt_record_s_name_entry_in_utf_8() {
    assertEquals("Tim's laptop", NearbyHits.name(mapOf("name" to "Tim's laptop".toByteArray())))
    assertEquals("Café", NearbyHits.name(mapOf("name" to "Café".toByteArray())))
  }

  @Test
  fun name_is_null_when_missing_too_long_or_not_utf_8() {
    assertNull(NearbyHits.name(emptyMap()))
    assertNull(NearbyHits.name(mapOf("name" to null)))
    assertNull(NearbyHits.name(mapOf("Name " to "Desk".toByteArray())))
    assertNull(NearbyHits.name(mapOf("name" to ByteArray(NearbyHits.MAX_NAME_BYTES + 1) { 'a'.code.toByte() })))
    assertNull(NearbyHits.name(mapOf("name" to byteArrayOf(0x44, 0xC3.toByte(), 0x28))))
  }

  @Test
  fun address_is_the_first_ipv4_one() {
    val v6 = InetAddress.getByAddress(ByteArray(16).also { it[0] = 0xFE.toByte(); it[1] = 0x80.toByte(); it[15] = 1 })
    assertEquals("192.168.1.20", NearbyHits.address(listOf(v6, ip(192, 168, 1, 20), ip(10, 0, 0, 5))))
    assertNull(NearbyHits.address(listOf(v6)))
    assertNull(NearbyHits.address(emptyList()))
  }

  @Test
  fun resolves_run_one_at_a_time_in_the_order_found() {
    val queue = ResolveQueue<String>(limit = 4)
    assertEquals("a", queue.add("a", "a"))
    assertNull(queue.add("b", "b"))
    assertNull(queue.add("c", "c"))
    assertEquals("b", queue.next())
    assertEquals("c", queue.next())
    assertNull(queue.next())
    // Nothing is resolving now, so the next hit starts at once.
    assertEquals("d", queue.add("d", "d"))
  }

  @Test
  fun resolves_skip_a_hit_already_queued_or_lost_and_stop_at_the_limit() {
    val queue = ResolveQueue<String>(limit = 2)
    queue.add("a", "a")
    assertNull(queue.add("a", "a"))
    queue.add("b", "b")
    assertNull(queue.add("b", "b"))
    queue.add("c", "c")
    assertNull(queue.add("d", "d"))
    queue.remove("b")
    assertEquals("c", queue.next())
    assertNull(queue.next())
  }

  @Test
  fun resolves_start_again_after_a_clear() {
    val queue = ResolveQueue<String>(limit = 2)
    queue.add("a", "a")
    queue.add("b", "b")
    queue.clear()
    assertNull(queue.next())
    assertEquals("a", queue.add("a", "a"))
  }
}
