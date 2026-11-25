package com.halonic.studio

import android.app.Activity
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.Handler
import android.os.Looper
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Channel
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/** The service a computer advertises while Pair a phone is open (agent-host.remote-pair-advert). */
private const val SERVICE_TYPE = "_halonic-pair._tcp"

/** The first Android that resolves several services at once, and tells about changes. */
private const val ANDROID_14 = 34

@InvokeArg
class BrowseArgs {
  lateinit var onHit: Channel
  var browse: Long = 0
}

/**
 * The typed route's computer picker (HAL-16824): browses the Wi-Fi for
 * Halonic computers with Android's `NsdManager` and resolves each hit. The
 * shell calls `browse` and `stop` from Rust for `phone_nearby_browse` and
 * `phone_nearby_stop`; no capability grants these commands, so no page can
 * call them. Hits go to the channel the shell made, never to a page: the
 * shell keeps the address and port and gives the page a name and an id.
 *
 * Android pauses the app when it goes to the background: the search stops
 * there and the shell clears its list, and it starts again when the app
 * comes back while the picker is still open. Android 17 needs "Nearby
 * devices" for this; the shell asks with `LocalNetworkPlugin` first.
 *
 * Everything runs on the main thread: Android's callbacks are posted there.
 */
@TauriPlugin
class NearbyComputersPlugin(private val host: Activity) : Plugin(host) {
  private val nsd: NsdManager? = host.getSystemService(NsdManager::class.java)
  private val main = Handler(Looper.getMainLooper())

  /** The shell's channel and the browse's number, while the picker is open. */
  private var shell: Shell? = null

  /** Android's search, while it runs: never while the app is in the background. */
  private var search: Search? = null
  private var inForeground = true

  /** Starts browsing for the shell's browse `browse`, ending any earlier one. */
  @Command
  fun browse(invoke: Invoke) {
    val args = invoke.parseArgs(BrowseArgs::class.java)
    main.post {
      endSearch()
      val browsing = Shell(args.onHit, args.browse)
      shell = browsing
      if (inForeground && !startSearch(browsing)) {
        shell = null
        invoke.reject("Android's network service search didn't start")
      } else {
        invoke.resolve()
      }
    }
  }

  /** The picker closed. */
  @Command
  fun stop(invoke: Invoke) {
    main.post {
      shell = null
      endSearch()
      invoke.resolve()
    }
  }

  override fun onPause(activity: AppCompatActivity) {
    inForeground = false
    if (endSearch()) shell?.cleared()
  }

  override fun onResume(activity: AppCompatActivity) {
    inForeground = true
    val browsing = shell ?: return
    if (search == null && !startSearch(browsing)) browsing.cleared()
  }

  private fun startSearch(browsing: Shell): Boolean {
    val manager = nsd ?: return false
    val started = Search(manager, browsing)
    return try {
      manager.discoverServices(SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, started)
      search = started
      true
    } catch (_: RuntimeException) {
      false
    }
  }

  /** Ends the search, if one runs. Answers whether one did. */
  private fun endSearch(): Boolean {
    val running = search ?: return false
    search = null
    running.end()
    return true
  }

  /** The shell's end of the search: what it is told, tagged with the browse's number. */
  private class Shell(private val channel: Channel, private val browse: Long) {
    fun found(key: String, name: String?, address: String, port: Int) {
      val hit = change("found").put("key", key).put("address", address).put("port", port)
      if (name != null) hit.put("name", name)
      channel.send(hit)
    }

    fun lost(key: String) = channel.send(change("lost").put("key", key))

    fun cleared() = channel.send(change("cleared"))

    private fun change(kind: String) = JSObject().put("browse", browse).put("kind", kind)
  }

  /** One run of Android's search, and the resolves of its hits. */
  private inner class Search(private val manager: NsdManager, private val browsing: Shell) :
    NsdManager.DiscoveryListener {
    private var ended = false

    /** The hits found and not lost since, by service name. */
    private val present = mutableSetOf<String>()

    /** Before Android 14: the hits waiting to be resolved, one at a time. */
    private val resolves = ResolveQueue<NsdServiceInfo>(NearbyHits.MAX_PENDING)

    /** From Android 14: each hit's callback, which tells its address and its changes. */
    private val watched = mutableMapOf<String, NsdManager.ServiceInfoCallback>()

    override fun onServiceFound(info: NsdServiceInfo) = onMain {
      val key = info.serviceName
      if (key in present || present.size >= NearbyHits.MAX_PENDING) return@onMain
      present.add(key)
      if (Build.VERSION.SDK_INT >= ANDROID_14) watch(info) else resolves.add(key, info)?.let(::resolve)
    }

    override fun onServiceLost(info: NsdServiceInfo) = onMain {
      val key = info.serviceName
      if (!present.remove(key)) return@onMain
      resolves.remove(key)
      if (Build.VERSION.SDK_INT >= ANDROID_14) unwatch(key)
      browsing.lost(key)
    }

    override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) = onMain {
      if (search === this) search = null
      end()
      browsing.cleared()
    }

    override fun onDiscoveryStarted(serviceType: String) {}

    override fun onDiscoveryStopped(serviceType: String) {}

    override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}

    fun end() {
      if (ended) return
      ended = true
      try {
        manager.stopServiceDiscovery(this)
      } catch (_: IllegalArgumentException) {
        // The search never started, so there is nothing to stop.
      }
      if (Build.VERSION.SDK_INT >= ANDROID_14) watched.keys.toList().forEach(::unwatch)
      resolves.clear()
      present.clear()
    }

    /** Runs [action] on the main thread, unless the search has ended by then. */
    private fun onMain(action: () -> Unit) {
      main.post { if (!ended) action() }
    }

    private fun report(info: NsdServiceInfo, address: String?) {
      val key = info.serviceName
      if (key !in present || address == null) return
      browsing.found(key, NearbyHits.name(info.attributes), address, info.port)
    }

    @Suppress("DEPRECATION")
    private fun resolve(info: NsdServiceInfo) {
      manager.resolveService(info, object : NsdManager.ResolveListener {
        override fun onServiceResolved(resolved: NsdServiceInfo) = onMain {
          report(resolved, resolved.host?.let { NearbyHits.address(listOf(it)) })
          resolves.next()?.let(::resolve)
        }

        override fun onResolveFailed(failed: NsdServiceInfo, errorCode: Int) = onMain {
          resolves.next()?.let(::resolve)
        }
      })
    }

    @RequiresApi(ANDROID_14)
    private fun watch(info: NsdServiceInfo) {
      val key = info.serviceName
      val callback = object : NsdManager.ServiceInfoCallback {
        override fun onServiceUpdated(updated: NsdServiceInfo) = onMain {
          report(updated, NearbyHits.address(updated.hostAddresses))
        }

        override fun onServiceLost() = onMain {
          if (present.remove(key)) browsing.lost(key)
          unwatch(key)
        }

        override fun onServiceInfoCallbackRegistrationFailed(errorCode: Int) = onMain {
          watched.remove(key)
        }

        override fun onServiceInfoCallbackUnregistered() {}
      }
      try {
        manager.registerServiceInfoCallback(info, host.mainExecutor, callback)
        watched[key] = callback
      } catch (_: IllegalArgumentException) {
        // A callback Android already holds, or a hit it can't watch: left out.
      }
    }

    @RequiresApi(ANDROID_14)
    private fun unwatch(key: String) {
      val callback = watched.remove(key) ?: return
      try {
        manager.unregisterServiceInfoCallback(callback)
      } catch (_: IllegalArgumentException) {
        // Already unregistered by Android.
      }
    }
  }
}
