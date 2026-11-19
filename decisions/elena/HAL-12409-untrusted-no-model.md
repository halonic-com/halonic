# Decision: a workspace that isn't trusted calls no real model, in the Studio and through the model resolver

- Approval: Liam's rule on HAL-1984 and HAL-12011 (starting anything needs trust unless the workspace reaches only the test model), applied to the Studio on HAL-12409; Julian reviews the security change, Liam signs this note with the pull request
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:XN0/9IixxMV/Zz+XtVoQCdS6E2Y4gE+S6ac7ozVGbupe4LjMGXhHOz1pt8pcCNlNvK3Cryxj3MVevhaKo7S+DA==
- Task: HAL-12409

## What changes

`studio.untrusted-starts-nothing` (new): before the Studio's engine opens, and before each start (a workflow's run, Run now, an Inbox request, Run again), it checks the workspace it loaded by the CLI's rule: trusted on this computer, or reaching only the test model. Otherwise it refuses as `denied`, "This workspace isn't trusted yet, so nothing was started.", sends nothing and gives the engine's lock back. A check that fails or is still running is a no. Routines › Run now now gets the workspace's trust, so it refuses first with its own words, "Not started: {name} isn't trusted yet.", and the list shows "Paused until trusted". Before, the Routines host was given no trust, so it counted every workspace as trusted (Kim's case on HAL-12407).

`cli.workspace-provider-key-trust`: in a workspace that isn't trusted, the resolver now refuses every provider but `type: mock` with the `denied` error `untrusted-workspace`, keyless and local providers and the agent editor's unsaved settings included. The key checks run first, so `untrusted-provider-address` and `key-origin-not-allowed` keep their meaning. The CLI already checked trust before each run, so it only ever resolved a real provider in a trusted workspace; nothing changes there except that `serve` in a test-model-only workspace now refuses the agent editor's unsaved settings for a real model.

Three test assertions changed with the rule, none weakened:

- `key-trust.test.ts`, "refused when the workspace isn't trusted…": a key at its type's own address in an untrusted workspace used to resolve; it is now refused as `untrusted-workspace`.
- `key-trust.test.ts`, "refuses the agent editor's unsaved settings the same way": the `anthropic` settings at the default address are now refused as `untrusted-workspace`, where they resolved before.
- `key-origins.test.ts`, "is not asked about for a provider with no stored key, or the mock model": runs trusted now, because a keyless real provider is refused untrusted; it still checks that the origin list isn't asked.

## Why

Settings › Trust says "Halonic won't start programs or call real models from this workspace." The Studio broke that: Run now sent a request to a keyless Ollama on `localhost:11434` from an untrusted workspace, and a stored key could go to its provider's own address. The CLI's rule now holds in both places, and the resolver backs up every surface's own check.

## Decided by the team

- The engine's refusal reuses the Studio's existing sentence for an untrusted start ("this workspace isn't trusted yet, so nothing was started", from the listed-tools check), so no new wording is needed there.
- The resolver's new error says "provider {id} calls a real model, and this workspace isn't trusted on this computer, so nothing was sent." with the fix "Check the workspace, then trust it, or set type: mock in providers/{id}.yaml to use the test model." Sofia confirms the words on HAL-12409 and HAL-12871.
- A Review action on the Run now refusal (the Routines host's `askTrust`) isn't wired yet; the header badge's Review stays the way in. It is a follow-up task, not part of this security change.

## Covers

- studio.untrusted-starts-nothing
- cli.workspace-provider-key-trust
