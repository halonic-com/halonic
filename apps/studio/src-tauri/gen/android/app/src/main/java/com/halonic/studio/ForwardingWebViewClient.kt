package com.halonic.studio

import android.graphics.Bitmap
import android.net.http.SslError
import android.os.Message
import android.view.KeyEvent
import android.webkit.ClientCertRequest
import android.webkit.HttpAuthHandler
import android.webkit.RenderProcessGoneDetail
import android.webkit.SafeBrowsingResponse
import android.webkit.SslErrorHandler
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.annotation.RequiresApi

/**
 * A WebViewClient that hands every callback to another one, so a subclass
 * can change one callback of wry's client and keep the rest as wry wrote
 * them. It forwards every current callback, not only those wry overrides
 * today, so a wry update that overrides one more still works. The callbacks
 * Android has deprecated aren't forwarded: the WebView calls their
 * replacements, and the replacements' defaults in the wrapped client call
 * them there.
 */
internal open class ForwardingWebViewClient(private val wrapped: WebViewClient) :
  WebViewClient() {
  override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean =
    wrapped.shouldOverrideUrlLoading(view, request)

  override fun shouldInterceptRequest(
    view: WebView,
    request: WebResourceRequest
  ): WebResourceResponse? = wrapped.shouldInterceptRequest(view, request)

  override fun onPageStarted(view: WebView, url: String, favicon: Bitmap?) =
    wrapped.onPageStarted(view, url, favicon)

  override fun onPageCommitVisible(view: WebView, url: String) =
    wrapped.onPageCommitVisible(view, url)

  override fun onPageFinished(view: WebView, url: String) = wrapped.onPageFinished(view, url)

  override fun onLoadResource(view: WebView, url: String) = wrapped.onLoadResource(view, url)

  override fun doUpdateVisitedHistory(view: WebView, url: String, isReload: Boolean) =
    wrapped.doUpdateVisitedHistory(view, url, isReload)

  override fun onReceivedError(
    view: WebView,
    request: WebResourceRequest,
    error: WebResourceError
  ) = wrapped.onReceivedError(view, request, error)

  override fun onReceivedHttpError(
    view: WebView,
    request: WebResourceRequest,
    errorResponse: WebResourceResponse
  ) = wrapped.onReceivedHttpError(view, request, errorResponse)

  override fun onReceivedSslError(view: WebView, handler: SslErrorHandler, error: SslError) =
    wrapped.onReceivedSslError(view, handler, error)

  override fun onReceivedClientCertRequest(view: WebView, request: ClientCertRequest) =
    wrapped.onReceivedClientCertRequest(view, request)

  override fun onReceivedHttpAuthRequest(
    view: WebView,
    handler: HttpAuthHandler,
    host: String,
    realm: String
  ) = wrapped.onReceivedHttpAuthRequest(view, handler, host, realm)

  override fun onReceivedLoginRequest(
    view: WebView,
    realm: String,
    account: String?,
    args: String
  ) = wrapped.onReceivedLoginRequest(view, realm, account, args)

  override fun onFormResubmission(view: WebView, dontResend: Message, resend: Message) =
    wrapped.onFormResubmission(view, dontResend, resend)

  override fun shouldOverrideKeyEvent(view: WebView, event: KeyEvent): Boolean =
    wrapped.shouldOverrideKeyEvent(view, event)

  override fun onUnhandledKeyEvent(view: WebView, event: KeyEvent) =
    wrapped.onUnhandledKeyEvent(view, event)

  override fun onScaleChanged(view: WebView, oldScale: Float, newScale: Float) =
    wrapped.onScaleChanged(view, oldScale, newScale)

  @RequiresApi(26)
  override fun onRenderProcessGone(view: WebView, detail: RenderProcessGoneDetail): Boolean =
    wrapped.onRenderProcessGone(view, detail)

  @RequiresApi(27)
  override fun onSafeBrowsingHit(
    view: WebView,
    request: WebResourceRequest,
    threatType: Int,
    callback: SafeBrowsingResponse
  ) = wrapped.onSafeBrowsingHit(view, request, threatType, callback)
}
