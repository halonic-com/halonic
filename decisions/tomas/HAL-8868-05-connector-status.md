# Decision: two start-up tests of the desktop app count one expect fewer

- Approval: Paperclip task HAL-9028 (HAL-8868 step 5)
- Kind: internal

The desktop app now registers the Library feature (`studio.workspace-connector-status`). The tests
of `studio.open-folder` (29 expect calls, 30 on the merge base) and `studio.settings` (12, 13)
count one expect call fewer. I changed no existing test: no assertion, example or test is removed
or weakened. The tests wait for the window to draw with `vi.waitFor`, which repeats its `expect`
until it passes, and the guard counts every repeat. The Library adds a feature to register at
start-up, so the window is ready one repeat sooner. The same tests make the same checks.

## Covers

- studio.open-folder
- studio.settings
