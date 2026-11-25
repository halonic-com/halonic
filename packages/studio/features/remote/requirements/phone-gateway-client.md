# remote.phone-gateway-client

- Status: draft
- Since: unreleased
- Source: HAL-15179 (tunnel D7, design on HAL-15159, sections 2 and 3, and section 5 items 7 and 10). Version 3 fallback: HAL-17639 (phase 2 G3, architecture note on HAL-17511, section 2.2)

The phone shall send `hello` once on every session the shell opens, and `list-sessions` after a `welcome`, then every 15 seconds while it is connected and the app is in front, with at most one list waiting for its answer. It shall watch the listed sessions that are running or waiting, in the host's order and at most 16, resume each watch after the last `seq` it holds, and unwatch a session that ends or leaves the list, before it watches another. After `history-gone`, or a gap in `seq`, it shall drop what it holds of that session and watch it from 0. It shall end the session, and leave the reconnect to the shell, on any host message it refuses, on a `welcome` of another version, and on an answer to a message it didn't send or doesn't wait for; it shall ignore messages of an earlier session. It shall take a session list the host pushes without `replyTo` only after `welcome`, end the session on one before it, and replace its whole list with each list it takes. It shall show the last list's `answersRisky` in its view only as a hint, `false` until a list says otherwise. When the host closes on a version 4 `hello` with `unsupported-version`, it shall say `hello` with version 3 on the next session the shell opens, and only on that one; after a version 3 `welcome` its view shall say the computer is older, so the phone offers Agents only with "Update Halonic on Alex's laptop to use Inbox and Messenger from your phone.", until a version 4 `welcome` or the computer is removed. When a `welcome` is of another version than its `hello`, or the host closes with `unsupported-version` on a version 3 `hello`, it shall say in the view that an update is needed ("Update Halonic on this phone and your computer to answer from here.") where it would otherwise say it is reconnecting, until a `welcome` of its own version. When the computer is removed, it shall forget the computer's sessions at once. It shall keep all of this in memory only.

## Examples

- Given a new session,
  when it opens,
  then the phone sends `hello`, and `list-sessions` after the host's `welcome`.
- Given 20 listed sessions, one done and the rest running,
  when the phone has the list,
  then it watches the first 16 running ones.
- Given events 1 and 2 held and a reconnect,
  when the new list arrives,
  then the phone watches the session again after `seq` 2.
- Given a host that keeps sending a type the protocol doesn't list,
  when the phone reads the first one,
  then it ends the session once and says `hello` again only on the next session the shell opens.
- Given a list, then pushes saying `answersRisky` false, true, then false,
  when the phone takes them,
  then its view says `false`.
- Given a session that hasn't been welcomed,
  when the host pushes a list,
  then the phone ends the session.
- Given a host of message version 2,
  when it welcomes the phone, or closes with `unsupported-version` on both version 4 and version 3,
  then the view says to update Halonic, not to wait for a reconnect.
- Given a computer on an older Halonic that speaks message version 3,
  when it closes on the phone's version 4 `hello`,
  then the phone says `hello` with version 3 on the next session and shows Agents only, under "Update Halonic on Alex's laptop to use Inbox and Messenger from your phone.".
- Given the phone fell back to version 3,
  when the next session opens,
  then the phone tries version 4 first again.
