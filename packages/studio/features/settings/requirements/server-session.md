# settings.server-session

- Status: active
- Since: unreleased
- Source: HAL-17844 (plan on HAL-17834, section 3; approvals stream HAL-17488, PR 22c); shown since HAL-18256

The Settings feature shall have a host section "Your server" with the fields Server, User and Port, kept in the host settings as `server-session.host`, `server-session.user` and `server-session.port`, never in a workspace. Each field shall save its trimmed value when the person leaves it, and an emptied field shall remove its saved value, so the desktop shell finds no server. Port shall be empty or a whole number from 1 to 65535: "Enter a whole number from 1 to 65535, or leave it empty.", and nothing is saved while it shows that. The section shall show in Settings, no longer hidden with the unfinished sections, since the Inbox offers "Run with Claude".

## Examples

- Given an empty section,
  when the person types " build.acme.example " in Server and leaves it,
  then `server-session.host` is saved as "build.acme.example".
- Given a saved user "ops",
  when the person empties User and leaves it,
  then `server-session.user` is removed.
- Given an empty Port,
  when the person types "70000" and leaves it,
  then the field says "Enter a whole number from 1 to 65535, or leave it empty." and nothing is saved.
