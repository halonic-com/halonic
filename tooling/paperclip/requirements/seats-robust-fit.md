# paperclip.seats-robust-fit

- Status: active
- Since: unreleased
- Source: HAL-16026; the seat usage forecast on HAL-15997 (document `seat-forecast`, section 4.2), part of the `seats` plugin (HAL-16008)

When the seats forecast fits how many points of a seat's limit each type of token costs, it shall fit through the origin with every coefficient at 0 or more, weigh down steps far off the fit (Huber weights) so a few odd steps can't pull it far, hold a token type with no data at 0, and report the middle absolute error and the share of the spread the fit explains.

## Examples

- Given steps whose points are exactly 0.5 per million input, 0.05 per million cached and 4 per million output tokens,
  when they are fitted,
  then the fit gives those three rates and a middle error of 0.
- Given the same steps with every tenth one 40 points too high,
  when they are fitted,
  then the output rate stays within 10% of 4.
- Given steps where cached tokens seem to lower the points,
  when they are fitted,
  then the cached rate is 0, not negative.
- Given steps with no cached tokens,
  when they are fitted,
  then the cached rate is 0 and the others are still fitted.
