package com.halonic.studio

import android.os.Bundle
import android.webkit.WebView
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    enableEdgeToEdge()
    super.onCreate(savedInstanceState)
  }

  // The served Studio shows the app's version and Change address only when
  // it finds this marker (flow-install-update 5.4, HAL-1137). It is added to
  // Android's own user agent, never replaces it, and grants nothing: any
  // browser could send it.
  override fun onWebViewCreate(webView: WebView) {
    val settings = webView.settings
    settings.userAgentString = "${settings.userAgentString} HalonicApp/${BuildConfig.VERSION_NAME}"
  }
}
