# remote.phone-notification-lock-screen

- Status: draft
- Since: unreleased
- Source: HAL-19029 (split from HAL-18899; flow D's wording on HAL-17514, rows p06c and p06d; Noah's choice on HAL-19249)

When the phone shows a notification for something that needs the person, its lock-screen version shall say only "Something needs you on {computer}", with the computer's name as the phone stored it at pairing, whatever the item says and whatever the phone's own lock-screen settings. The item's own text, and its source when the computer named one, shall appear only in the version shown once the phone is unlocked.

## Examples

- Given Tim's laptop asks "Chief asks you: Ship phase 2 now?" from "Paperclip · Halonic",
  when the notification is built,
  then the lock screen reads "Something needs you on Tim's laptop"
  and the unlocked version reads "Chief asks you: Ship phase 2 now?" over "Paperclip · Halonic".
- Given two different items from Tim's laptop,
  when their notifications are built,
  then both lock-screen versions are the same line, and neither holds any of the item's words.
