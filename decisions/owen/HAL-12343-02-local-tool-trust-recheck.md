# Decision: a local tool's plugin is checked against its trust before every session

- Approval: Paperclip task HAL-12343; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:7MUJoVi8h3pYHh8zEs9KX4Re5jDBxsn8zKpBFkA6X7n9pE8XuUFOKctl0yClOSJHU08C1AQmBTxGue1JS8+PCg==

A local tool's session opened when the plugin had a trust grant from `load()`, so a script changed after load ran under the earlier yes. Backends already read the plugin folder again before they start.

- Before every session opens, the first and each one after a session ended, the app reads the plugin folder again and checks the person's trust against what is in it now, the same way `app.plugin-backend` does. The check is one shared function for both.
- Unless the plugin is `trusted` for exactly this manifest and these files, with the grant the tool was loaded with, the call fails with `PluginLocalToolNotTrustedError` and its reason, and nothing opens or starts.
- A plugin trusted again after a change counts as `changed` until it is loaded again, so a session never runs under a grant the tool wasn't loaded with.

## Covers

- app.plugin-local-tools
