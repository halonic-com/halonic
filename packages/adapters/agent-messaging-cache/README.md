# @halonicjs/adapter-agent-messaging-cache

`CachedAgentMessaging` wraps an `AgentMessaging` and keeps what each read gave, so an offline
source still shows its items, "as of" its last live read. Writes are never kept to send later.
The cache lives in private files (0600 in a 0700 folder), and a folder inside a workspace is
refused, so nothing a source gave ends up in git. `MessagingCacheFolder` is the file store under
it, which the agent host's team status hub uses too.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-agent-messaging-cache`
- **Requirements:** `agent-host.agent-messaging-cache`, in `apps/agent-host/requirements/`

## Example

```ts
const messaging = new CachedAgentMessaging(hub, {
  folder: join(appData, "messaging-cache"),
  workspaceRoots: [workspace],
  warn: (message) => process.stderr.write(message),
});
```
