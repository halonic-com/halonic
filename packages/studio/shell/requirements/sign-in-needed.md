# shell.sign-in-needed

- Status: active
- Since: unreleased
- Source: HAL-20516; board decision HAL-10 (27 Nov: the same sign-in prompt in every app); plan approved on HAL-20519

The shell shall let a feature add a sign-in the workspace can need only through the point `signIns.add`, giving its provider's name and logo, what it is for, the focused apps that can't work without it (`blockingFor`, each one of `focusedAppIds`), a `watch` that reports the sign-ins needed now, and a `start` that begins one. If two features add the same id, a sign-in has no provider, or `blockingFor` names an app Halonic doesn't start, the shell shall throw a `ShellError` that names the feature.

Every window, Studio's and each focused app's, shall show the needed sign-ins the same way, each with its provider's logo, its name and its own **Sign in** button:

- While a sign-in blocks the window's app, the window shall show it in a modal that Escape, a click outside and any close button don't close. Studio's own window is never blocked.
- While a sign-in is needed but doesn't block the window's app, the window shall show it in a band that has no dismiss button.
- When more than one sign-in is needed, the window shall show one modal that lists every blocking one and one band that lists the others, each ordered by provider, then by name. A modal and a band can show together; the modal is on top.

When the user presses **Sign in**, the window shall begin that sign-in and keep its row open, showing the waiting line and the sign-in's phrase. If the sign-in can't begin, expires or is refused, the row shall say it didn't finish and stay open.

When a sign-in ends in one window, every open window shall read its sign-ins again, so a row goes away in every app once its sign-in is done and a modal closes when its last row does. A window shall also read them again when it gets focus, at most once every 5 seconds, so a missed message can't leave a prompt on screen.

If a sign-in's state can't be read, the window shall log the error, show "Couldn't check your sign-ins." with **Try again**, which reads them all again, and not block the app for that sign-in.

## Examples

- Given a Paperclip sign-in that blocks Messenger and Inbox, and a signed-out connection "Acme team",
  when the Inbox window reads its sign-ins,
  then it shows one blocking row "Acme team" for Paperclip,
  and Studio's window shows the same row in the band instead.
- Given two signed-out connections "Zeta" and "Acme team", and a needed Google sign-in that blocks nothing,
  when the Messenger window reads its sign-ins,
  then the modal lists "Acme team" then "Zeta", and the band lists Google.
- Given the Inbox and Messenger windows both showing the Paperclip modal,
  when the user signs in from the Inbox,
  then the Messenger window reads its sign-ins again and its modal closes.
- Given a window that read its sign-ins 2 seconds ago,
  when it gets focus,
  then it doesn't read them again; 5 seconds after the last read, focus reads them again.
- Given a sign-in whose `watch` reports an error,
  then the window logs it, shows "Couldn't check your sign-ins." and doesn't block the app.
- Given a sign-in whose start fails,
  then its row says the sign-in didn't finish and stays open.
