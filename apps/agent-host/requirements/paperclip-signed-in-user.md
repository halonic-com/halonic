# agent-host.paperclip-signed-in-user

- Status: active
- Since: unreleased
- Source: HAL-18671, the board's decision on HAL-18359 (25 Nov): two accounts on one Paperclip, switched one at a time, both read "Paperclip · Halonic" and can't be told apart.

When the agent host starts the provider of a connection whose key it was handed, it shall read once from Paperclip, with that key, whom the key belongs to (`GET /api/cli-auth/me`), keep only the user's name, never their email, and add it to the connection's source label and to its row in the connection list, which shall also carry the name on its own: "Paperclip · Halonic · Board Supervisor". While that read fails because Paperclip can't be reached or refuses the key, each poll of the connection shall try it again; after a read worked, no poll shall read it again.

## Examples

- Given a connection "Paperclip · Halonic" whose key belongs to "Board Supervisor",
  when its key is handed over,
  then its source and its row read "Paperclip · Halonic · Board Supervisor", and its row carries "Board Supervisor".
- Given a Paperclip that can't be reached when the key is handed over,
  when the next poll reaches it,
  then the poll reads the user, and the poll after it doesn't.
- Given a Paperclip that answers a user with no name,
  when the key is handed over,
  then the label stays "Paperclip · Halonic" and no poll reads the user again.
