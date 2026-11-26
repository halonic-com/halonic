# paperclip.manifest-julian

- Status: active
- Since: unreleased
- Source: HAL-19440; fix 2 of HAL-19435 (Chief's decision, 26 Nov): the plugin deployer ships a pull request that changes a plugin manifest only with Julian's approval on its final head

When a pull request changes a file that builds a plugin manifest (`manifestFileOf`: a non-test `.ts` file in `tooling/paperclip/src/plugin/` or `tooling/paperclip/src/seats/plugin/` whose name contains `manifest`, `declaration` or `settings`, or one of `manifestImports`, the same list as the plugin deployer's `touchesManifest`), the reviewer path rules shall never route it to the routine reviewer alone, `pr_status` shall report it approved on its head only when Julian's signed approval also names that head, and the Merger's gate shall not queue it until Julian's signed approval holds on the head after the last push (or carried over a rebase with an identical diff), whoever else approved it and at any size or path. On Julian's own branch the gate shall say it needs the board instead.

## Examples

- Given a pull request that changes `tooling/paperclip/src/plugin/queue-settings.ts`, `tooling/paperclip/src/seats/plugin/manifest.ts` or `tooling/paperclip/src/plugin/version.ts`,
  when `manifestFileOf` reads its files,
  then it names that file; for `tooling/paperclip/src/plugin/queue-settings.test.ts` or `tooling/paperclip/src/plugin/worker.ts` it names none.
- Given a small pull request that changes only `tooling/paperclip/src/plugin/front-bot-notes.ts`,
  when `reviewerRoleFor` routes it,
  then it says `second-reviewer`, not `routine-reviewer`.
- Given Liam's approval on the head of a pull request that changes `tooling/paperclip/src/plugin/manifest.ts`,
  when a pass runs,
  then it isn't enqueued and the gate says it needs Julian's approval on the head too; with Julian's approval on the head as well, it is enqueued.
- Given the same pull request on a `julian/` branch with Liam's approval,
  when a pass runs,
  then it isn't enqueued and the gate says it is for the board.
- Given Liam's approval on the head of such a pull request,
  when `pr_status` reads it,
  then `approvedOnHead` is false and the next step asks for Julian's approval too; with Julian's approval on the head as well, it is true.
