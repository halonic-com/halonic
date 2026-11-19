---
"@halonicjs/app-studio": patch
---

Deleting a file in the Files tree no longer leaves a live editor on it: an open tab shows its text greyed and read-only under "This file was deleted" with Undo, a file that is gone says "This file isn't in this workspace any more." with Go to Files, focus moves to the next row (and back to the restored row after Undo), and the toast names the full path.
