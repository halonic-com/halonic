# Acme orders: a sample plugin

A small plugin for the made-up Acme shop (the [example workspace](../../../../../examples/acme/README.md)),
written to the [plugins ADR](../../../../../docs/adr/2026-11-09-plugins.md). The plugin conformance
suite runs it in [`src/sample-plugin.test.ts`](../../src/sample-plugin.test.ts), and the plugin author
guide uses it. Every host, order and value in it is invented: `api.acme.example` doesn't exist, and
no key is involved.

| File | What it is |
| --- | --- |
| `plugin.yaml` | The manifest: a backend with two `read` tools and one secret, and a `ui` block with a setting, a command, a card and a panel |
| `backend/index.js` | The backend's `entry`: the `Integration`, plain JavaScript with no imports and no build step |
| `recordings/*.json` | One recorded answer per tool (`halonic.recording/1`), with the key scrubbed |

What it shows:

- **The backend never sees the key.** It asks for `auth: { secret: "acme-key", as: "bearer" }` and
  Halonic places the key in the request, only to `api.acme.example`.
- **Errors carry only the status.** The shop's error text could hold anything, so the backend doesn't
  pass it on.
- **The UI is data.** Studio draws the key field, the **Find an Acme order** command with its form,
  and the **Open orders** card on Home and in the plugin's panel. No plugin code runs in Studio.
