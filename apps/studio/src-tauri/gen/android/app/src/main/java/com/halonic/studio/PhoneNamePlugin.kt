package com.halonic.studio

import android.app.Activity
import android.os.Build
import android.provider.Settings
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/** The first Android with the device name the person sets in Settings. */
private const val ANDROID_7_1 = 25

/**
 * The phone's name, which pairing message 3 tells the computer (HAL-15157):
 * the computer shows it next to the check code and in its list of phones.
 * The shell asks from Rust when it starts a pairing; no capability grants
 * this command, so no page can call it.
 */
@TauriPlugin
class PhoneNamePlugin(private val host: Activity) : Plugin(host) {
  /**
   * Answers `{"name": …}`: the name the person gave the phone in Settings
   * ("Tim's Pixel"), or the model ("Pixel 9") when there is none. It needs
   * no permission.
   */
  @Command
  fun phoneName(invoke: Invoke) {
    val named = if (Build.VERSION.SDK_INT >= ANDROID_7_1) {
      Settings.Global.getString(host.contentResolver, Settings.Global.DEVICE_NAME)
    } else {
      null
    }
    val name = if (named.isNullOrBlank()) Build.MODEL else named
    invoke.resolve(JSObject().put("name", name))
  }
}
