# profile.placement-folder

- Status: active
- Since: unreleased
- Source: HAL-10849 (Studio runs harness agents, HAL-11378); the CLI and the agent host keep one folder of choices

The profile package shall name one folder for each agent's "this computer" choice, `placements` in the profile folder, joined with the profile's own separator, so that the CLI and the agent host read and remove the same choices, and never inside a workspace.

## Examples

- Given the Linux profile folder `/srv/acme/.local/share/halonic`, when the placement folder is found, then it is `/srv/acme/.local/share/halonic/placements`.
- Given a Windows profile folder `Users\acme\halonic` on drive `<drive>`, when the placement folder is found, then it is `placements` in that folder, joined with `\`.
