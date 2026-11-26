package com.halonic.studio

import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import androidx.core.content.pm.ShortcutInfoCompat
import androidx.core.content.pm.ShortcutManagerCompat
import androidx.core.graphics.drawable.IconCompat
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import org.json.JSONObject

/** Where the last chat is kept: this phone only, as the manifest backs nothing up. */
private const val STORE = "app-shortcuts"

/**
 * The screen the last shortcut asked for, until the phone's own page takes it. `MainActivity`
 * sets it from the intent that started or reached it; it lives as long as the app's process.
 */
internal object PendingShortcut {
  @Volatile
  var address: String? = null

  /** Keeps [intent]'s address, unless Android replays it from the recent apps. */
  fun keep(intent: Intent?) {
    if (intent == null || intent.flags and Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY != 0) {
      return
    }
    address = intent.dataString
  }
}

/**
 * The app's shortcuts (HAL-19143): Inbox and Messenger in `res/xml/shortcuts.xml`, the last chat
 * as the one dynamic shortcut, and pinning either screen to the home screen. The shell calls these
 * from Rust for the `phone_*` commands in `app_shortcuts.rs`; no capability grants them, so no
 * page can call them. Which screen an intent opens is in [ShortcutTargets].
 */
@TauriPlugin
class AppShortcutsPlugin(private val host: Activity) : Plugin(host) {
  /** Answers `{target, computer?, chat?}` for the screen the last shortcut asked for, once. */
  @Command
  fun takeOpenTarget(invoke: Invoke) {
    val address = PendingShortcut.address
    PendingShortcut.address = null
    val answer = JSObject()
    when (val target = ShortcutTargets.targetOf(address, storedChat())) {
      OpenTarget.Inbox -> answer.put("target", "inbox")
      OpenTarget.Messenger -> answer.put("target", "messenger")
      is OpenTarget.Chat ->
        answer.put("target", "chat").put("computer", target.chat.computer).put("chat", target.chat.chat)
      null -> answer.put("target", JSONObject.NULL)
    }
    invoke.resolve(answer)
  }

  /** `{computer, chat, name}` becomes the last chat; with none of them, the last chat goes. */
  @Command
  fun setLastChat(invoke: Invoke) {
    val args = invoke.getArgs()
    val computer = args.getString("computer", null)
    val chat = args.getString("chat", null)
    val name = args.getString("name", null)
    if (computer == null || chat == null || name == null) {
      forgetChat()
    } else {
      keepChat(LastChat(computer, chat, name))
    }
    invoke.resolve(JSObject().put("done", true))
  }

  /** Answers `{pinnable}`: whether the launcher pins shortcuts. */
  @Command
  fun canPin(invoke: Invoke) {
    invoke.resolve(JSObject().put("pinnable", ShortcutManagerCompat.isRequestPinShortcutSupported(host)))
  }

  /** `{target}`, `inbox` or `messenger`: opens Android's own Add to Home screen. Answers `{asked}`. */
  @Command
  fun pin(invoke: Invoke) {
    val shortcut = when (invoke.getArgs().getString("target", null)) {
      ShortcutTargets.INBOX -> screenShortcut(ShortcutTargets.INBOX, R.string.shortcut_inbox, R.drawable.ic_shortcut_inbox)
      ShortcutTargets.MESSENGER ->
        screenShortcut(ShortcutTargets.MESSENGER, R.string.shortcut_messenger, R.drawable.ic_shortcut_messenger)
      else -> null
    }
    val asked = shortcut != null && ShortcutManagerCompat.requestPinShortcut(host, shortcut, null)
    invoke.resolve(JSObject().put("asked", asked))
  }

  private fun screenShortcut(id: String, label: Int, icon: Int): ShortcutInfoCompat {
    val words = host.getString(label)
    return ShortcutInfoCompat.Builder(host, id)
      .setShortLabel(words)
      .setLongLabel(words)
      .setIcon(IconCompat.createWithResource(host, icon))
      .setIntent(openIntent(id))
      .build()
  }

  private fun openIntent(id: String): Intent =
    Intent(Intent.ACTION_VIEW, Uri.parse(ShortcutTargets.addressOf(id)), host, MainActivity::class.java)

  private fun keepChat(chat: LastChat) {
    store().edit()
      .putString("computer", chat.computer)
      .putString("chat", chat.chat)
      .putString("name", chat.name)
      .apply()
    val shortcut = ShortcutInfoCompat.Builder(host, ShortcutTargets.LAST_CHAT)
      .setShortLabel(ShortcutTargets.cut(chat.name, ShortcutTargets.SHORT_LABEL))
      .setLongLabel(ShortcutTargets.cut(chat.name, ShortcutTargets.LONG_LABEL))
      .setIcon(IconCompat.createWithResource(host, R.drawable.ic_shortcut_messenger))
      .setIntent(openIntent(ShortcutTargets.LAST_CHAT))
      .setRank(2)
      .build()
    ShortcutManagerCompat.pushDynamicShortcut(host, shortcut)
  }

  // A pinned last chat stays and opens the Messenger list from now on, as decided on HAL-18991.
  private fun forgetChat() {
    store().edit().clear().apply()
    ShortcutManagerCompat.removeDynamicShortcuts(host, listOf(ShortcutTargets.LAST_CHAT))
  }

  private fun storedChat(): LastChat? {
    val store = store()
    val computer = store.getString("computer", null) ?: return null
    val chat = store.getString("chat", null) ?: return null
    return LastChat(computer, chat, store.getString("name", null) ?: "")
  }

  private fun store() = host.getSharedPreferences(STORE, Context.MODE_PRIVATE)
}
