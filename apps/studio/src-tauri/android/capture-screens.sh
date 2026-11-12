#!/usr/bin/env bash
# Captures the Android app's own screens from a real build, for the Google
# Play listing (HAL-6953, play-listing section 5): the connect screen,
# "isn't answering" and the two version screens. Raw captures only, with
# nothing in the screen edited: the listing frame is added later.
#
#   capture-screens.sh <app.apk> [out-folder]
#
# It boots its own emulator (1080 × 1920, 420 dpi, Android 15, light scheme),
# sets the status bar with demo mode, drives the app and saves
# connect.png, not-answering.png, app-too-old.png and computer-too-old.png.
# The emulator is stopped when the script ends. See README.md.
set -euo pipefail

apk=${1:?"Usage: capture-screens.sh <app.apk> [out-folder]"}
out=${2:-android-screens}
here=$(cd "$(dirname "$0")" && pwd)

package=com.halonic.studio
# The address the play listing uses on every shot, as in the app's own hint.
address=192.168.1.20:4280
avd=halonic-play-screens
serial=emulator-5584
# Where the stand-in computer listens on this machine (10.0.2.2 in the emulator).
host_port=${HOST_PORT:-4280}

sdk=${ANDROID_HOME:-${ANDROID_SDK_ROOT:-}}
adb_tool="$sdk/platform-tools/adb"
emulator_tool="$sdk/emulator/emulator"
avdmanager_tool="$sdk/cmdline-tools/latest/bin/avdmanager"
case $(uname -m) in
  arm64 | aarch64) abi=arm64-v8a ;;
  *) abi=x86_64 ;;
esac
# A Google APIs image, not a Google Play one: only it allows `adb root`,
# which the address routing below needs.
image="system-images;android-35;google_apis;$abi"

fail() {
  echo "capture-screens: $*" >&2
  exit 1
}

adb_() {
  "$adb_tool" -s "$serial" "$@"
}

# --- Before anything starts ---------------------------------------------------

[ -f "$apk" ] || fail "no APK at $apk."
[ -n "$sdk" ] || fail "set ANDROID_HOME to your Android SDK."
for tool in "$adb_tool" "$emulator_tool" "$avdmanager_tool"; do
  [ -x "$tool" ] || fail "missing $tool. Install the platform tools, the emulator and the command-line tools."
done
command -v node >/dev/null || fail "Node.js is needed for the stand-in computer and the PNG files."
[ -d "$sdk/system-images/android-35/google_apis/$abi" ] ||
  fail "missing the Android 15 image. Install it with: sdkmanager \"$image\""
if "$adb_tool" devices | grep -q "^$serial"; then
  fail "$serial is already running. Stop it first."
fi
# On the shared runner, the emulator's threads count against the process limit.
if [ -r /sys/fs/cgroup/pids.current ] && [ "$(cat /sys/fs/cgroup/pids.current)" -gt 6500 ]; then
  fail "more than 6,500 processes and threads in use. Try again later."
fi

mkdir -p "$out"
work=$(mktemp -d)
emulator_pid=""
computer_pid=""

stop_fake_computer() {
  if [ -n "$computer_pid" ]; then
    kill "$computer_pid" 2>/dev/null || true
    wait "$computer_pid" 2>/dev/null || true
    computer_pid=""
  fi
}

cleanup() {
  stop_fake_computer
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

avd_config="${ANDROID_AVD_HOME:-${ANDROID_USER_HOME:-$HOME/.android}/avd}/$avd.avd/config.ini"

set_avd_option() {
  grep -v "^$1=" "$avd_config" >"$work/config.ini" || true
  echo "$1=$2" >>"$work/config.ini"
  cp "$work/config.ini" "$avd_config"
}

if ! "$emulator_tool" -list-avds | grep -qx "$avd"; then
  echo "Creating the emulator $avd"
  echo no | "$avdmanager_tool" create avd --name "$avd" --package "$image" --device pixel >/dev/null
fi
set_avd_option hw.lcd.width 1080
set_avd_option hw.lcd.height 1920
set_avd_option hw.lcd.density 420
# A hardware keyboard keeps the on-screen keyboard closed while typing.
set_avd_option hw.keyboard yes

echo "Starting the emulator (a minute or two)"
"$emulator_tool" -avd "$avd" -port "${serial#emulator-}" -no-window -no-audio -no-boot-anim \
  -no-snapshot -wipe-data -gpu swiftshader_indirect >"$work/emulator.log" 2>&1 &
emulator_pid=$!

wait_for_boot() {
  local deadline=$((SECONDS + 300))
  until [ "$(adb_ shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = 1 ]; do
    kill -0 "$emulator_pid" 2>/dev/null || fail "the emulator stopped. Its log: $(tail -5 "$work/emulator.log")"
    [ $SECONDS -lt $deadline ] || fail "the emulator didn't finish starting in 5 minutes."
    sleep 2
  done
}
wait_for_boot
adb_ root >/dev/null
# adbd restarts as root; wait until it answers again.
deadline=$((SECONDS + 30))
until [ "$(adb_ shell id -u 2>/dev/null | tr -d '\r')" = 0 ]; do
  [ $SECONDS -lt $deadline ] || fail "adb didn't restart as root. Is this a Google APIs image?"
  sleep 1
done

size=$(adb_ shell wm size | tr -d '\r')
density=$(adb_ shell wm density | tr -d '\r')
case "$size $density" in
  *"Physical size: 1080x1920"*"Physical density: 420"*) ;;
  *) fail "the screen is not 1080 × 1920 at 420 dpi: $size, $density." ;;
esac

# --- The phone's settings -----------------------------------------------------

adb_ shell cmd uimode night no >/dev/null
adb_ shell settings put secure show_ime_with_hard_keyboard 0
adb_ shell cmd overlay enable-exclusive --category com.android.internal.systemui.navbar.gestural >/dev/null 2>&1 ||
  echo "Note: couldn't switch to gesture navigation; the captures show the image's default."
# No animations, so a capture never catches a screen halfway in.
for scale in window_animation_scale transition_animation_scale animator_duration_scale; do
  adb_ shell settings put global "$scale" 0
done

# Demo mode: 09:14, full battery and signal, no notifications or other icons.
demo() {
  adb_ shell am broadcast -a com.android.systemui.demo -e command "$@" >/dev/null
}
adb_ shell settings put global sysui_demo_allowed 1
demo enter
demo clock -e hhmm 0914
demo battery -e level 100 -e plugged false
demo network -e wifi show -e level 4 -e fully true
demo network -e mobile show -e datatype none -e level 4 -e fully true
demo notifications -e visible false
demo status -e alarm hide -e bluetooth hide -e location hide -e mute hide -e volume hide -e sync hide

# --- The app ------------------------------------------------------------------

echo "Installing $apk"
adb_ install -r "$apk" >/dev/null
app_version=$(adb_ shell dumpsys package "$package" | tr -d '\r' | sed -n '/versionName=/{s/.*versionName=//p;q;}')
[ -n "$app_version" ] || fail "can't read the installed app's version."

# The address goes to this machine's stand-in computer while it answers, and
# nowhere at all for "isn't answering" (a computer that is off or asleep).
route_to_fake_computer() {
  adb_ shell iptables -t nat -I OUTPUT -p tcp -d 192.168.1.20 --dport 4280 \
    -j DNAT --to-destination "10.0.2.2:$host_port"
}
route_nowhere() {
  adb_ shell iptables -t nat -D OUTPUT -p tcp -d 192.168.1.20 --dport 4280 \
    -j DNAT --to-destination "10.0.2.2:$host_port"
  adb_ shell iptables -I OUTPUT -p tcp -d 192.168.1.20 -j DROP
}

start_fake_computer() { # version minAppVersion
  stop_fake_computer
  node "$here/fake-computer.mjs" "$host_port" "$1" "$2" &
  computer_pid=$!
  local deadline=$((SECONDS + 10))
  until (exec 3<>"/dev/tcp/127.0.0.1/$host_port") 2>/dev/null; do
    [ $SECONDS -lt $deadline ] || fail "the stand-in computer didn't start on port $host_port."
    sleep 0.2
  done
  # Something else may already be listening there, such as a real Halonic.
  kill -0 "$computer_pid" 2>/dev/null ||
    fail "port $host_port is taken. Run again with HOST_PORT set to a free port."
}

launch_app() {
  adb_ shell am force-stop "$package"
  adb_ shell am start -W -n "$package/.MainActivity" >/dev/null
}

# True when the screen shows `text`, read from the window's accessibility tree.
screen_shows() { # text
  local window
  adb_ shell uiautomator dump /sdcard/window.xml >/dev/null 2>&1 || return 1
  window=$(adb_ exec-out cat /sdcard/window.xml) || return 1
  [[ $window == *"$1"* ]]
}

wait_for_text() { # text seconds
  local deadline=$((SECONDS + $2))
  until screen_shows "$1"; do
    [ $SECONDS -lt $deadline ] || fail "the screen never showed \"$1\"."
    sleep 1
  done
  # The caret and any late layout settle.
  sleep 1
}

capture() { # name
  adb_ exec-out screencap >"$work/$1.raw"
  node "$here/screencap-to-png.mjs" "$work/$1.raw" "$out/$1.png"
}

# The next minor version after the app's, which the app is too old for.
IFS=. read -r major minor _ <<<"${app_version%%[-+]*}"
newer_computer="$major.$((minor + 1)).0"
# Older than the oldest computer the app works with (OLDEST_COMPUTER in
# src/connect.rs, 0.1.0 since the first release), but not too new for the app.
older_computer=0.0.9

route_to_fake_computer

# 1. The connect screen with the address typed. A fresh install remembers no
#    address, so the app opens on it.
launch_app
wait_for_text "Connect to Halonic" 60
adb_ shell input text "$address"
wait_for_text "$address" 10
capture connect

# 2. Connect, to a computer older than the app works with. The app now
#    remembers the address.
start_fake_computer "$older_computer" "$older_computer"
adb_ shell input keyevent KEYCODE_ENTER
wait_for_text "is too old for this app" 15
capture computer-too-old

# 3. Open the app again, now with a computer that needs a newer app.
start_fake_computer "$newer_computer" "$newer_computer"
launch_app
wait_for_text "This app is too old" 15
capture app-too-old

# 4. Open the app again with nothing behind the address. The hello call gives
#    up after 5 seconds.
stop_fake_computer
route_nowhere
launch_app
wait_for_text "answering." 20
capture not-answering

echo "Done: four screens in $out (app $app_version)."
