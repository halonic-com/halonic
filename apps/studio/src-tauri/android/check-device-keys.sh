#!/usr/bin/env bash
# Runs the device key contract (`check_wrapper_contract` and
# `check_store_contract`) against the real Android Keystore, in an emulator
# (HAL-13784). CI runs it on the debug APK it builds; FakeWrapper alone
# can't show that the Kotlin side seals, opens and refuses as the contract
# says.
#
#   check-device-keys.sh <app-debug.apk>
#
# It boots its own emulator (Android 15, no window), installs the APK, asks
# for the check with the file `device-key-check` in the app's data folder,
# starts the app and waits for `device-key-check.result`. It exits 0 when
# that says `ok` and 1 otherwise. The check only exists in debug builds
# (src/device_key_check.rs), and only a debug build lets `run-as` write
# the file. The emulator is stopped when the script ends. See README.md.
set -euo pipefail

apk=${1:?"Usage: check-device-keys.sh <app-debug.apk>"}

package=com.halonic.studio
avd=halonic-device-keys
serial=emulator-5586
# The check makes a Keystore key and seals and opens a few times; on a slow
# emulator that can take a while, but not this long.
check_seconds=120

sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
adb_tool="$sdk/platform-tools/adb"
emulator_tool="$sdk/emulator/emulator"
avdmanager_tool="$sdk/cmdline-tools/latest/bin/avdmanager"
case $(uname -m) in
  arm64 | aarch64) abi=arm64-v8a ;;
  *) abi=x86_64 ;;
esac
image="system-images;android-35;google_apis;$abi"

fail() {
  echo "check-device-keys: $*" >&2
  exit 1
}

adb_() {
  "$adb_tool" -s "$serial" "$@"
}

# Runs a command as the app, in its data folder. Debug builds only.
as_app() {
  adb_ shell run-as "$package" "$@"
}

# --- Before anything starts ---------------------------------------------------

[ -f "$apk" ] || fail "no APK at $apk."
[ -n "$sdk" ] || fail "set ANDROID_HOME to your Android SDK."
for tool in "$adb_tool" "$emulator_tool" "$avdmanager_tool"; do
  [ -x "$tool" ] || fail "missing $tool. Install the platform tools, the emulator and the command-line tools."
done
[ -d "$sdk/system-images/android-35/google_apis/$abi" ] ||
  fail "missing the Android 15 image. Install it with: sdkmanager \"$image\""
if "$adb_tool" devices | grep "^$serial" >/dev/null; then
  fail "$serial is already running. Stop it first."
fi
# On the shared runner, the emulator's threads count against the process limit.
if [ -r /sys/fs/cgroup/pids.current ] && [ "$(cat /sys/fs/cgroup/pids.current)" -gt 6500 ]; then
  fail "more than 6,500 processes and threads in use. Try again later."
fi

work=$(mktemp -d)
emulator_pid=""

cleanup() {
  if [ -n "$emulator_pid" ]; then
    echo "Stopping the emulator"
    "$adb_tool" -s "$serial" emu kill >/dev/null 2>&1 || kill "$emulator_pid" 2>/dev/null || true
    wait "$emulator_pid" 2>/dev/null || true
  fi
  rm -rf "$work"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

# --- The emulator -------------------------------------------------------------

# As in capture-screens.sh: set for both tools, so avdmanager creates the
# emulator where the emulator looks for it.
export ANDROID_AVD_HOME="${ANDROID_AVD_HOME:-${ANDROID_USER_HOME:-$HOME/.android}/avd}"
mkdir -p "$ANDROID_AVD_HOME"

if ! "$emulator_tool" -list-avds | grep -x "$avd" >/dev/null; then
  echo "Creating the emulator $avd"
  echo no | "$avdmanager_tool" create avd --name "$avd" --package "$image" --device pixel >/dev/null
fi

echo "Starting the emulator (a minute or two)"
"$emulator_tool" -avd "$avd" -port "${serial#emulator-}" -no-window -no-audio -no-boot-anim \
  -no-snapshot -wipe-data -gpu swiftshader_indirect >"$work/emulator.log" 2>&1 &
emulator_pid=$!

deadline=$((SECONDS + 300))
until [ "$(adb_ shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
  kill -0 "$emulator_pid" 2>/dev/null || fail "the emulator stopped. Its log: $(tail -5 "$work/emulator.log")"
  [ $SECONDS -lt $deadline ] || fail "the emulator didn't finish starting in 5 minutes."
  sleep 2
done

# --- The check ----------------------------------------------------------------

echo "Installing $apk"
adb_ install -r "$apk" >/dev/null
as_app true 2>/dev/null || fail "run-as can't reach $package. Is $apk a debug build?"

as_app rm -f device-key-check.result
as_app touch device-key-check
adb_ shell am start -W -n "$package/.MainActivity" >/dev/null

echo "Waiting for the check (up to $check_seconds seconds)"
deadline=$((SECONDS + check_seconds))
until result=$(as_app cat device-key-check.result 2>/dev/null) && [ -n "$result" ]; do
  if [ $SECONDS -ge $deadline ]; then
    if as_app ls device-key-check >/dev/null 2>&1; then
      fail "the app never picked up device-key-check. Is the check in this build?"
    fi
    fail "the check started but wrote no result in $check_seconds seconds."
  fi
  sleep 2
done
result=$(tr -d '\r' <<<"$result")

echo "Result: $result"
[ "$result" = ok ] || fail "the Keystore doesn't meet the device key contract: $result"
echo "Done: the Android Keystore passes the device key contract."
