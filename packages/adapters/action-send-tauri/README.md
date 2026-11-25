# @halonicjs/adapter-action-send-tauri

The `ActionSender` port of the desktop Studio, over the shell's `action_*` commands. The shell holds
the route list, the token and the native dialogs; this adapter passes the page's step on by name and
reads each answer against an allow-list, so no token ever passes through it.

- **Layer:** adapters
- **Owner:** tomas
- **Runtime:** web
- **Public API:** `@halonicjs/adapter-action-send-tauri`

Only `studio/services` imports it (architecture note on HAL-17491, 4.1 and 4.3).

## Example

```ts
import { TauriActionSender } from "@halonicjs/adapter-action-send-tauri";

const sender = new TauriActionSender(shell);
const signIn = await sender.signIn("github", (code) => showCode(code.code));
const result = await sender.send({
  definition: "github.approve-run",
  version: 1,
  step: 2,
  placeholders: { owner: "acme", repo: "app", runId: "123456" },
});
```
