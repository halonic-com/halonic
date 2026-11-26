package com.halonic.studio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The screen each shortcut's intent opens, and the last chat's labels
 * (studio.src-tauri.app-shortcuts-commands, HAL-19143). `MainActivity` is
 * exported, so these include intents another app could make up.
 */
class ShortcutTargetsTest {
  private val launchReview = LastChat("acme-desk", "launch-review", "Launch review")

  @Test
  fun inbox_and_messenger_open_their_screens() {
    assertEquals(OpenTarget.Inbox, ShortcutTargets.targetOf("halonic-shortcut://open/inbox", null))
    assertEquals(OpenTarget.Messenger, ShortcutTargets.targetOf("halonic-shortcut://open/messenger", launchReview))
  }

  @Test
  fun the_last_chat_opens_the_chat_this_app_stored() {
    assertEquals(
      OpenTarget.Chat(launchReview),
      ShortcutTargets.targetOf("halonic-shortcut://open/last-chat", launchReview),
    )
  }

  @Test
  fun the_last_chat_opens_the_messenger_list_when_none_is_stored() {
    assertEquals(OpenTarget.Messenger, ShortcutTargets.targetOf("halonic-shortcut://open/last-chat", null))
  }

  @Test
  fun a_forged_intent_names_no_chat_and_opens_the_app_as_its_icon_does() {
    for (forged in listOf(
      "halonic-shortcut://open/last-chat/acme-desk/other-chat",
      "halonic-shortcut://open/last-chat?chat=other-chat",
      "halonic-shortcut://open/chat",
      "halonic-shortcut://open/settings",
      "halonic-shortcut://answer/inbox",
      "halonic-shortcut://open/INBOX",
      "https://example.com/open/inbox",
      "",
    )) {
      assertNull(forged, ShortcutTargets.targetOf(forged, launchReview))
    }
    assertNull(ShortcutTargets.targetOf(null, launchReview))
  }

  @Test
  fun forgetting_a_computer_takes_only_its_own_last_chat() {
    assertTrue(ShortcutTargets.isOn(launchReview, "acme-desk"))
    assertFalse(ShortcutTargets.isOn(launchReview, "acme-laptop"))
    assertFalse(ShortcutTargets.isOn(null, "acme-desk"))
  }

  @Test
  fun a_forgotten_pinned_last_chat_becomes_messenger_and_opens_the_messenger_list() {
    val relabel = ShortcutTargets.forgottenLastChat()
    assertEquals(ShortcutTargets.LAST_CHAT, relabel.id)
    assertEquals(ShortcutTargets.MESSENGER, relabel.opens)
    assertEquals(
      OpenTarget.Messenger,
      ShortcutTargets.targetOf(ShortcutTargets.addressOf(relabel.opens), launchReview),
    )
  }

  @Test
  fun labels_are_cut_to_10_and_25_characters() {
    val name = "Launch review for the acme website"
    assertEquals("Launch rev", ShortcutTargets.cut(name, ShortcutTargets.SHORT_LABEL))
    assertEquals("Launch review for the acm", ShortcutTargets.cut(name, ShortcutTargets.LONG_LABEL))
    assertEquals("Launch", ShortcutTargets.cut("Launch", ShortcutTargets.SHORT_LABEL))
  }

  @Test
  fun labels_never_cut_a_character_in_two_or_end_in_a_space() {
    // Nine letters, then a character Java keeps as two (an emoji).
    assertEquals("Acme team🚀", ShortcutTargets.cut("Acme team🚀 launch", 10))
    assertEquals("Acme", ShortcutTargets.cut("  Acme team", 5))
  }
}
