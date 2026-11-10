# std.version

- Status: active
- Since: 0.1.0
- Source: HAL-2608; Codex versions in the fact check on HAL-2387 (row 3)

The version reader shall read a version written as three numbers without leading zeros, such as "0.167.0", optionally followed by a pre-release part, such as "-alpha.6", and a build part, such as "+linux". Text in any other form shall give no version. When two versions are compared, the comparison shall follow semver's order: the three numbers in turn, then a version with a pre-release part comes before the same version without one, and pre-release parts are compared piece by piece, numbers by value and below words, words in ASCII order, and a shorter list first when the pieces so far are equal. The build part shall not count.

## Examples

- Given "0.169.0-alpha.6",
  when it is read,
  then the version is 0.169.0 with the pre-release pieces "alpha" and 6, and writing it back gives "0.169.0-alpha.6".
- Given "v2.1.321", "2.1", "01.2.3" or "2.1.321 (Claude Code)",
  when it is read,
  then there is no version.
- Given 0.167.0-alpha.6 and 0.167.0,
  when they are compared,
  then 0.167.0-alpha.6 comes first.
- Given 0.167.0-alpha.10 and 0.167.0-alpha.9,
  when they are compared,
  then 0.167.0-alpha.9 comes first, because 9 is a smaller number than 10.
- Given 1.0.0+linux and 1.0.0+darwin,
  when they are compared,
  then they are equal.
