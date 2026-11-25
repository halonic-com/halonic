---
"@halonicjs/app-studio": patch
---

A tool file can now declare an object parameter with its fields and a list parameter with its item type, such as monitor and blockedBy for paperclip.next-step (blockedBy may also be one text with commas), and halonic validate refuses a parameter its action needs that is declared as optional or with the wrong type.
