# Decision: Settings, Models and phone screens use the approved words from the UX check

- Task: HAL-11627
- Approval: the rows S1, S3, S4, S5 and P1 to P3 of the UX check on HAL-11613 say "Build" to the approved microcopy (13.1a, 19.4, 19.6, 1.2, 23.3, 23.3a) and flow-first-run 7.2; Liam reviews this change on HAL-11627. A team decision with no board card (HAL-2282 rule).
- Kind: user-visible

## What changes

- **Remove sandbox setup, done without a backup (S1):** the dialog ends on **Close** alone instead of
  **Done** and **Close**. The kit's Dialog gets `cancelButton: false` for a footer with only the
  confirming button, which then takes focus (`kit.dialog`).
- **Sandbox not available (S3, S4):** Settings shows the **Not available** chip, the reason and its
  fix from the sandbox-start catalogue, **Check again**, the guide's link and "You can run an agent
  on this computer after a warning." It no longer shows "The sandbox isn't ready: …", and it never
  shows the check's own sentence, also not for `other` (`settings.agent-sandbox-state`,
  `studio.agent-sandbox-host`). The host now hands the section the reason's code instead of a
  sentence. The catalogue gets two keys, the fix for Settings (none where the section's own set-up
  button is the fix, 23.3a) and the guide link's name, which 23.3 lists for every reason
  (`app.sandbox-start-words`).
- **Check on a local provider (S5):** the button reads **Check again** once there is a result, and
  the screen reader hears "Ollama isn't answering at …" (`models.providers.check`).
- **Phone request sheet (P1 to P3):** titled "New request", with the one workflow as a read-only
  line; Close is named "Close, keeps your message"; after Send, **Send** keeps saying "Working…" over
  the sent message until the card arrives and closes the sheet, and Close still works meanwhile
  (`inbox.request`). The kit's phone form sheet passes `closeLabel` to its Close and gets
  `closeWhileBusy` (`kit.dialog-form-sheet`).

## Tests

Two tests change because the behaviour they pinned is the one the UX check corrects:
"says what a check named when it gave only `other`" in `agent-sandbox-host.test.ts` now checks that
the check's sentence does **not** reach the section, and "sends from the sheet, keeps it open with
the message cleared" in `request-form.test.tsx` now checks that the sent message stays under
"Working…" with Close available. "says why the sandbox can't run when the check ran" in
`sandbox-state.test.ts` checks the new words. New tests cover the rest. No test was skipped or
weakened.

## Not changed

**P4** (the phone's **Start your own workspace** opens New workspace): the Try the sample card is
only in the desktop app (`SampleWorkspaceService` is provided only there), so its phone layout is a
desktop window made narrow, where New workspace does work. Served Studio on a phone shows no card.

## Covers

- kit.dialog
- kit.dialog-form-sheet
- app.sandbox-start-words
- studio.agent-sandbox-host
- settings.agent-sandbox-state
- settings.agent-sandbox-section
- settings.wsl-remove-dialog
- models.providers.check
- inbox.request
- apps/studio/src/studio/agent-sandbox-host.test.ts
- packages/studio/features/inbox/src/ui/request-form.test.tsx
- packages/studio/features/settings/src/agent-sandbox/sandbox-state.test.ts
