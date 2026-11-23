package com.halonic.studio

import android.content.Intent
import android.provider.Settings

/**
 * One Android screen `PhoneScreensPlugin` may start, described without
 * Android's classes, so a plain JVM test can read which screen each command
 * opens (HAL-16643).
 */
sealed interface Screen {
  /** An installed app's own start screen. */
  data class App(val packageName: String) : Screen

  /** An address opened with an intent action, such as a settings page or a web page. */
  data class Address(val action: String, val address: String) : Screen
}

/**
 * The screens each of `PhoneScreensPlugin`'s commands tries, in order. Both
 * lists are fixed here: nothing from the page picks a screen, an app or an
 * address.
 */
object PhoneScreens {
  /** Tailscale's Android app. The manifest's `<queries>` lets us see it. */
  const val TAILSCALE = "com.tailscale.ipn"

  /** Android's settings page for the app [packageName]. */
  fun appSettings(packageName: String): List<Screen> =
    listOf(Screen.Address(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, "package:$packageName"))

  /**
   * The Tailscale app, or its Play Store page when it isn't installed: in
   * the Play Store app, or in the browser on a phone without one.
   */
  fun tailscale(): List<Screen> =
    listOf(
      Screen.App(TAILSCALE),
      Screen.Address(Intent.ACTION_VIEW, "market://details?id=$TAILSCALE"),
      Screen.Address(Intent.ACTION_VIEW, "https://play.google.com/store/apps/details?id=$TAILSCALE"),
    )

  /**
   * Starts the first of [screens] that [start] opens, and stops there.
   * Answers whether any opened.
   */
  fun openFirst(screens: List<Screen>, start: (Screen) -> Boolean): Boolean = screens.any(start)
}
