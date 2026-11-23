package com.halonic.studio

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/**
 * Android screens the phone's own page sends the person to (HAL-16438):
 * Halonic's app settings, to turn on the camera or "Nearby devices", and
 * the Tailscale app. The shell calls these from Rust for `phone_open_settings`
 * and `phone_open_tailscale`, which take nothing from the page; no
 * capability grants these commands, so no page can call them or pick a
 * screen of its own. Which screens each command tries is in [PhoneScreens].
 */
@TauriPlugin
class PhoneScreensPlugin(private val host: Activity) : Plugin(host) {
  /** Opens Android's settings page for this app. Answers `{"opened": …}`. */
  @Command
  fun openAppSettings(invoke: Invoke) {
    answer(invoke, PhoneScreens.openFirst(PhoneScreens.appSettings(host.packageName), ::start))
  }

  /** Opens the Tailscale app, or its Play Store page. Answers `{"opened": …}`. */
  @Command
  fun openTailscale(invoke: Invoke) {
    answer(invoke, PhoneScreens.openFirst(PhoneScreens.tailscale(), ::start))
  }

  /** Starts the screen; false when it isn't installed or no app on the phone can show it. */
  private fun start(screen: Screen): Boolean {
    val intent = when (screen) {
      is Screen.App -> host.packageManager.getLaunchIntentForPackage(screen.packageName) ?: return false
      is Screen.Address -> Intent(screen.action, Uri.parse(screen.address))
    }
    return try {
      host.startActivity(intent)
      true
    } catch (_: ActivityNotFoundException) {
      false
    }
  }

  private fun answer(invoke: Invoke, opened: Boolean) {
    invoke.resolve(JSObject().put("opened", opened))
  }
}
