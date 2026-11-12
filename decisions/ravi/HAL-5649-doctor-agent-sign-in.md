# Decision: `halonic doctor` shows each agent's own sign-in, and Claude Code's sign-in error points there

- Approval: the error wording was decided on HAL-5231, and the agent's settings folder on HAL-6169; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:jXVLljiOF+j8QDxyjbVnFItvWM47X8y5JzSLY1Hn1GpLx90ofHa2+n1JyRI5b8QgZrVzkwkoC39ISWt8wFQgCg==
- Task: HAL-5649

## What changes

- `harness-claude-code.sign-in-expired`: the error no longer says to sign in with
  `claude auth login`, which signs in to the person's own folder and leaves the agent's run
  signed out. It says to sign in for this agent, and that `halonic doctor` shows the command.
  The example's wording changes to match, and the test checks the new sentences.
- `cli.doctor-report` gains one example: an agent that isn't signed in in its own folder, with
  the sign-in command for that folder under it. The other examples stay as they were.
- The agent host's tests of `manualSignInCommand` move to `@halonicjs/ports` with the function,
  now `signInCommandText`, and check the same quoting plus a folder with `$` and `*` in it. The
  route's own test still checks the command it answers. No test was weakened.

`app.doctor-agent-sign-in` and `ports.harness-sign-in-command` are new requirements, so they
need no note.

## Why

An agent's runs use the sign-in in the agent's own settings folder (HAL-5355), never the
person's. The old error sent people to a sign-in that doesn't help the run, and nothing showed
them the one that does. Now that the folder has a place
(`WorkspaceFolders.harnessSettingsFolder`, HAL-6169), `halonic doctor` asks each agent's harness
about that folder and prints the sign-in for it, so the error can point there.

## Covers

- harness-claude-code.sign-in-expired
- cli.doctor-report
- apps/agent-host/src/harness/sign-in-route.test.ts
