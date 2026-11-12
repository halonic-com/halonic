# Decision: the runner's process entry may load the integration with `import()`

- Approval: an entry in `tooling/check/process-starters.json` needs Liam's review (docs/guides/checks.md, process-starts); Liam approves this note in review of the runner start PR on HAL-983
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:95qFc+1iKK3UUES6dAisZqsA/eFwu1SELSNQtguj6uHbxJEGiKP8fapAGRZaeiPf2WqNbDLIC50kK00ygMFVCw==
- Task: HAL-983

## What changes

`tooling/check/process-starters.json` gains one entry:
`packages/adapters/integration-runner/src/runner/main.ts`, with
`packages/adapters/integration-runner/src/runner/skill-scripts.test.ts` as its scripts test.
The other entries are unchanged; the file is now sorted by path.

## Why

The runner process has to load the integration it holds, and the integration's entry file is
only known at run time, so `main.ts` uses `import()` with a computed name. The process-starts
guard counts that as a possible process start. It isn't one here:

- the only module it loads is the entry file named on its command line, and `startRunner`
  refuses an entry file outside the integration's folder before it opens a session;
- loading a module starts no process: the scripts test points the runner at a skill's shell
  script, and the load fails without running it;
- the runner's Node runs with `--permission` and without `--allow-child-process`,
  `--allow-worker`, `--allow-addons` or `--allow-wasi`, inside its own `Sandbox` session, so
  neither the runner nor the integration can start a process. The scripts test checks the
  command for those flags.

## Covers

- tooling/check/
