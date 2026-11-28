# kit.sign-in-prompt

- Status: active
- Since: unreleased
- Source: HAL-20516; board decision HAL-10 (27 Nov); the strings for the copy check on HAL-20520

The kit shall draw a needed sign-in the same way in every app, each row with the provider's logo (named by the provider) and a **Sign in** button:

- `SignInModal` draws the sign-ins an app can't work without in a `BlockingDialog`. With one sign-in its title is "Sign in to {provider}" and its line "{app} needs your {provider} sign-in to work."; with more it is "Sign in to keep working" and "{app} needs these sign-ins to work.", and each row names its account or connection. Focus starts on the first **Sign in**.
- `SignInBand` draws the others in a band with no dismiss button, one row each: "Sign in to {provider} to use {purpose}." When a sign-in's state couldn't be read, it says "Couldn't check your sign-ins." with **Try again**. With nothing to say it draws nothing.

While a sign-in waits, its row shall say "Approve the sign-in in your browser. Check that it shows: {phrase}" (without the second sentence when there is no phrase) and its button shall be busy. When it didn't finish, the row shall say "That sign-in didn't finish. Try again." as an alert.

## Examples

- Given one Paperclip sign-in for the Inbox,
  then the modal is titled "Sign in to Paperclip" and says "Inbox needs your Paperclip sign-in to work."
- Given two Paperclip connections, "Acme team" and "Zeta",
  then the modal is titled "Sign in to keep working" and lists both, each with its own **Sign in**.
- Given a Google sign-in for Gmail that doesn't block,
  then the band says "Sign in to Google to use Gmail." with **Sign in**, and no dismiss button.
