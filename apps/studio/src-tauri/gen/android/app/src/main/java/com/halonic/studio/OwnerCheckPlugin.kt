package com.halonic.studio

import android.app.Activity
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import androidx.annotation.RequiresApi
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/** The first Android that can ask for strong (Class 3) biometrics only. */
private const val ANDROID_11 = Build.VERSION_CODES.R

/**
 * The owner check before the phone answers an approval (HAL-15194, board
 * decision 4b). Android's own BiometricPrompt, strong biometrics only, so a
 * weak face unlock from the front camera never passes, and no PIN either:
 * the decision asks for a biometric. Every call shows a new prompt; nothing
 * is remembered between them.
 *
 * Only the shell calls these commands, from Rust (the `owner_check`
 * module), with the prompt's words fixed there; no page can. Every answer
 * is one of the texts `halonic-owner-check` reads, and anything it doesn't
 * know reads as unavailable.
 */
@TauriPlugin
class OwnerCheckPlugin(private val host: Activity) : Plugin(host) {
  /** The prompt that is open, if any. Tauri runs commands on the main thread, as do the callbacks. */
  private var open: CancellationSignal? = null

  /** Answers `{status}` without asking the person anything. */
  @Command
  fun ownerCheckStatus(invoke: Invoke) {
    invoke.resolve(JSObject().put("status", status()))
  }

  /** `{title, description, cancel}`, answers `{answer}` once the person has. */
  @Command
  fun confirmOwner(invoke: Invoke) {
    val args = invoke.getArgs()
    val title = args.getString("title", null)
    val description = args.getString("description", null)
    val cancel = args.getString("cancel", null)
    if (title == null || description == null || cancel == null) {
      invoke.reject("confirmOwner needs title, description and cancel")
      return
    }
    if (Build.VERSION.SDK_INT < ANDROID_11) {
      answer(invoke, "android-too-old")
      return
    }
    val status = strongStatus()
    if (status != "ready") {
      answer(invoke, status)
      return
    }
    if (open != null) {
      answer(invoke, "busy")
      return
    }
    prompt(invoke, title, description, cancel)
  }

  @RequiresApi(ANDROID_11)
  private fun prompt(invoke: Invoke, title: String, description: String, cancel: String) {
    val signal = CancellationSignal()
    open = signal
    var answered = false
    // The negative button and the callback can both end one prompt; the
    // first one answers.
    fun finish(text: String) {
      if (answered) return
      answered = true
      if (open === signal) open = null
      answer(invoke, text)
    }
    val prompt = BiometricPrompt.Builder(host)
      .setTitle(title)
      .setDescription(description)
      .setAllowedAuthenticators(BIOMETRIC_STRONG)
      .setConfirmationRequired(true)
      .setNegativeButton(cancel, host.mainExecutor) { _, _ -> finish("cancelled") }
      .build()
    prompt.authenticate(
      signal,
      host.mainExecutor,
      object : BiometricPrompt.AuthenticationCallback() {
        override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
          finish("confirmed")
        }

        override fun onAuthenticationError(code: Int, message: CharSequence) {
          finish(errorAnswer(code))
        }

        // onAuthenticationFailed is one try that didn't match: the prompt
        // stays open for the next, so it answers nothing.
      }
    )
  }

  private fun status(): String {
    if (Build.VERSION.SDK_INT < ANDROID_11) return "android-too-old"
    return strongStatus()
  }

  @RequiresApi(ANDROID_11)
  private fun strongStatus(): String {
    val manager = host.getSystemService(BiometricManager::class.java) ?: return "unavailable"
    return when (manager.canAuthenticate(BIOMETRIC_STRONG)) {
      BiometricManager.BIOMETRIC_SUCCESS -> "ready"
      BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "not-enrolled"
      BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "no-strong-biometric"
      else -> "unavailable"
    }
  }

  private fun errorAnswer(code: Int): String = when (code) {
    BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT,
    BiometricPrompt.BIOMETRIC_ERROR_LOCKOUT_PERMANENT -> "locked-out"
    BiometricPrompt.BIOMETRIC_ERROR_USER_CANCELED,
    BiometricPrompt.BIOMETRIC_ERROR_CANCELED,
    BiometricPrompt.BIOMETRIC_ERROR_TIMEOUT -> "cancelled"
    BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS -> "not-enrolled"
    BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT -> "no-strong-biometric"
    else -> "unavailable"
  }

  private fun answer(invoke: Invoke, text: String) {
    invoke.resolve(JSObject().put("answer", text))
  }
}
