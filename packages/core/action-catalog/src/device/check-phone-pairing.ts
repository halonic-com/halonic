import { deviceCheck } from "../device-check.ts";

/** Asks a person to pair their phone with Halonic on their computer (inventory part 1, row 7). */
export const definition = deviceCheck({
  id: "device.check-phone-pairing",
  title: "Pair your phone",
  summary: "Pairs the phone app with Halonic on your computer and tells us whether it works.",
  subject: "the phone app",
  instructions: [
    "Under **Assets**, download the phone app and install it.",
    "On your computer, open Halonic and go to **Settings**, then **Phone**, then **Pair a phone**.",
    "On your phone, open the app and choose **Scan code**. Scan the code on your computer.",
    "Check that the phone shows your computer's name and the computer shows your phone.",
    "Send a test message from the phone. It should appear in Halonic on your computer.",
    "It works if both sides show each other and the test message arrives.",
  ],
  checkedOn: "2026-11-25",
});
