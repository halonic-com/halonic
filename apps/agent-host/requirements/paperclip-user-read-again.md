# agent-host.paperclip-user-read-again

- Status: active
- Since: unreleased
- Source: HAL-18702, review findings on HAL-18671's pull request; requirement `agent-host.paperclip-signed-in-user`

When Paperclip answers the read of whom a connection's key belongs to with a server fault (a 5xx), the agent host shall keep no name for the connection, and each poll of the connection shall try the read again. When that read throws, during Connect or during a poll, the agent host shall report it and go on with the rest of the poll. A user name longer than 40 characters shall show in the connection's label cut to at most 40 characters, the last of them "…"; the row shall still carry the whole name on its own.

## Examples

- Given a Paperclip that answers the read with 503 when the key is handed over,
  when the next poll reads "Board Supervisor",
  then the connection's row reads "Paperclip · Halonic · Board Supervisor".
- Given a Paperclip that answers the read with a redirect, which the client never follows,
  when the connection is polled,
  then the failed read is reported and the poll still reads the connection's agents.
- Given a user named "Board Supervisor of the Acme Company the Acme Company …",
  when the key is handed over,
  then the label shows the name cut to 40 characters, ending in "…", and the row's user name is whole.
