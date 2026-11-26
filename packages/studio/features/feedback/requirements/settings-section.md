# feedback.settings-section

- Status: active
- Since: unreleased
- Source: HAL-18972 (plan on HAL-18919); the words are §5 of Sofia's sketch on HAL-18562

Where the app gives the feedback settings (Studio's own main window on the desktop), the Studio shall show Settings → Feedback with the fields "Project" (Halonic apps until another is saved) and "Assign to" (Chief until another is saved), kept on the computer for every workspace as `feedback.project` and `feedback.assignee`. When the person leaves a field or presses Enter in it, the Studio shall save its trimmed text, and put an emptied field back to its default. When a save fails, the Studio shall say "Couldn't save "Project" on this computer." (with that field's name) under the field and in the dialog. While feedback waits to be sent, the section shall say "{n} waiting to send". Where the app doesn't give the feedback settings, such as the served Studio, Settings shall show neither Keyboard nor Feedback.

## Examples

- Given nothing is saved,
  when Feedback shows,
  then Project reads "Halonic apps" and Assign to reads "Chief".
- Given Feedback shows,
  when the person types "Acme apps" in Project and leaves it,
  then `feedback.project` is saved as "Acme apps".
- Given 3 feedbacks wait to be sent,
  when Feedback shows,
  then it says "3 waiting to send".
