# Decision: allow the plugin SDK patch for monitor postpone

- Approval: HAL-16727 (HAL-16401 part 3, team decision). Liam approves this note in review of this PR.
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:QjOrGTkmlWmVJmoEW/l5aljmwtPUA4LicHdGVz2ZV1FIeJhgDKSmOyt7sepZ6bv5Rugts/YRF+9lfwUw6//IAw==

## What changes

- `tooling/check/patches-allowed.json`: a new entry for
  `patches/@paperclipai__plugin-sdk@2026.1117.0.patch`, with the patch's hash, why it exists and
  when to remove it. The patch itself comes in the next pull request (HAL-16401), which stays a
  draft until this one merges.
- The patch adds one method, `ctx.issues.monitors.postpone`, to the SDK's plugin worker
  (`dist/worker-rpc-host.js`) and its type (`dist/types.d.ts`). The method only calls the host
  method `issues.monitors.postpone` from our local Paperclip server patch (halonic-com/server,
  HAL-16413). The server decides everything: the plugin needs the capability of the same name, and
  it may only move a task's existing monitor later, at most 24 hours out.

## Why

The PR watcher in the Agent tools plugin checks every watched task every 10 minutes. A task's
fallback monitor still fires a full model run when it comes due, even while the watcher has the
task covered. Moving that monitor later stops those runs. The SDK's `callHost` is private, so the
plugin can't reach the host method without the patch. The SDK is a dev dependency, bundled into the
plugin's `worker.js`; nothing in Halonic's packages loads it. The entry goes away when Paperclip
ships its own call to postpone or hold a monitor.

## Covers

- tooling/check/
