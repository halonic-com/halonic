package com.halonic.studio

import android.app.Activity
import android.content.ActivityNotFoundException
import android.content.Intent
import android.net.Uri
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/** Tailscale's Android app. The manifest's `<queries>` lets us see it. */
private const val TAILSCALE = "com.tailscale.ipn"

/**
 * Android screens the phone's own page sends the person to (HAL-16438):
 * Halonic's app settings, to turn on the camera or "Nearby devices", and
 * the Tailscale app. The shell calls these from Rust for `phone_open_settings`
 * and `phone_open_tailscale`, which take nothing from the page; no
 * capability grants these commands, so no page can call them or pick a
 * screen of its own.
 */
@TauriPlugin
class PhoneScreensPlugin(private val host: Activity) : Plugin(host) {
  /** Opens Android's settings page for this app. Answers `{"opened": …}`. */
  @Command
  fun openAppSettings(invoke: Invoke) {
    val settings = Intent(
      Settings.ACTION_APPLICATION_DETAILS_SETTINGS,
      Uri.fromParts("package", host.packageName, null)
    )
    answer(invoke, start(settings))
  }

  /**
   * Opens the Tailscale app, or its Play Store page when it isn't
   * installed: in the Play Store app, or in the browser on a phone without
   * one. Answers `{"opened": …}`.
   */
  @Command
  fun openTailscale(invoke: Invoke) {
    val app = host.packageManager.getLaunchIntentForPackage(TAILSCALE)
    val opened = (app != null && start(app)) ||
      start(view("market://details?id=$TAILSCALE")) ||
      start(view("https://play.google.com/store/apps/details?id=$TAILSCALE"))
    answer(invoke, opened)
  }

  private fun view(address: String) = Intent(Intent.ACTION_VIEW, Uri.parse(address))

  /** Starts the screen; false when no app on the phone can show it. */
  private fun start(intent: Intent): Boolean =
    try {
      host.startActivity(intent)
      true
    } catch (_: ActivityNotFoundException) {
      false
    }

  private fun answer(invoke: Invoke, opened: Boolean) {
    invoke.resolve(JSObject().put("opened", opened))
  }
}
