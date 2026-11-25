import { deviceCheck } from "../device-check.ts";

/** Asks a person to try the Android build, with a TalkBack pass (inventory part 1, row 7). */
export const definition = deviceCheck({
  id: "device.check-android-build",
  title: "Try the Android build",
  summary:
    "Installs the Android build on your phone and tells us whether it works, with TalkBack on.",
  subject: "the Android app",
  instructions: [
    "Under **Assets**, download the file that ends in `.apk`.",
    "Open the file on your phone and allow the install. If Android asks for permission to install from this source, note what it says.",
    "Open Halonic and wait for the first screen.",
    "Turn on **TalkBack** in your phone's **Accessibility** settings, then go back to Halonic.",
    "Swipe through the first screen and the main menu. Each button and heading should be read out with a clear name.",
    "Turn TalkBack off again.",
    "It works if the app installs, opens, and TalkBack names everything you reach.",
  ],
  checkedOn: "2026-11-25",
});
