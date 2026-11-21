# Decision: a plugin sign-in's wait gets Open again, and its "didn't finish" line says nothing was saved

- Approval: HAL-15405, the team's words check C571 (HAL-15387, rows 36 and 38), decided by the team under HAL-2282
- Kind: user-visible
- Task: HAL-15405, with HAL-15249 (Liam's review note on #4509)

## What changes

`plugins.plugin-sign-in-waiting` (`Since: unreleased`):

1. While the block waits for the browser it shows **Open again** before **Cancel**, as the Google setup's wait does (microcopy 10.4). **Open again** opens the page the sign-in already opened, without starting another sign-in, and the block keeps waiting. The page is kept only while the block waits and is never shown.
2. After the host's wait for the browser ends, the line is "The sign-in didn't finish. Nothing was saved." instead of "The sign-in didn't finish. Try again." The same line shows for an incomplete callback or a link that is no longer valid.
3. After a successful **Cancel** the block reads where the sign-in stands again, as **Sign out** does.

## Why

1. Someone who closed the browser tab, or whose browser didn't come to the front, could only press **Cancel** and start over. Starting another sign-in would make the first tab's answer fail, so **Open again** reopens the same page.
2. The block offers **Sign in**, not **Try again** (rule E2), and **Sign in** right under the line is the next step. The Google setup words the same moment with "Nothing was saved."
3. If the browser finished just before **Cancel** was pressed, the block showed **Sign in** until the window next got focus, although the person was signed in.

## Covers

- plugins.plugin-sign-in-waiting
