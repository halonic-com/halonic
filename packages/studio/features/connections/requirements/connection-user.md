# connections.connection-user

- Status: active
- Since: unreleased
- Source: HAL-18671, the board's decision on HAL-18359 (25 Nov): two accounts on one Paperclip must be told apart; requirement `agent-host.paperclip-signed-in-user`

When the engine knows whom a connection is signed in as, Settings › Connections shall show that user's name in the connection's row label, "Paperclip · Halonic · Board Supervisor", and the connection that Studio's services hand to features shall carry that name on its own.

## Examples

- Given two connections to one Paperclip, signed in as "Board Supervisor" and "Ada",
  when Settings › Connections opens,
  then the rows read "Paperclip · Halonic · Board Supervisor" and "Paperclip · Halonic · Ada".
