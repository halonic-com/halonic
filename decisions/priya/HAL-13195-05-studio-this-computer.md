# Decision: Studio runs an agent set to "On this computer" through the agent host

- Approval: /HAL/issues/HAL-13195 (the plan Liam OK'd on HAL-16261: parts 1 to 4 merged as #5148, #5154, #5155 and #5318; this is part 5)
- Kind: user-visible
- Task: HAL-13195

## What changes

Until now Studio's engine had a `this-computer` sandbox that always refused, so every Studio run of an agent set to "On this computer" stopped with `not-offered`. Now the engine uses the agent host's session on this computer (`POST /v1/sandbox/this-computer/open`, from #5318), which opens only once the host's own gate passes. Where the host offers none (on Windows, or without a profile folder), the run is refused with `not-offered` as before.

Two active requirements said Studio can't run such an agent yet, and change to say what happens now:

- `studio.harness-provider-key`: the sentence "Studio can't run an agent on this computer yet: its sandbox (`noUnfencedSandbox`) stops the run before the bridge opens, so no key reaches a program outside the sandbox." now says that Studio runs such an agent in the host's session and serves its bridge as the requirement already says, so the only key that reaches a program outside the sandbox is an alias's, as in the CLI (`harness-host.provider-access`); where the host offers no session, the run stops before the bridge opens.
- `studio.agent-sandbox-host`: one example is added, for a host that opens sessions on this computer. The requirement's own sentence doesn't change.

The draft `studio.engine-service` changes the same way, with its example split into a host that offers no session and one that does.

## Why

This is the goal of HAL-13195: the person's "On this computer" choice works in Studio as it does in `halonic run` and `halonic serve`, and the hint under **On this computer** goes away where Studio can start it. The security checks are in the host (parts 1 to 4, reviewed by Julian and Liam); the page only names the agent and the profile, and the host decides.

## What doesn't change

- The `not-offered` code, its words and its run page banner, for a host that can't open such a session.
- Which key reaches an agent on this computer: the CLI's rule (`harness-host.provider-access`) already applied to Studio's bridges.
- No test is removed or weakened. The test that a Studio run of such an agent is refused now runs against a host that offers no session; a new test covers one that does.

## Covers

- studio.harness-provider-key
- studio.agent-sandbox-host
