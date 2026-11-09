package com.halonic.studio

import android.os.Bundle
import android.view.View
import android.webkit.WebView
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

/** The connect page, as tauri.android.conf.json loads it. */
private const val CONNECT_PAGE = "http://tauri.localhost/connect.html"

class MainActivity : TauriActivity() {
  // Back is ours (see BackToConnectOrClose), not wry's plain goBack.
  override val handleBackNavigation = false

  // targetSdk 37 draws every app edge to edge. The default bar style
  // follows the phone's light or dark setting for the clock and battery
  // icons; keepClearOfBars below keeps the page out from under them.
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
    keepClearOfBars(findViewById(android.R.id.content))
  }

  // The served Studio shows the app's version and Change address only when
  // it finds this marker (flow-install-update 5.4, HAL-1137). It is added to
  // Android's own user agent, never replaces it, and grants nothing: any
  // browser could send it.
  override fun onWebViewCreate(webView: WebView) {
    val settings = webView.settings
    settings.userAgentString = "${settings.userAgentString} HalonicApp/${BuildConfig.VERSION_NAME}"
    onBackPressedDispatcher.addCallback(this, BackToConnectOrClose(webView))
  }

  /**
   * Pads the window's content by the status bar, the navigation bar and the
   * keyboard, so neither the connect page nor the served Studio needs its
   * own safe-area rules, and the page shrinks when the keyboard opens.
   */
  private fun keepClearOfBars(content: View) {
    ViewCompat.setOnApplyWindowInsetsListener(content) { view, insets ->
      val bars = insets.getInsets(
        WindowInsetsCompat.Type.systemBars() or
          WindowInsetsCompat.Type.displayCutout() or
          WindowInsetsCompat.Type.ime()
      )
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      WindowInsetsCompat.CONSUMED
    }
  }

  /**
   * Android Back (checklist 1.8). On the connect page it closes the app,
   * whatever is behind it in the window's history: after Change address
   * that is the old Studio, and going back there would skip the navigation
   * guard, which has already forgotten its address. Anywhere else it goes
   * back one page; from the Studio's first page that is the connect page in
   * its Change address state.
   */
  private inner class BackToConnectOrClose(private val webView: WebView) :
    OnBackPressedCallback(true) {
    override fun handleOnBackPressed() {
      val onConnectPage = webView.url?.startsWith(CONNECT_PAGE) ?: true
      if (!onConnectPage && webView.canGoBack()) {
        webView.goBack()
      } else {
        // Let Android do its own Back, which closes the app.
        isEnabled = false
        onBackPressedDispatcher.onBackPressed()
        isEnabled = true
      }
    }
  }
}
