package com.halonic.studio

import android.app.Activity
import android.content.pm.PackageManager
import android.os.Build
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import app.tauri.annotation.Command
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.security.GeneralSecurityException
import java.security.InvalidKeyException
import java.security.KeyStore
import java.security.ProviderException
import java.security.UnrecoverableKeyException
import java.util.concurrent.Executors
import javax.crypto.AEADBadTagException
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val KEYSTORE = "AndroidKeyStore"

/** The Keystore key that seals every device key. A new scheme gets a new alias. */
private const val ALIAS = "halonic-device-key-wrap-v1"
private const val TRANSFORMATION = "AES/GCM/NoPadding"
private const val KEY_BITS = 256
private const val IV_BYTES = 12
private const val TAG_BITS = 128
private const val BASE64URL = Base64.URL_SAFE or Base64.NO_PADDING or Base64.NO_WRAP

/** The first Android that can keep a key in StrongBox. */
private const val ANDROID_9 = 28

/**
 * Seals the phone's key for each paired computer (HAL-12245, build plan
 * decision 10). The X25519 pair is made in Rust; the Keystore can't do
 * X25519, so it holds an AES-256-GCM key instead, in StrongBox when the
 * phone has one, that never leaves it. Sealed bytes are the 12-byte IV the
 * Keystore picked, then the ciphertext and its tag; the computer's context
 * is the additional data, so a sealed key copied to another computer's file
 * doesn't open. Only the shell calls these commands, from Rust (the
 * `device_keys` module); no page can.
 */
@TauriPlugin
class DeviceKeyPlugin(private val host: Activity) : Plugin(host) {
  /**
   * Tauri runs commands on the main thread, while the shell waits for the
   * answer. Keystore calls can be slow, StrongBox above all, so they run
   * here, one at a time, and answer from there.
   */
  private val worker = Executors.newSingleThreadExecutor()

  /** `{plain, context}` in base64url, answers `{sealed}`. */
  @Command
  fun sealDeviceKey(invoke: Invoke) {
    val plain = bytesArg(invoke, "plain")
    val context = bytesArg(invoke, "context")
    if (plain == null || context == null) {
      invoke.reject("sealDeviceKey needs plain and context in base64url")
      return
    }
    worker.execute { seal(invoke, plain, context) }
  }

  /**
   * `{sealed, context}` in base64url, answers `{plain}`, or `{}` when the
   * bytes don't open: changed, sealed for another context, or sealed by a
   * Keystore key that is gone or that the Keystore can't use any more.
   * Opening never makes or deletes a key.
   */
  @Command
  fun openDeviceKey(invoke: Invoke) {
    val sealed = bytesArg(invoke, "sealed")
    val context = bytesArg(invoke, "context")
    if (sealed == null || context == null) {
      invoke.reject("openDeviceKey needs sealed and context in base64url")
      return
    }
    worker.execute { open(invoke, sealed, context) }
  }

  private fun seal(invoke: Invoke, plain: ByteArray, context: ByteArray) {
    try {
      val cipher = sealingCipher()
      if (cipher.iv.size != IV_BYTES) {
        invoke.reject("the Android Keystore picked an IV of another length")
        return
      }
      cipher.updateAAD(context)
      val sealed = cipher.iv + cipher.doFinal(plain)
      invoke.resolve(JSObject().put("sealed", encode(sealed)))
    } catch (error: Exception) {
      invoke.reject("the Android Keystore could not seal the key")
    } finally {
      plain.fill(0)
    }
  }

  private fun open(invoke: Invoke, sealed: ByteArray, context: ByteArray) {
    try {
      val key = existingKey()
      if (key == null || sealed.size < IV_BYTES + TAG_BITS / 8) {
        invoke.resolve(JSObject())
        return
      }
      val cipher = Cipher.getInstance(TRANSFORMATION)
      cipher.init(Cipher.DECRYPT_MODE, key, GCMParameterSpec(TAG_BITS, sealed, 0, IV_BYTES))
      cipher.updateAAD(context)
      val plain = cipher.doFinal(sealed, IV_BYTES, sealed.size - IV_BYTES)
      invoke.resolve(JSObject().put("plain", encode(plain)))
      plain.fill(0)
    } catch (error: AEADBadTagException) {
      invoke.resolve(JSObject())
    } catch (error: GeneralSecurityException) {
      if (isBrokenKey(error)) {
        invoke.resolve(JSObject())
      } else {
        invoke.reject("the Android Keystore could not open the key")
      }
    } catch (error: Exception) {
      invoke.reject("the Android Keystore could not open the key")
    }
  }

  private fun existingKey(): SecretKey? {
    val store = KeyStore.getInstance(KEYSTORE)
    store.load(null)
    return store.getKey(ALIAS, null) as? SecretKey
  }

  /** The sealing key, made on the first seal. Only the worker calls it. */
  private fun wrappingKey(): SecretKey = existingKey() ?: makeKey()

  /**
   * A cipher ready to seal. When the key under [ALIAS] is there but the
   * Keystore can't use it (some phones do this after an OS update or a
   * lock-screen change), every file it sealed already reads as unreadable,
   * so it is replaced once and the new pairing can still be saved. Without
   * this the phone couldn't pair again until its app data was cleared.
   */
  private fun sealingCipher(): Cipher {
    try {
      return encryptingCipher(wrappingKey())
    } catch (error: GeneralSecurityException) {
      if (!isBrokenKey(error)) {
        throw error
      }
    }
    deleteKey()
    return encryptingCipher(makeKey())
  }

  private fun encryptingCipher(key: SecretKey): Cipher {
    val cipher = Cipher.getInstance(TRANSFORMATION)
    cipher.init(Cipher.ENCRYPT_MODE, key)
    return cipher
  }

  /**
   * The key is there but the Keystore can't use it: `getKey` can't recover
   * it, or `cipher.init` refuses it (KeyPermanentlyInvalidatedException is
   * one kind). A Keystore that can't be reached at all is another error.
   */
  private fun isBrokenKey(error: GeneralSecurityException): Boolean =
    error is InvalidKeyException || error is UnrecoverableKeyException

  private fun deleteKey() {
    val store = KeyStore.getInstance(KEYSTORE)
    store.load(null)
    store.deleteEntry(ALIAS)
  }

  private fun makeKey(): SecretKey {
    val strongBox = Build.VERSION.SDK_INT >= ANDROID_9 &&
      host.packageManager.hasSystemFeature(PackageManager.FEATURE_STRONGBOX_KEYSTORE)
    if (strongBox) {
      try {
        return generate(true)
      } catch (error: ProviderException) {
        // StrongBoxUnavailableException, or another provider error: some
        // phones report StrongBox but can't make this key in it.
      }
    }
    return generate(false)
  }

  private fun generate(inStrongBox: Boolean): SecretKey {
    val spec = KeyGenParameterSpec.Builder(
      ALIAS,
      KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
    )
      .setKeySize(KEY_BITS)
      .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
      .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
      .setRandomizedEncryptionRequired(true)
    if (inStrongBox && Build.VERSION.SDK_INT >= ANDROID_9) {
      spec.setIsStrongBoxBacked(true)
    }
    val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
    generator.init(spec.build())
    return generator.generateKey()
  }

  private fun bytesArg(invoke: Invoke, name: String): ByteArray? {
    val text = invoke.getArgs().getString(name, null) ?: return null
    return try {
      Base64.decode(text, BASE64URL)
    } catch (error: IllegalArgumentException) {
      null
    }
  }

  private fun encode(bytes: ByteArray): String = Base64.encodeToString(bytes, BASE64URL)
}
