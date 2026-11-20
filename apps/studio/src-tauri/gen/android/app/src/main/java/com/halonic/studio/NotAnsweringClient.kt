package com.halonic.studio

import android.net.Uri
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebView
import android.webkit.WebViewClient

/**
 * The load errors that mean the computer isn't answering: nothing listens
 * at the address (Halonic stopped), the name doesn't resolve, or nothing
 * comes back in time (the computer is off or asleep).
 */
private val COMPUTER_NOT_ANSWERING = setOf(
  WebViewClient.ERROR_CONNECT,
  WebViewClient.ERROR_HOST_LOOKUP,
  WebViewClient.ERROR_TIMEOUT
)

/**
 * wry's client with one change: when a page of the served Studio can't load
 * because the computer isn't answering, the window goes to the connect page
 * (phone check 22, HAL-14134).
 *
 * Left alone, wry catches a refused connection on the window's page, stops
 * the load and loads the same address again (`RustWebViewClient`, for
 * redirects to the app's own scheme). Android's error page never shows,
 * but neither does anything else: the tap does nothing. The connect page
 * asks the computer again about the remembered address, and shows
 * "isn't answering" with Try again and Change address, a version screen,
 * or the Studio again when it answers.
 *
 * Errors on the app's own page, and on anything but the window's page,
 * still go to wry.
 */
internal class NotAnsweringClient(wry: WebViewClient) : ForwardingWebViewClient(wry) {
  override fun onReceivedError(
    view: WebView,
    request: WebResourceRequest,
    error: WebResourceError
  ) {
    val computerNotAnswering = request.isForMainFrame &&
      isServedPage(request.url) &&
      error.errorCode in COMPUTER_NOT_ANSWERING
    if (computerNotAnswering) {
      // Stopping keeps Android's error page from showing first.
      view.stopLoading()
      view.loadUrl(CONNECT_PAGE)
    } else {
      super.onReceivedError(view, request, error)
    }
  }

  /** A web page on the computer: the navigation guard lets no other one load. */
  private fun isServedPage(url: Uri): Boolean =
    (url.scheme == "http" || url.scheme == "https") && url.host != APP_HOST
}
