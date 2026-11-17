# @halonicjs/adapter-sign-in-loopback

The app's side of an integration's sign-in (HAL-984 design, section 4). The host's sign-in flow is a
`Request → Response` handler; this package serves it on `127.0.0.1` and opens the browser, so Studio
calls one object and the flow stays free of Node.

- **Layer:** adapters
- **Owner:** ravi
- **Runtime:** node
- **Public API:** `@halonicjs/adapter-sign-in-loopback`

## Example

```ts
import { createSignInLauncher } from "@halonicjs/adapter-sign-in-loopback";

const launcher = createSignInLauncher({ flow, browser });
const result = await launcher.begin("work-account");
if (result.kind === "started" && !result.opened) {
  // Show result.authorizeUrl for the user to open themselves.
}
```

The server runs only while a sign-in waits: it stops after the callback, after `cancel` and after the
pending sign-in's lifetime. A request whose `Host` isn't the loopback address and the server's port
gets a 421 (DNS rebinding). The system browser opener is added in a following pull request.
