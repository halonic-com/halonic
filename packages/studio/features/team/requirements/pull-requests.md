# team.pull-requests

- Status: active
- Since: unreleased
- Source: HAL-17744 (split from HAL-17630); the board's approval of the phase 2 card (HAL-17544, 24 Nov); Sofia's flows on HAL-17510 (section 2, the PR state table, 2.1 and 2.5); Noah's `wording` table on HAL-17515 (flow 2), checked by Nina on HAL-17547; Liam's architecture note on HAL-17511 (1.4, 1.5); Julian's security notes on HAL-17513 (T4) and HAL-17540.

The Pull requests screen shall show the stuck pull requests worst first under Needs attention and every open one by state under All open, each state with its symbol and its word in the words of the HAL-17515 table. It shall render titles and reasons as plain text, shall say why when it has no rows instead of showing an empty list, and shall open only a link that `isAllowedWebLink` passes, showing its full address first.

## Examples

- Given a pull request failing on typecheck for 2 hours,
  when the screen opens,
  then Needs attention shows "✕ Failing: typecheck · 2 h" under "Stuck · worst first".
- Given a source that serves pull requests but has sent no snapshot,
  when the screen opens,
  then it says "PR states aren't available yet." and shows no rows.
- Given a pull request titled `[x](javascript:alert(1))`,
  when the screen opens,
  then the title shows as typed, with no link and no extra button.
- Given a link that isn't a GitHub pull request page or on the connection's Paperclip origin,
  when its row shows,
  then there is no button to open it, and nothing opens.
