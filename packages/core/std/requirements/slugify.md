# std.slugify

- Status: active
- Since: 0.1.0
- Source: `slugify` in the old Studio (`packages/core/app/src/studio.ts`) at 784f78d

When a display name is turned into an id, the slug function shall lowercase it, drop accents and every character other than ASCII letters, digits, underscores, spaces and hyphens, and join the words with single hyphens, treating runs of spaces and underscores as word breaks, leaving no hyphen at either end, and giving "item" when nothing is left.

## Examples

- Given "Weekly Report", when it is slugified, then the id is "weekly-report".
- Given "Café crème!", when it is slugified, then the id is "cafe-creme".
- Given "snake_case name", when it is slugified, then the id is "snake-case-name".
- Given "_a_", when it is slugified, then the id is "a".
- Given "___", when it is slugified, then the id is "item".
- Given "-draft-", when it is slugified, then the id is "draft", so an id never starts with a hyphen that a command line could read as a flag.
- Given "!!! - !!!", when it is slugified, then the id is "item".
- Given "!!!", when it is slugified, then the id is "item".

## Difference from the old Studio

The old Studio kept hyphens at either end (`"_a_"` gave `"-a-"`, `"___"` gave `"-"`). This is an allowed difference: an id that starts with `-` can be read as a command-line flag.
