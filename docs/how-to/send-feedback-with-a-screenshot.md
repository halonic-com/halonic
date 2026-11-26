# Send feedback with a screenshot

When something in Studio looks wrong or could be better, you can show it in seconds. Press the shortcut, drag a box around what you mean, write a line, and Studio sends it to Paperclip as a task.

Send feedback is there while Studio is connected to Paperclip. It works in the desktop app on Windows and on Linux with X11. See "Where it doesn't work" below for the rest.

## Send feedback

1. Press **Ctrl+Shift+F** (**⌘ ⇧ F** on macOS) in the Studio, Inbox or Messenger window. You can also choose **Send feedback** in Help, or find it in Ctrl K. The shortcut works only in the window you are in, never from other apps.
2. The window dims. Drag a box around the area. Its size shows below it. Or press **Enter** to take the whole window, or click one corner and then the opposite corner. Press **Esc** to cancel.
3. In the Send feedback dialog, write what you noticed. The first line becomes the task's title. Under the screenshot you see the app, the window and the size. Choose **Select again** to pick a new area; what you wrote stays.
4. Press **Send**, or **Ctrl+Enter** (**⌘ ↩**).

The task holds your text, the screenshot of the area you chose, the app and window you were in, the time and the Studio version. Make sure the box covers nothing you don't want to share. If you write nothing, Studio says "Write a line about what you saw." and sends nothing.

"Feedback sent" shows the task's ID and title, with **Open task**.

If the screenshot can't be loaded, the dialog says so and offers **Send without a screenshot**. If Paperclip refuses the feedback, the dialog stays open with what you wrote and says "Couldn't send your feedback" with Paperclip's reason. Choose **Try again**.

## Cancel and undo

Press **Cancel**, **✕** or **Esc** to close the dialog without sending. If you had written something, Studio says "Feedback discarded". Choose **Undo** to bring back your text and screenshot.

## If you are offline

If Studio is offline, or isn't connected to Paperclip, the dialog says so before you press Send. Studio keeps your feedback and the screenshot on this computer and says "Feedback saved" and "It sends by itself once Studio is back online." (or "…connected to Paperclip.").

When the connection is back, Studio sends what is waiting, oldest first, and says "Feedback sent" for each task it created. Each piece of feedback makes one task, even if a reply is lost on the way.

- Studio keeps up to 50 pieces of feedback (100 MB of screenshots). When there are more, it drops the oldest.
- If Paperclip refuses a feedback 3 times, Studio stops trying.
- Settings → Feedback shows how many are waiting, for example "3 waiting to send".

## Choose where feedback goes

In Settings → Feedback, set **Project** (Halonic apps until you change it) and **Assign to** (Chief until you change it). The settings are kept on this computer for every workspace. An emptied field goes back to its default. Both must name a project and an agent that exist in the Paperclip you're connected to, so set them before your first feedback. If either doesn't match, no task is made.

## Change the shortcut

In Settings → Keyboard, find the **Send feedback** row and choose **Change**. When it says "Press the new shortcut", press the keys you want: at least one of Ctrl, Alt or ⌘ is needed. Press **Esc** to stop. If another app holds the keys, Studio says "{keys} is taken by another app. Choose another." and keeps the old shortcut.

## Where it doesn't work

On macOS, and on Linux with Wayland, Studio can't take a screenshot. The shortcut opens a small window that says "Studio can't take a screenshot for feedback on this system." Choose **Not now** to close it.
