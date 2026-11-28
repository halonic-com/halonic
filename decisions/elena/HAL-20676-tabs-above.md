# Decision: the window tabs sit above the content pane, not in the title bar

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-20676 (P3 of the HAL-20617 build plan, approved by Liam on the task: "the workspace tabs sit above the content pane"). Liam approves the change in review on HAL-20676.
- Kind: user-visible

## What changes

`shell.frame`: the framed panel's first row is the window tabs, then the page (`main`), over the status bar. The tabs sit above the content pane, not in the title bar. They still start at the framed panel's start edge, so the active tab joins it: the row sits over the panel's 1px start border, which the browser test `e2e/rail-frame.spec.ts` checks at 1280px.

`shell.title-bar`: the title bar shows the mark, "Halonic Studio", Back and Forward, and the panel button and the features' items at its right end. It no longer shows the window tabs, which `shell.frame` places above the content pane.

`shell.studio-window`: the window puts the tabs above the content pane rather than in the title bar.

Tests changed to follow:
- `title-bar-start.test.tsx` is removed. Its two tests checked that the title bar's start reached past the sidebar's width, so the tabs after it lined up with the framed panel, and that it stopped doing so in a narrow window. With the tabs inside the panel, the title bar has nothing to line up, and `TitleBarStart` no longer takes the sidebar's width.
- `studio-window.test.tsx`'s window test also checks that the tabs are in the framed panel and not in the title bar.

New tests (`frame-tabs.test.tsx`): the frame puts the tabs at the top of the framed panel, before `main` and outside the title bar, and shows no tabs on a phone. No other test was skipped or weakened.

## Why

The build plan's P3 puts the workspace tabs above the content pane, beside the rail and the list column, as in the board's mockups for HAL-20617.

## Covers

- shell.frame
- shell.title-bar
- shell.studio-window
- packages/studio/shell/src/window/title-bar-start.test.tsx
