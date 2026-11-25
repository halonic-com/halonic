# team.phone-screens

- Status: active
- Since: unreleased
- Source: HAL-17640 (phase 2 G4); the board's approval of the phase 2 card (HAL-17544, 24 Nov); Sofia's flows on HAL-17509 and HAL-17510; Noah's renders and `wording` table on HAL-17515 (S22–S28, P24–P27), checked by Nina on HAL-17547; Julian's security notes on HAL-17513 and HAL-17540.

On a phone, the Pull requests screen shall offer the chips Stuck, All open and Queue, each with its count, and list the stuck pull requests worst first with their state chips under Stuck. On a phone, the Spend and seats screen shall draw its tiles as stacked rows and show only the "Agents by spend ›" heading, with no list of agents, on its first screen. On a phone, titles and reasons shall show as plain text, and a web link shall open only when `isAllowedWebLink` passes it, with its full address shown first.

## Examples

- Given 3 stuck pull requests of 24 open and 7 in the merge queue,
  when the Pull requests screen opens on a phone,
  then its chips read "Stuck 3", "All open 24" and "Queue 7", and there is no Merged today chip.
- Given six agents that spent today,
  when Spend and seats opens on a phone,
  then it shows "Agents by spend ›" and none of the agents until that heading is pressed.
- Given a pull request titled `[x](javascript:alert(1))`,
  when the Pull requests screen opens on a phone,
  then the title shows as typed, with no link and no extra button.
- Given a link off the connection's Paperclip origin,
  when its row shows on a phone,
  then there is no button to open it, and nothing opens.
