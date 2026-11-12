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

- **Its own emulator**, `halonic-play-screens`: 1080 × 1920 at 420 dpi, Android 15, a hardware keyboard so the on-screen keyboard stays closed. It starts on port 5584 with no window and its data wiped, and the script stops it when it ends, also on an error or Ctrl+C.
- **The phone:** light scheme, gesture navigation, no animations.
- **The status bar, with Android's demo mode:** 09:14, full battery, full Wi-Fi and mobile signal, no notifications or other icons.
- **The address:** `192.168.1.20:4280` on every shot. Inside the emulator, the script points that address at `fake-computer.mjs` on this machine (with `iptables`, which is why it needs a Google APIs image: Google Play images don't allow `adb root`). For "isn't answering" it drops everything sent to the address, as for a computer that's off.

The stand-in computer listens on port 4280 on loopback. If a real Halonic already uses that port, set another: `HOST_PORT=4290 capture-screens.sh …`.

## On the shared runner

The shared runner has no KVM, so the emulator can't run there (checked 12 Nov 2026). If that changes: the emulator's threads count against the runner's process limit. The script stops when more than 6,500 are in use, as `cat /sys/fs/cgroup/pids.current` shows.

## If a step fails

The script waits for each screen's words in the window's accessibility tree (`uiautomator dump`) before it captures, and stops with the words it didn't see. A capture of the wrong screen is worse than none. The usual cause is an APK from before the connect page (HAL-1140). The emulator's log is shown when the emulator itself stops.
