package com.halonic.studio

import java.net.Inet4Address
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.charset.CharacterCodingException
import java.nio.charset.CodingErrorAction

/**
 * How `NearbyComputersPlugin` reads a resolved `_halonic-pair._tcp` hit
 * (HAL-16824). Any device on the Wi-Fi can advertise one, so nothing here
 * trusts it: the shell checks the name and the address again before the
 * page sees anything.
 */
object NearbyHits {
  /** The most TXT bytes read as a name. The shell keeps 64 bytes at most. */
  const val MAX_NAME_BYTES = 256

  /** The most hits waiting to be resolved, or watched, at once. */
  const val MAX_PENDING = 32

  /** The `name` entry of the TXT record, or null when it is missing, too long or not UTF-8. */
  fun name(attributes: Map<String, ByteArray?>): String? {
    val bytes = attributes["name"] ?: return null
    if (bytes.size > MAX_NAME_BYTES) return null
    val decoder = Charsets.UTF_8.newDecoder()
      .onMalformedInput(CodingErrorAction.REPORT)
      .onUnmappableCharacter(CodingErrorAction.REPORT)
    return try {
      decoder.decode(ByteBuffer.wrap(bytes)).toString()
    } catch (_: CharacterCodingException) {
      null
    }
  }

  /** The first IPv4 address, as text: the computer advertises only those. */
  fun address(addresses: List<InetAddress>): String? =
    addresses.firstOrNull { it is Inet4Address }?.hostAddress
}

/**
 * The hits waiting to be resolved. Before Android 14, `NsdManager` resolves
 * one service at a time and fails a second call with
 * `FAILURE_ALREADY_ACTIVE`, so the plugin resolves them in turn. At most
 * [limit] wait; later ones are dropped.
 */
class ResolveQueue<T>(private val limit: Int) {
  private val waiting = ArrayDeque<Pair<String, T>>()
  private var active: String? = null

  /**
   * Adds the hit [key]. Answers [item] when it can be resolved at once, and
   * null when it waits, is already waiting or being resolved, or the queue
   * is full.
   */
  fun add(key: String, item: T): T? {
    if (key == active || waiting.any { it.first == key } || waiting.size >= limit) return null
    if (active == null) {
      active = key
      return item
    }
    waiting.addLast(key to item)
    return null
  }

  /** Drops the waiting hit [key]: the computer stopped advertising. */
  fun remove(key: String) {
    waiting.removeAll { it.first == key }
  }

  /** The resolve in progress ended. Answers the next hit to resolve, if any. */
  fun next(): T? {
    val (key, item) = waiting.removeFirstOrNull() ?: run {
      active = null
      return null
    }
    active = key
    return item
  }

  fun clear() {
    waiting.clear()
    active = null
  }
}
