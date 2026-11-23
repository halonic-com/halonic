package com.halonic.studio

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The screens `PhoneScreensPlugin` opens for `phone_open_settings` and
 * `phone_open_tailscale` (studio.src-tauri.phone-screens-commands, HAL-16643):
 * which intent each command builds, and how Open Tailscale falls back from
 * the app to the Play Store app to the browser.
 */
class PhoneScreensTest {
  private val tailscaleApp = Screen.App("com.tailscale.ipn")
  private val playStoreApp =
    Screen.Address("android.intent.action.VIEW", "market://details?id=com.tailscale.ipn")
  private val playStoreWeb =
    Screen.Address("android.intent.action.VIEW", "https://play.google.com/store/apps/details?id=com.tailscale.ipn")

  /** Opens [screens] where only [opens] can be shown, and records what was tried. */
  private fun tryOpening(screens: List<Screen>, opens: Set<Screen>): Pair<Boolean, List<Screen>> {
    val tried = mutableListOf<Screen>()
    val opened = PhoneScreens.openFirst(screens) { screen ->
      tried.add(screen)
      screen in opens
    }
    return opened to tried
  }

  @Test
  fun open_settings_is_android_s_details_page_for_the_app_s_own_package() {
    assertEquals(
      listOf(Screen.Address("android.settings.APPLICATION_DETAILS_SETTINGS", "package:com.halonic.studio")),
      PhoneScreens.appSettings("com.halonic.studio"),
    )
  }

  @Test
  fun open_settings_answers_false_when_no_app_shows_the_settings_page() {
    val (opened, tried) = tryOpening(PhoneScreens.appSettings("com.halonic.studio"), opens = emptySet())
    assertFalse(opened)
    assertEquals(1, tried.size)
  }

  @Test
  fun open_tailscale_tries_the_app_then_the_play_store_app_then_the_browser() {
    assertEquals(listOf(tailscaleApp, playStoreApp, playStoreWeb), PhoneScreens.tailscale())
  }

  @Test
  fun open_tailscale_starts_the_installed_app_and_nothing_else() {
    val (opened, tried) = tryOpening(PhoneScreens.tailscale(), opens = setOf(tailscaleApp, playStoreApp, playStoreWeb))
    assertTrue(opened)
    assertEquals(listOf(tailscaleApp), tried)
  }

  @Test
  fun open_tailscale_opens_the_play_store_app_when_tailscale_isn_t_installed() {
    val (opened, tried) = tryOpening(PhoneScreens.tailscale(), opens = setOf(playStoreApp, playStoreWeb))
    assertTrue(opened)
    assertEquals(listOf(tailscaleApp, playStoreApp), tried)
  }

  @Test
  fun open_tailscale_opens_the_store_page_in_the_browser_on_a_phone_without_the_play_store() {
    val (opened, tried) = tryOpening(PhoneScreens.tailscale(), opens = setOf(playStoreWeb))
    assertTrue(opened)
    assertEquals(listOf(tailscaleApp, playStoreApp, playStoreWeb), tried)
  }

  @Test
  fun open_tailscale_answers_false_when_nothing_can_show_any_of_its_screens() {
    val (opened, tried) = tryOpening(PhoneScreens.tailscale(), opens = emptySet())
    assertFalse(opened)
    assertEquals(3, tried.size)
  }
}
