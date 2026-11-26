package com.halonic.studio

/** A chat the last-chat shortcut opens: the computer it's on, and its id and name there. */
data class LastChat(val computer: String, val chat: String, val name: String)

/** The screen a shortcut opens, as the phone's own page reads it. */
sealed interface OpenTarget {
  /** The Inbox of the computer the phone connected to last. */
  data object Inbox : OpenTarget

  /** The Messenger list of the computer the phone connected to last. */
  data object Messenger : OpenTarget

  /** The chat the last-chat shortcut stands for, as it was stored when it was opened. */
  data class Chat(val chat: LastChat) : OpenTarget
}

/**
 * The app's shortcuts, described without Android's classes, so a plain JVM test can read which
 * screen each intent opens (HAL-19143).
 *
 * `MainActivity` is the launcher, so it's exported: any app can start it with any intent data.
 * So the data names a screen and never carries an id: `inbox`, `messenger` or `last-chat`, and the
 * last chat is the one this app stored itself. A shortcut only opens a screen, never acts, and
 * anything else opens the app as its own icon does.
 */
object ShortcutTargets {
  /** The scheme of every shortcut's intent data. */
  const val SCHEME = "halonic-shortcut"

  /** The ids of the two static shortcuts in `res/xml/shortcuts.xml`, which pinning reuses. */
  const val INBOX = "inbox"
  const val MESSENGER = "messenger"

  /** The id of the one dynamic shortcut, the last chat. */
  const val LAST_CHAT = "last-chat"

  /** Android shows the short label on the home screen and the long one in the long-press menu. */
  const val SHORT_LABEL = 10
  const val LONG_LABEL = 25

  /** The intent data of shortcut [id]. */
  fun addressOf(id: String): String = "$SCHEME://open/$id"

  /**
   * The screen [address] opens. The last chat opens the chat stored in [lastChat], or the
   * Messenger list when none is stored (the phone forgot its computer, or no chat was opened).
   * Null for anything else: the app then opens as from its own icon.
   */
  fun targetOf(address: String?, lastChat: LastChat?): OpenTarget? =
    when (address) {
      addressOf(INBOX) -> OpenTarget.Inbox
      addressOf(MESSENGER) -> OpenTarget.Messenger
      addressOf(LAST_CHAT) -> lastChat?.let { OpenTarget.Chat(it) } ?: OpenTarget.Messenger
      else -> null
    }

  /** Whether [chat] is on [computer]: Forget and Removed take only that computer's last chat. */
  fun isOn(chat: LastChat?, computer: String): Boolean = chat != null && chat.computer == computer

  /** [name] cut to [length] characters, never inside a pair that draws one character. */
  fun cut(name: String, length: Int): String {
    val trimmed = name.trim()
    if (trimmed.codePointCount(0, trimmed.length) <= length) {
      return trimmed
    }
    return trimmed.substring(0, trimmed.offsetByCodePoints(0, length)).trimEnd()
  }
}
