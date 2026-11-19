# plugins.plugin-list-no-installer

- Status: active
- Since: unreleased
- Source: HAL-1740; flow check HAL-11490; design check HAL-11503; UX check L12 (HAL-12363)

When the app can't add a plugin itself, the Studio shall leave out **Add plugin** (also in the empty state) and shall end the list with the line "Studio can't add a plugin yet. To add one, run this in a terminal:" and the command `halonic plugin add <folder or git address>` to copy, so that the empty state never points at a button that isn't there.

## Examples

- Given no installed plugin and a host without an installer, then the list says "No plugins yet", has no **Add plugin**, and ends with the line and the command.
- Given a host with an installer, then the list has **Add plugin** and no command line.
