# studio.untrusted-starts-nothing

- Status: active
- Since: unreleased
- Source: HAL-12409 (from Kim's walk-through, HAL-12407); the CLI's rule, Liam on HAL-1984 and HAL-12011; HAL-12799 (Julian's review of the HAL-12409 change); HAL-12811 (Julian's review of the HAL-12799 change, HAL-12810)

When the Studio's engine is about to start anything (a workflow's run, a routine's Run now, a request from the Inbox, Run again), it shall check the workspace it loaded, the content the run starts from, by the rule the CLI starts runs by: something may start only when a person trusted exactly this content on this computer, or when the workspace reaches only the built-in test model (every provider is `type: mock`, and there is no connector, no agent program and no local integration). It shall check when the engine opens, before the scheduler starts, and again before each start, so trust removed while the engine is open stops the next start. Whenever the workspace's trust changes while the engine is open (a person removes it in Settings › Trust or Settings › Trusted sources, or a check runs again), the engine shall check the workspace it loaded again and, on a no, close the way closing the workspace closes it: its runs in progress stop, no timer of theirs (a harness step included) runs again in this window, and the engine's lock is given back. A check that fails counts as no here too. Right before each harness step starts, the engine shall check once more whether a person trusted exactly the workspace it loaded (`engine.harness-may-start`); this is the trust itself, without the test-model exception, because a resumed run's step runs from the definitions it started with, which can have a harness agent the loaded workspace no longer has. So trust removed where the window doesn't hear it (`halonic trust --remove` in a terminal), or while the engine is still checking whether to close, starts no harness program: on a no, or a check that fails, the step starts nothing and its run fails with "Agent \"{agent}\" runs in {harness}, and this workspace isn't trusted on this computer, so Halonic didn't start it." A check that fails or is still running shall count as no. A refusal shall be the `denied` error "This workspace isn't trusted yet, so nothing was started.", nothing shall be sent and the engine's lock shall be given back. Routines › Run now shall refuse first with the Routines page's own words, "Not started: {name} isn't trusted yet.", and its list shall show the routines as paused until trusted. The model resolver backs this up (`cli.workspace-provider-key-trust`): in a workspace that isn't trusted, every call to a provider other than the test model fails, so a path that skips this check still reaches no model. Settings › Trust's line "Halonic won't start programs or call real models from this workspace." stays as it is.

## Examples

- Given a workspace that isn't trusted, whose only provider is `type: openai-compatible` at `http://localhost:11434/v1` with `local: true` and no key,
  when the person runs a workflow or uses Run now on a routine,
  then nothing starts, no request goes to `localhost:11434`, and the refusal says the workspace isn't trusted yet.
- Given a workspace that isn't trusted whose only provider is the test model, with no connector,
  when the person runs a workflow,
  then the run starts.
- Given a workspace that isn't trusted whose provider is `type: anthropic` with a stored key and no `baseUrl`,
  when the person runs a workflow,
  then nothing starts.
- Given the engine is open on a trusted workspace,
  when the person removes the trust and runs the workflow again,
  then nothing starts.
- Given the engine is open on a trusted workspace, with a run whose agent in a harness waits for its step to start,
  when the person removes the trust,
  then the engine closes, the harness step doesn't start, and the next run is refused.
- Given the engine is open on a trusted workspace, with a run whose agent in a harness waits for its step to start,
  when the trust is removed with `halonic trust --remove` in a terminal, which the window doesn't hear, and the step's timer fires,
  then the harness step doesn't start and the run fails, saying the workspace isn't trusted.
