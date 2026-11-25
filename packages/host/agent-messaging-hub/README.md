# @halonicjs/host-agent-messaging-hub

The messaging hub, which joins every `AgentMessaging` provider into the one the engine serves, and
`PaperclipKeys`, the guard that hands a Paperclip key only to a request for the address and company
it was made for. Both use Web-standard APIs only, so the desktop agent host and the server
(`halonic serve`) share them.

- **Layer:** host
- **Owner:** tomas
- **Public API:** `@halonicjs/host-agent-messaging-hub`
- **Requirements:** `agent-host.messaging-hub`, `agent-host.messaging-hub-attachments` and
  `agent-host.paperclip-key`, in `apps/agent-host/requirements/`

## Example

```ts
const hub = new MessagingHub({ providers: [{ name: "paperclip:acme", messaging }], report: log });
const open = (await hub.listInboxItems()).filter((item) => item.state.kind === "open");
```
