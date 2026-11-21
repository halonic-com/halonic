# agents.chat.not-trusted

- Status: draft
- Since: unreleased
- Source: HAL-13177; flow-agents 4.4; microcopy 8.3 and 14.1; states (HAL-5896) section 4, H16; workspace flow 3.1

When the person sends a Try it message while this computer doesn't trust the workspace, the chat shall send nothing, keep the message in the box, and open the workspace's trust gate where the app has one. When the person trusts the workspace there, the chat shall send the message. When they pick **Not now**, or the app has no gate to open, the chat shall show the toast "Not started: *Acme* isn't trusted yet", with the workspace's name, and the message shall stay in the box. When the engine itself refuses a message because the workspace isn't trusted (`denied`), the chat shall do the same: take the turn back with no failure line, put the message back in the box unless the person already wrote another, and open the gate or show the toast.

## Examples

- Given the workspace "Acme" isn't trusted and the app has no trust gate,
  when the person sends "Sort this mail",
  then nothing is sent, "Sort this mail" stays in the box and the toast reads "Not started: Acme isn't trusted yet".
- Given the workspace isn't trusted,
  when the person sends "Sort this mail" and trusts the workspace in the gate,
  then "Sort this mail" is sent once and the box is empty.
- Given the workspace isn't trusted,
  when the person sends "Sort this mail" and picks Not now in the gate,
  then nothing is sent and the toast shows.
- Given the engine refuses "Sort this mail" as `denied` and the app has no trust gate,
  when the answer comes back,
  then no reply or failure line shows, "Sort this mail" is back in the box and the toast reads "Not started: Acme isn't trusted yet".
- Given the engine refuses "Sort this mail" as `denied`,
  when the person trusts the workspace in the gate,
  then "Sort this mail" is sent again, once.
