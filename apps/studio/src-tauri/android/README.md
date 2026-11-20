# Screen captures of the Android app

`capture-screens.sh` captures the Android app's own screens from a real build, for the Google Play listing (HAL-6953, play-listing section 5). One command, about five minutes:

```sh
apps/studio/src-tauri/android/capture-screens.sh app-universal-debug.apk android-screens
```

It writes four raw captures, 1080 × 1920, 24-bit PNG with no transparency:

| File | Screen | How the script gets there |
| --- | --- | --- |
| `connect.png` | The connect screen with `192.168.1.20:4280` typed, keyboard closed | A fresh install opens on it |
| `computer-too-old.png` | "Halonic on your computer (0.0.9) is too old for this app" | Connect, with a stand-in computer whose hello call answers `0.0.9` |
| `app-too-old.png` | "This app is too old for Halonic on your computer (0.2.0)" | Open the app again, the stand-in now asking for the next minor version after the app's |
| `not-answering.png` | "Halonic on your computer isn't answering." | Open the app again with nothing behind the address; the hello call gives up after 5 seconds |

Nothing in a screen is edited. The frame and caption for the listing are added afterwards, from these files.

## What you need

- The Android SDK, with `ANDROID_HOME` set, and in it the platform tools, the emulator, the command-line tools and the Android 15 Google APIs image: `sdkmanager "system-images;android-35;google_apis;x86_64"` (`arm64-v8a` on an Apple silicon Mac). The script names the image if it's missing.
- Hardware acceleration for the emulator: KVM on Linux, or a Mac or Windows machine. Without it the emulator doesn't start.
- Node.js, for the stand-in computer and the PNG files.
- An APK of the build the listing goes out with. CI's "Android shell (debug APK)" job uploads one as `android-debug-apk` on every pull request that changes the shell.

## What it sets up

- **Its own emulator**, `halonic-play-screens`: 1080 × 1920 at 420 dpi, Android 15, with its on-screen keyboard turned off so nothing covers the connect screen. It starts on port 5584 with no window and its data wiped, and the script stops it when it ends, also on an error or Ctrl+C.
- **The phone:** light scheme, gesture navigation, no animations.
- **The status bar, with Android's demo mode:** 09:14, full battery and full Wi-Fi signal, no notifications or other icons. No mobile signal: Android 15's demo mode labels it 3G whatever data type the script asks for.
- **The address:** `192.168.1.20:4280` on every shot. Inside the emulator, the script points that address at `fake-computer.mjs` on this machine (with `iptables`, which is why it needs a Google APIs image: Google Play images don't allow `adb root`). For "isn't answering" it drops everything sent to the address, as for a computer that's off.

The stand-in computer listens on port 4280 on loopback. If a real Halonic already uses that port, set another: `HOST_PORT=4290 capture-screens.sh …`.

## On GitHub

The "Android screen captures" workflow (`.github/workflows/android-screens.yml`) runs the script on a GitHub runner, which has KVM, and uploads the four PNGs as the `android-screens` artifact. Run it from the Actions tab: by default it captures the newest `android-debug-apk` built on main; give it a CI run's ID to capture that run's build. CI keeps an APK for 7 days.

```sh
gh workflow run android-screens.yml --ref main -f run_id=<CI run ID>
```

A pull request that changes this folder or the workflow runs it too, with main's newest APK.

## On the shared runner

The shared runner has no KVM, so the emulator can't run there (checked 12 Nov 2026). If that changes: the emulator's threads count against the runner's process limit. The script stops when more than 6,500 are in use, as `cat /sys/fs/cgroup/pids.current` shows.

## If a step fails

The script waits for each screen's words in the window's accessibility tree (`uiautomator dump`) before it captures, and stops with the words it didn't see. A capture of the wrong screen is worse than none. The usual cause is an APK from before the connect page (HAL-1140). The emulator's log is shown when the emulator itself stops.

# The device key contract on the real Keystore

`check-device-keys.sh` runs `check_wrapper_contract` and `check_store_contract` from `halonic-device-keys` against the real Android Keystore, in an emulator (HAL-13784). CI's "Android device keys (emulator)" job runs it on every pull request that changes the shell, in the merge queue and on main, with the debug APK the same run built. It needs the same SDK parts and KVM as the screen captures, but no Node.js. About five minutes:

```sh
apps/studio/src-tauri/android/check-device-keys.sh app-universal-debug.apk
```

It boots its own emulator, `halonic-device-keys`, on port 5586, installs the APK, writes the file `device-key-check` into the app's data folder with `adb shell run-as`, and starts the app. The app sees the file, removes it, runs both contracts on a thread of its own and writes `ok` or the first case that failed to `device-key-check.result`. The script prints that and fails unless it says `ok`. The cases use only the computers `halonic-contract-first` and `halonic-contract-second`, and forget them at the end.

**Debug builds only.** The check is `src/device_key_check.rs`. It is left out of release builds at compile time, not by a setting: `lib.rs` declares the module only with `debug_assertions`, so does its one call in `src/device_keys.rs`, and the module itself holds a `compile_error!` for a build without `debug_assertions`, so loosening either line breaks the release build instead of shipping the check. `run-as` also refuses an app that isn't debuggable.
