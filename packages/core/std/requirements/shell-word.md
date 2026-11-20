# std.shell-word

- Status: active
- Since: unreleased
- Source: HAL-12725 (first-run check F7, L1); the CLI's `shellWord` (`apps/cli/src/output/shell-word.ts`)

The shell word helper shall return a text as one word a POSIX shell reads back unchanged: as it is when it holds only letters, digits, `_`, `.`, `/`, `:` and `-`, and otherwise in double quotes, with `"`, `$`, `` ` `` and `\` escaped by a backslash.

## Examples

- Given `/acme/Documents/Acme sample`, then the word is `"/acme/Documents/Acme sample"`.
- Given `acme$name`, then the word is `"acme\$name"`.
- Given `/acme/shared/acme`, then the word is `/acme/shared/acme`, with no quotes.
