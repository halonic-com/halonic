# shell.home-signal-tone

- Status: active
- Since: unreleased
- Source: the Messenger change approved on HAL-19141, point 8 (a quiet Needs you with a violet count); Sofia's Studio and Messenger alignment proposal on HAL-19755 (26 Nov), point 8; built on HAL-19765

Where a Home card asks for the `warning` tone, Home shall draw the count after that card's heading in the `warning` (Needs you violet) colour, leaving the heading's name in its own colour. Without a tone, the count shall stay in the heading's colour.

## Examples

- Given the Needs you card with the `warning` tone and 2 items waiting,
  when Home draws,
  then "2 waiting" after "Needs you" is violet and "Needs you" stays muted.
- Given the Recent runs card with no tone and 1 running,
  when Home draws,
  then "1 running" is in the heading's muted colour.
