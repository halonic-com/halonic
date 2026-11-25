# Decision: the session settings writer refuses symlinked folders, and the Worker has five Durable Object classes

- Approval: Paperclip task HAL-18273 (review follow-ups of #5990 on HAL-18242); the approver signs this note in review
- Kind: internal

`harness-kit.session-settings-folder` gains a rule. Its path guard checked only the text of a path, so a symlink the program makes in the temp folder could send a write or an `rm -rf` somewhere else in the container. Each script now first walks the path's folders below the settings or temp folder and refuses the path when one is a symlink. The rationale says what the check covers and what it leaves out: a link swapped in between the check and the operation, which needs the program's own rights in a container that belongs to its run alone. The new test that makes a symlink runs only where the platform isn't `win32`, like the writer's other shell tests (decision HAL-18179).

`publish.worker-bundle` said the script exports three Durable Object classes and `publish.worker-files` said the manifest holds four. The runtime's `wrangler.toml` binds five since the run container object landed, so both now say five. The tests already read the classes from `wrangler.toml`; no test changes.

The revoke test in `run-container-logic.test.ts` now asserts that the object's own run is revoked, not only that the other run isn't: a stronger assertion.

## Covers

- harness-kit.session-settings-folder
- publish.worker-bundle
- publish.worker-files
- packages/adapters/harness-kit/src/session-settings-folder.test.ts
- packages/adapters/cloudflare-durable/src/run-container-logic.test.ts
