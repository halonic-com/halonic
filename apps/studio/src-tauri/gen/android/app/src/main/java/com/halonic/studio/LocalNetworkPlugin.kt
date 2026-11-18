package com.halonic.studio

import android.app.Activity
import android.os.Build
import app.tauri.PermissionState
import app.tauri.annotation.Command
import app.tauri.annotation.Permission
import app.tauri.annotation.PermissionCallback
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

private const val ALIAS = "localNetwork"

/** The first Android that blocks the local network without the permission. */
private const val ANDROID_17 = 37

/**
 * Android's local network permission (HAL-12253). From Android 17, an app
 * that targets it can't reach an address on the Wi-Fi, the hello call or the
 * served Studio, until the user allows "Nearby devices". The shell's
 * `connect` command asks through this plugin before it calls such an
 * address; no page can call it.
 */
@TauriPlugin(
  permissions = [
    Permission(strings = ["android.permission.ACCESS_LOCAL_NETWORK"], alias = ALIAS)
  ]
)
class LocalNetworkPlugin(activity: Activity) : Plugin(activity) {
  /**
   * Answers `{"granted": true}` when the app may reach the local network,
   * showing Android's own question first if the user hasn't answered it.
   * Older Androids don't know the permission and never block, so they
   * answer at once.
   */
  @Command
  fun allowLocalNetwork(invoke: Invoke) {
    if (Build.VERSION.SDK_INT < ANDROID_17 || getPermissionState(ALIAS) == PermissionState.GRANTED) {
      answer(invoke, true)
    } else {
      requestPermissionForAlias(ALIAS, invoke, "localNetworkAnswered")
    }
  }

  @PermissionCallback
  private fun localNetworkAnswered(invoke: Invoke) {
    answer(invoke, getPermissionState(ALIAS) == PermissionState.GRANTED)
  }

  private fun answer(invoke: Invoke, granted: Boolean) {
    invoke.resolve(JSObject().put("granted", granted))
  }
}
