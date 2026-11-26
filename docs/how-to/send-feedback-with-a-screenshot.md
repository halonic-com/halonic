# Send feedback with a screenshot

When something in Studio looks wrong or could be better, you can show it in seconds. Press the shortcut, drag a box around what you mean, write a line, and Studio sends it to Paperclip as a task.

## Send feedback

1. Press **Ctrl+Alt+F** (**⌘ ⌥ F** on macOS). The screen freezes and dims.
2. Drag a box around the area. Its size shows below it. Or press **Enter** to take the whole screen, or click one corner and then the opposite corner. Press **Esc** to cancel.
3. In the Send feedback window, write what you noticed. The first line becomes the task's title.
4. Press **Send**, or **Ctrl+Enter** (**⌘ ↩**).

The task holds your text, the time, the Studio version and the size of the screenshot. The screenshot itself goes to Paperclip with the task, so make sure the box covers nothing you don't want to share. It is taken in memory and only the part you chose is kept. If you write nothing, Studio says "Write a line about what you saw." and sends nothing. To close the window without sending, press **Cancel** or **Esc**; the window closes at once.

the task will also name the app and window you were in, and you will be able to select the area again.

A toast tells you what happened, in Studio's main window. "Feedback sent" shows the task's ID and title, with **Open task**. If the main window isn't open, the Send feedback window shows the outcome itself before it closes.

## If you are offline

If Studio is offline, or isn't connected to Paperclip, it keeps your feedback and the screenshot on this computer. The toast says "Feedback saved" and "It sends by itself once Studio is back online." (or "…connected to Paperclip.").

When the connection is back, Studio sends what is waiting, oldest first, and shows a toast for each task it created. Each feedback makes one task, even if a reply is lost on the way.

- Studio keeps up to 50 feedbacks (100 MB of screenshots). When there are more, it drops the oldest.
- If Paperclip refuses a feedback 3 times, Studio stops trying.
- Settings → Feedback shows how many are waiting, for example "3 waiting to send". It shows nothing when none are waiting.

## Choose where feedback goes

In Settings → Feedback, set **Project** (Halonic apps until you change it) and **Assign to** (Chief until you change it). The settings are kept on this computer for every workspace. An emptied field goes back to its default.

## Change the shortcut

In Settings → Keyboard, find the **Send feedback** row and choose **Change**. When it says "Press the new shortcut", press the keys you want: at least one of Ctrl, Alt or ⌘ is needed. Press **Esc** to stop. If another app holds the keys, Studio says "{keys} is taken by another app. Choose another." and keeps the old shortcut.

## Where it doesn't work

On macOS, and on Linux with Wayland, Studio can't take a screenshot. The shortcut opens a small window that says "Studio can't take a screenshot for feedback on this system." Choose **Not now** to close it.
