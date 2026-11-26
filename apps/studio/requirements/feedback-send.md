# studio.feedback-send

- Status: active
- Since: unreleased
- Source: HAL-19240 (plan approved by Liam on HAL-19671, option a, with his conditions); the sender in `studio.feedback-sender`; the toasts in `feedback.send-toasts`

When the person sends feedback from the Send feedback dialog in Studio's main window, the desktop
app shall hand it to the outbox of the folder shown and of its connection that last held its key,
which sends it as `studio.feedback-sender` says and keeps it for that folder and that connection
alone, never sending it through another that signs in later, and shall show "Feedback sent" with "Open task", or "Feedback saved",
in the window's toast region; a refusal goes back to the dialog. When a folder shows, when the window
regains focus and when a connection of the shown folder changes, while one holds its key, the app
shall send the waiting feedback kept for that folder and that connection and show "Feedback sent" for each. The app shall count
Studio as connected to Paperclip while a connection of the shown folder holds its key, and say when
that changes.

## Examples

- Given Acme shown with a signed-in Paperclip connection,
  when the person sends "Run list jumps",
  then it is sent once, and "Feedback sent" shows with "Open task".
- Given Studio offline,
  when the person sends feedback,
  then "Feedback saved" shows with "It sends by itself once Studio is back online."
- Given one feedback waiting and Paperclip answering again,
  when the window regains focus,
  then it is sent and "Feedback sent" shows.
- Given Acme's only connection signed out,
  when the shown folder's connections change,
  then Studio no longer counts as connected.
- Given a feedback kept for Acme's board connection and board signed out,
  when Acme's other connection signs in,
  then the feedback stays waiting and isn't sent through the other connection.
