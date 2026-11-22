# Decision: after a refused Trust, focus goes to Not now; Check says it waits for trust

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-16476 (from visual check C711 on HAL-16447, rows 7 and 8; Liam reviews the trust changes)
- Kind: user-visible

**The trust dialog.** Since #5223, **Trust** pressed after the workspace changed under the open
dialog saves nothing and says "Couldn't save trust: this workspace changed. Nothing was started."
But focus stayed on **Trust** and the notice "This workspace changed while you were reviewing it.
Check the new version." went away, so Enter pressed twice (or a double click) trusted the new check
a moment later, unread. Now that refusal keeps the notice and moves focus to **Not now**, as when the
dialog opens. The requirement `workspace.trust-badge` says so. The test "saves nothing for a check
that changed after it was shown, and saves the new one next" asserted that the notice was gone after
the refusal; it now asserts that the notice stays, which is the new behaviour. A new test presses
Enter twice and checks that nothing is saved. Both new tests fail on the old code. To stay under
the file-size limit, the four tests about a workspace that changes under the open dialog moved
unchanged (apart from the assertion above) from `workspace-trust-badge.test.tsx` to
`trust-check-changed.test.tsx`, and the helpers both files use moved to
`trust-badge.test-helper.tsx`. No test was weakened or removed.

**Check on a provider's page.** Until the workspace is trusted, a provider whose address isn't on
this computer showed no Check and nothing in its place. It now shows the muted small line "You can
check this address once you trust this workspace.", and Check as soon as the workspace is trusted,
without reopening the page. The draft requirement `models.providers.check` says so; new tests cover
both.

## Covers

- workspace.trust-badge
- models.providers.check
- packages/studio/features/workspace/src/trust/workspace-trust-badge.test.tsx
- packages/studio/features/workspace/src/trust/trust-check-changed.test.tsx
