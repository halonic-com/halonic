# plugin-build.tar-names

- Status: active
- Since: unreleased
- Source: HAL-17950 plan rev 1 (the plugin builder), with Liam's conditions on HAL-17985; HAL-17986

If a file name is empty, longer than 100 bytes, holds anything but visible ASCII, starts with `/`, holds `..` or comes twice, then the tar writer shall refuse it and write no archive.

## Examples

- Given the name `package/../../etc/passwd`, when an archive is written, then it is refused as a parent folder.
- Given the name `/etc/passwd`, when an archive is written, then it is refused as absolute.
- Given the name `package/é.js`, when an archive is written, then it is refused as not ASCII.
- Given a name of 101 characters, when an archive is written, then it is refused as too long.
