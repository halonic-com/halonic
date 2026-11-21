# Decision: Welcome's start and Check this computer match the approved plan

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-14950
- Kind: user-visible

## What changes

The UX check C513 (HAL-14943) compared #4253 (HAL-13412) with first-run-progress, approved by the board on 19 Nov (HAL-7993), and found seven places where the build didn't match it (M9 to M15). This makes the build match. No new words: every sentence is the plan's own (section 9).

- **M9:** when Check this computer closes after the link that opened it went (Something wrong? goes once the start is ready), focus goes to Open demo, else Open folder, never to the page's body (section 5).
- **M10:** the dialog opens with focus on its title (section 5). The kit's `Dialog` gains `focusTitle` for a Dialog that shows something to read first; `kit.dialog` says so and gains one example.
- **M11:** the waiting line keeps room for both its sentences and **Something wrong?** at any width, so nothing moves at 30 s. At 390 px the 30 s sentence takes three lines, and Something wrong? and the line under the buttons moved down 20 px. The kit's `WaitingLine` gains `keepRoomFor`, which draws what a wait will show, unseen and hidden from screen readers, in the same grid cell; `kit.waiting-line` says so and gains one example. This replaces Welcome's fixed `min-h-21`.
- **M12:** the two "Not checked" lines get keys of their own, so React no longer warns about a duplicate key.
- **M13:** the heading reads "No problems found", or "1 warning" with only a warning, and with no problem the all-clear sentence follows the lines (4.2, 9).
- **M14:** the report fold reads **Show the report** or **Hide the report**, and the report note follows the report (9). The kit's `Disclosure` gains `openSummary`; `kit.disclosure` says so and gains one example.
- **M15:** a problem line is marked with the kit's cross (✕), the report's own glyph (4.2, 4.3).

Liam's two non-blocking notes on #4253 (N5): one failed `start_status` call no longer ends the watch; it ends after two in a row (`studio.start-watch`, one example changed and one added). A press held while the start waits now ends without running when Welcome goes away, rather than leaving its promise open (`shell.welcome-start`).

`shell.welcome-lite-check` says the new heading words, the all-clear sentence, the fold's two names, the report note, the focus on open and close, and the marks, and gains three examples. `shell.welcome-start` says the room is kept at any width and that a held press ends when Welcome goes away. Two tests were renamed and rewritten for what changed: "keeps room for the 10 s sentence…" now checks the kept room for both sentences, and "reads as ready when the window can't say…" now asks twice. No example is removed and no test is dropped or skipped.

## Why

The plan is the board's approved design for this screen, and C513 found the build drifted from it in these seven small places; the team decided under HAL-2282 that making a build match approved words and behaviour needs no new card. The kit options are the smallest general way to do it: a title that takes focus is what the kit's side panel and sheet already do, a fold whose words follow its state is the plan's own button pair, and a line that keeps room for what it will show is the plan's rule for every waiting line whose later stages are known.

## Covers

- kit.dialog
- kit.disclosure
- kit.waiting-line
- shell.welcome-lite-check
- shell.welcome-start
- studio.start-watch
- apps/studio/src/studio/start-watch.test.ts
- packages/studio/shell/src/welcome/welcome-start.test.tsx
