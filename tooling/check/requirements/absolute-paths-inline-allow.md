# check.absolute-paths-inline-allow

- Status: active
- Since: unreleased
- Source: HAL-14831

When a line holds an absolute local path and also the leak guard's inline marker (`leak-guard: allow absolute-path <reason>`), the `absolute-paths` rule shall pass that line, and it shall still fail every other line of the file that holds such a path without the marker.

## Examples

- Given a shell script line with a Linux home folder path and the marker, then `absolute-paths` reports nothing for it.
- Given the same file with a second such line without the marker, then `absolute-paths` fails on the second line.
