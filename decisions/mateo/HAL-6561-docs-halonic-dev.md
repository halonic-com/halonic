# Decision: the CLI's docs links use docs.halonic.dev for 0.1.0

- Approval: Chief decided this on [HAL-6561](/HAL/issues/HAL-6561) (Sofia's first-run walk on HAL-6538, flow item B), a team decision with no board card (HAL-2282 rule); the package owner (Liam) approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:ZvkQpbdbUfDc/iSoR+2C0gI0UbBMPjcvKk50JkVTZFsRiDBhD+T4JXE5rq4OOfuKpz5+FAtOqdPI7JS80Up5CQ==
- Task: HAL-6561

## What changes

Every docs link the CLI prints now starts with `https://docs.halonic.dev` instead of
`https://docs.halonic.com`, from one constant, `docsBase` in `apps/cli/src/messages/docs.ts`:

- the sandbox `More:` lines in `doctor`, `run` and `runs send`, for example
  "More: https://docs.halonic.dev/sandbox#bubblewrap (bubblewrap-missing)";
- `cli.commands.init.create-workspace`: a new workspace's next steps end with "Add your first
  agent: https://docs.halonic.dev/examples/agent-with-a-tool" (golden `init/golden/created.txt`).

Paths and anchors stay the same. Each line keeps its shape and exit code.

## Why

docs.halonic.com has no DNS record today, so a new user's first sandbox error ended in a link that
doesn't open. On docs.halonic.dev, `/sandbox` redirects to `/security/sandbox`, which has the
`#bubblewrap`, `#container` and `#apparmor` sections, and `/examples/agent-with-a-tool` answers.
Putting docs.halonic.com live is a halonic.com deploy that no approved card covers yet. When a
release card does, switching back is the one constant.

## Covers

- cli.commands.init.create-workspace
- apps/cli/src/commands/init/golden/created.txt
