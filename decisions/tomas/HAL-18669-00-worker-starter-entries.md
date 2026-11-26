# Decision: list the ToolScript worker files in the process-starts guard

- Task: HAL-18669 (`halonic serve` runs rule steps on the QuickJS isolate)
- Approval: plan rev 1 on HAL-18669, approved by Liam on 26 Nov ("Plan rev 1 approved", including the `tooling/check` process-starts entry); ToolScript ADR 2.2 and 2.3; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:YrCuV3JYX8N2wwSeHfU0IsBFEA5dL0CZhAkLhm9bWOXd6uFahEmkmZCzSV8+Zl0OA3DTnOGza/E+aV9lkElUBg==

## What changes

`tooling/check/process-starters.json` gets two entries for the new
`@halonicjs/adapter-toolscript-quickjs-node` package in halonic#6487:

- `src/worker-run.ts` starts one `worker_threads` worker per ToolScript run, always the fixed file
  `worker-entry.ts` next to it, with an empty `env`, no `argv`, `execArgv` or `workerData` and a
  capped heap, and terminates it when the run ends or overruns (ADR ToolScript 2.2 and 2.3).
- `src/worker-entry.ts` is that worker. It imports `node:worker_threads` only for `parentPort`, and
  starts no worker, process or module itself.

They are the same entries as in halonic#6487, split out so they are reviewed and merged first:
CI checks a pull request against the base's list (`docs/guides/checks.md`).

Neither file starts a path a workspace or a script names, so neither can reach a file under a
skill's `scripts/` folder.

No requirement, test or golden file changes. The guard warns that the files don't exist yet.
That is expected until halonic#6487 merges.

## Tests

`packages/adapters/toolscript-quickjs-node/src/worker-isolate.starts.test.ts`, in halonic#6487,
checks that the only worker file is `worker-entry.ts` in that package, never a `scripts/` path,
and that the worker imports nothing that could start a process or load a module by name.
`src/worker-isolate.test.ts` there checks that the worker sees an empty `env`, `argv` and
`execArgv`.

## Covers

- tooling/check/
