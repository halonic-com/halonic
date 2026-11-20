# Decision: the served waiting list names the agents

- Approval: https://paperclip.halonic.com/HAL/issues/HAL-13830 (AG1, decided by the team; plan approved by Liam with conditions on HAL-13833)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:dXDl76lr9Jsfozsah2lXUCub0I4D6yOxsAijy3e838K33Y9ECehso0U/AB2Mfucsz+aXTdPr2V5ZXfYRiaD4Cg==

## What changes

- `server.waiting-runs`: the answer is `{ runs, agents }` instead of `{ runs }`. `agents` gives, by
  id, the names of the agents and subagents the listed approvals name, from a new optional
  `workspace.agentNames()` port. An id without a name is left out; when the names can't be read,
  `agents` is empty, the cause goes to the error log and the runs are still listed. The names aren't
  read when no listed approval names an agent. `runs` is unchanged, so an older page still works.
- `studio.served-inbox-runs`: the served Inbox names each agent and subagent as the last readable
  list's `agents` names it, and by its id otherwise. An `agents` value it can't read never fails the
  list.

## Why

The served Inbox said "writer wants to use read_note", where `halonic run` and the desktop say
"Writer wants to use read_note", because the page can't read the agent files and the server sent
only ids. Every old example of both requirements still holds; the only test changed adds
`agents: {}` to the two answers the server's existing waiting-list tests expect. No test was
weakened.

## Covers

- server.waiting-runs
- studio.served-inbox-runs
