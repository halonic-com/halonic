# profile.tool-approval-folder

- Status: active
- Since: 0.1.0
- Source: HAL-2827 (listed tool approvals live in the profile, never in a workspace)

The profile package shall name one folder for the approvals of listed tools, `tool-approvals` in the profile folder, joined with the profile's own separator, so that the CLI and the Studio read and remove the same approvals.

## Examples

- Given the Linux profile folder `/srv/acme/.local/share/halonic`, when the tool approval folder is found, then it is `/srv/acme/.local/share/halonic/tool-approvals`.
- Given a Windows profile folder `Users\acme\halonic` on drive `<drive>`, when the tool approval folder is found, then it is `tool-approvals` in that folder, joined with `\`.
