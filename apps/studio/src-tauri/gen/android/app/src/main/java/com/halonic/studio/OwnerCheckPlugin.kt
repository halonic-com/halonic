package com.halonic.studio

import android.app.Activity
import android.hardware.biometrics.BiometricManager
import android.hardware.biometrics.BiometricManager.Authenticators.BIOMETRIC_STRONG
import android.hardware.biometrics.BiometricManager.Authenticators.DEVICE_CREDENTIAL
import android.hardware.biometrics.BiometricPrompt
import android.os.Build
import android.os.CancellationSignal
import androidx.annotation.RequiresApi
import androidx.appcompat.app.AppCompatActivity
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin

/** The first Android that can ask for strong (Class 3) biometrics only. */
private const val ANDROID_11 = Build.VERSION_CODES.R

/**
 * The owner check before the phone answers an approval (HAL-15194, board
 * decision 4b) or an inbox item. Android's own BiometricPrompt, strong
 * biometrics only, so a weak face unlock from the front camera never passes.
 * An approval takes no PIN: the decision asks for a biometric. An inbox
 * answer takes the phone's PIN, pattern or password too (board option P3,
 * HAL-17509), when the shell says so. Every call shows a new prompt; the
 * shell decides when a pass still covers the next inbox answer, and this
 * side only counts how often the app left the screen.
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

  /** Times the app left the screen (background, screen off or locked) since it started. */
  private var timesAway = 0L

  /** Answers `{status}` without asking the person anything. */
  @Command
  fun ownerCheckStatus(invoke: Invoke) {
    invoke.resolve(JSObject().put("status", status()))
  }

  /** Answers `{timesAway}`, without asking the person anything. */
  @Command
  fun ownerCheckAway(invoke: Invoke) {
    invoke.resolve(JSObject().put("timesAway", timesAway))
  }

  /**
   * `{title, description, cancel, allowDeviceCredential}`, answers `{answer}`
   * once the person has. A missing `allowDeviceCredential` reads as false.
   */
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
    val authenticators =
      if (args.optBoolean("allowDeviceCredential", false)) BIOMETRIC_STRONG or DEVICE_CREDENTIAL
      else BIOMETRIC_STRONG
    val status = strongStatus(authenticators)
    if (status != "ready") {
      answer(invoke, status)
      return
    }
    if (open != null) {
      answer(invoke, "busy")
      return
    }
    prompt(invoke, title, description, cancel, authenticators)
  }

  /**
   * Closes the open prompt, if any: the shell's time limit ran out on it.
   * Its own call then answers `cancelled`, which the shell no longer reads.
   */
  @Command
  fun closeOwnerCheck(invoke: Invoke) {
    closePrompt()
    invoke.resolve()
  }

  // A prompt left open when the app leaves the screen or its Activity goes
  // would otherwise answer every later call `busy`. Not on pause: on some
  // phones the prompt itself pauses the Activity. Leaving the screen also
  // ends the shell's 5 minutes for inbox answers: turning the screen off or
  // locking it stops the Activity too.
  override fun onStop(activity: AppCompatActivity) {
    timesAway += 1
    closePrompt()
  }

  override fun onDestroy(activity: AppCompatActivity) {
    closePrompt()
  }

  /**
   * Cancels the open prompt, if any. Its callback then answers `cancelled`,
   * unless the Activity is already gone; the shell's time limit covers that.
   */
  private fun closePrompt() {
    val signal = open ?: return
    open = null
    signal.cancel()
  }

  @RequiresApi(ANDROID_11)
  private fun prompt(
    invoke: Invoke,
    title: String,
    description: String,
    cancel: String,
    authenticators: Int,
  ) {
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
    val builder = BiometricPrompt.Builder(host)
      .setTitle(title)
      .setDescription(description)
      .setAllowedAuthenticators(authenticators)
      .setConfirmationRequired(true)
    // Android shows its own "Use PIN" in place of a cancel button when the
    // PIN is allowed, and refuses a prompt that has both.
    if (authenticators and DEVICE_CREDENTIAL == 0) {
      builder.setNegativeButton(cancel, host.mainExecutor) { _, _ -> finish("cancelled") }
    }
    val prompt = builder.build()
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
    return strongStatus(BIOMETRIC_STRONG)
  }

  @RequiresApi(ANDROID_11)
  private fun strongStatus(authenticators: Int): String {
    val manager = host.getSystemService(BiometricManager::class.java) ?: return "unavailable"
    return when (manager.canAuthenticate(authenticators)) {
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
    BiometricPrompt.BIOMETRIC_ERROR_NO_BIOMETRICS,
    BiometricPrompt.BIOMETRIC_ERROR_NO_DEVICE_CREDENTIAL -> "not-enrolled"
    BiometricPrompt.BIOMETRIC_ERROR_HW_NOT_PRESENT -> "no-strong-biometric"
    else -> "unavailable"
  }

  private fun answer(invoke: Invoke, text: String) {
    invoke.resolve(JSObject().put("answer", text))
  }
}
