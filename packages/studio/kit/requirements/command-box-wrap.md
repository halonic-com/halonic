# kit.command-box-wrap

- Status: active
- Since: unreleased
- Source: HAL-14585; Noah's C426 check (HAL-14577), FIX 1

When the kit's `CommandBox` would get narrower than 160px beside its "Copy command" button, the button shall wrap under it and the box shall take the whole line, rather than shrinking to a few letters a line.

## Examples

- Given the CommandBox in the Harness strip on a 195px wide phone,
  when the command and the button don't both fit on one line,
  then the command takes the strip's whole width and "Copy command" sits under it.
- Given the same CommandBox 320px wide or wider,
  then the command and "Copy command" stay on one line.
