# Writing a plugin

A **plugin** adds something to Halonic: the tools of an outside service, a
program on your own computer, or a command, a form or a card in Studio. A
plugin is a folder with one file at its root, `plugin.yaml`. That file is the
whole contract. Start from the sample in
`packages/testing/integration/examples/acme-orders-plugin`.

An integration is one kind of plugin: a plugin with only a `backend`. The
[integration guide](integrations.md) rules apply to every plugin backend word
for word. This guide adds what is new: the manifest, local tools, `ui`, trust
and the conformance suite. The decision is in
[the plugins record](../adr/2026-11-09-plugins.md) and
[plugin cards on Home](../adr/2026-11-11-plugin-cards-on-home.md).

## What works in 0.1

Plugins arrive in steps, and not every step is in 0.1:

- You can write a plugin, validate it and run the conformance suite on its
  backend.
- `halonic plugin add`, `list` and `remove`, and `halonic trust --plugin`,
  add and trust a plugin from the command line.
- Studio's screens for plugins (settings, commands, Home cards, the panel)
  aren't in 0.1. Nothing draws a plugin's `ui` yet, so you can't see your
  settings or cards; you can still write and validate them.
- Security tests for local tools are still being built. A local tool is
  fenced by the sandbox, but check for yourself that yours lists only the
  tools you declared.

The [plugin sample](../../packages/testing/integration/examples/acme-orders-plugin/README.md)
is the reference.

## Write a plugin from the sample

1. Copy `packages/testing/integration/examples/acme-orders-plugin` to a new
   folder. Everything in it is invented: `api.acme.example` doesn't exist.
2. Change `id`, `name` and `description` in `plugin.yaml`, and the `hosts`,
   `secrets` and `tools` to your service's.
3. Change `backend/index.js` so the `Integration` it exports matches the
   manifest: the same name, version and tools.
4. Record one answer from your service for each tool and put it in
   `recordings/`. By hand: make the call yourself, save the answer in the
   `halonic.recording/1` shape (see below), and remove your key, tokens, names,
   addresses and any other personal content from it.
5. Run the conformance suite (see below) until it passes.
6. Add it to your own profile: `halonic plugin add ./my-plugin`. It asks
   "Trust *name* and turn it on?". Answer yes to turn it on. No, or no
   terminal, leaves it added but off; a script passes
   `--yes --fingerprint <fingerprint>` (see Trust below).
7. Give an agent its tools: add the plugin's connector to a workspace. A
   workspace names the plugin; it can't trust it.

## Run it and see errors

- **Check the folder:** `halonic validate ./my-plugin` reports schema and manifest errors.
- **After you edit:** a changed file changes the fingerprint, so the plugin is
  off until you trust it again. `halonic plugin list` shows it as "changed
  since you trusted it"; run `halonic trust --plugin <id>` and read the check.
- **Adding it twice is refused** ("is already added"). Removing it deletes its
  settings and the API key you entered, so after `plugin remove` you enter them
  again. Prefer changing the files and re-trusting over remove and add.
- **Errors:** a backend or local tool that fails returns an error that names
  the plugin; the rest of Halonic keeps working.

| You see | Cause | Fix |
| --- | --- | --- |
| a validation error naming a field | unknown or mistyped field; every object is strict | fix the field named |
| "added but off" | you answered No, or there was no terminal | `halonic trust --plugin <id>` |
| "changed since you trusted it" | a file or the manifest changed | trust it again |
| a local tool "needs the desktop app" | no sandbox on Android or in the browser | use the desktop app, the CLI or `serve` |
| a tool refused | the server offers a tool the manifest doesn't declare | declare it, or remove it from the server |

The backend in the sample is plain JavaScript with no imports and no build
step. If you write TypeScript, build it to one JavaScript file first and point
`entry` at the result.

## The manifest

```yaml
id: weather
version: 1.2.0
sdk: 1
name: Weather
description: Forecasts for the places you name.
backend: { … } # optional
localTools: […] # optional
ui: { … } # optional
```

| Field | Required | Meaning |
| --- | --- | --- |
| `id` | yes | Lower-case words joined by `-`. At most 48 characters. Unique in a profile. |
| `version` | yes | The plugin's own version, `major.minor.patch`. |
| `sdk` | yes | The SDK version the plugin was built for. Today it is `1`. The loader refuses any other. |
| `name` | yes | What people see. Plain text. |
| `description` | no | One line about what it does. |
| `backend` | no | Code that calls outside services, in Halonic's isolated worker. |
| `localTools` | no | Programs on this computer, started in the sandbox. |
| `ui` | no | Settings, commands, cards and a panel that Studio draws. |

At least one of `backend` and `localTools` is required. A plugin with only
`ui` has nothing for its forms and cards to call.

Every object is strict: an unknown field is an error, so a typo in `risk` can
never make a tool look harmless. `halonic validate` checks a plugin folder
like any other file, and `plugin.schema.json` in `core/format` gives editors
the schema.

### `backend`

`backend` is the integration's permission sheet without `id`, `version` and
`kit`. Halonic fills those from the plugin's `id`, `version` and `sdk`, so each
number is written once.

- **`entry`:** the built JavaScript module that exports the `Integration`.
  Default `backend/index.js`.
- **`hosts`:** every host the code may call, by exact name. `https` only.
- **`secrets`:** each secret by name, with its `purpose`, the `hosts` it may go
  to and where it goes (`as`). The code names a secret and Halonic puts the
  value into the request. The backend's code never sees it.
- **`tools`:** every tool, with `description`, `risk` (`read`, `write` or
  `send`), `untrusted` and `arguments`.

Two rules are specific to plugins:

- A plugin backend **can't declare `tokens`**. Sign-in isn't supported in 0.1.
  Use an API key.
- A plugin backend **can't need a process** (`needs: process`). Starting a
  program is what `localTools` is for.

### `localTools`

Each entry is one MCP server that talks over stdio:

```yaml
localTools:
  - id: files
    start:
      package: { runner: npx, name: "@acme/files-mcp", version: 3.1.4 }
    args: ["--read-only"]
    env:
      ACME_ROOT: { setting: root }
      ACME_TOKEN: { secret: files-token }
    secrets:
      files-token:
        purpose: Lets the files program read your Acme account.
        hosts: [api.acme.example]
    network: [api.acme.example]
    callTimeoutMs: 30000
    tools:
      - name: list-files
        description: Lists the files in a folder.
        risk: read
        untrusted: true
```

- **`start`** is exactly one of `package` or `script`. A package has a
  `runner` (`npx` or `uvx`), a `name` and an exact `version`: no range and no
  tag. A script is a file in the plugin folder, run by a program the person
  already has (`{ program: node, path: tools/server.js }`).
- **`env`** maps a variable to a setting or to a secret this local tool
  declares in its own `secrets`. A literal value is not allowed, and a secret
  declared on another local tool or on the backend doesn't count. A secret
  named here is given to that program, so it does get the value; the trust
  check lists it.
- **`secrets`** declares the secrets this local tool may use, each with a
  `purpose` (what it is for, shown in the trust check) and its `hosts`. Every
  host of a secret must also be in the tool's `network`.
- **`callTimeoutMs`** is how long one tool call may take. It is optional, 60000
  (a minute) by default.
- **`network`** lists the hosts the program may reach, besides Halonic's own
  bridge (the route the program's tools are offered through).
- **`tools`** lists every tool the program offers. Halonic offers only declared
  tools, with the manifest's description. A tool the server lists but the
  manifest doesn't is refused and logged.

Local tools run only in a session whose sandbox is proven: the desktop app,
the CLI and `serve`. Windows is a preview: the sandbox there has limits, and
a plugin's backend worker has no operating-system fence on Windows. On Android
and in the browser the plugin still loads, and its local tools show as needing
the desktop app. Halonic builds the sandbox's rules; a plugin can't ask for
more. See [the plugins page of the
security docs](../security/plugins.md).

### `ui`

`ui` describes what Studio draws. It carries no code.

| Entry | Where it shows |
| --- | --- |
| `settings` | A section for the plugin in Settings. A `secret` field is stored in Secrets and never handed to the backend; only a local tool that names it in `env` receives it. |
| `commands` | The command palette. A command opens its form if it has one, calls its tool (a tool that reads) and shows the result. |
| `cards` | Home, in a Cards section marked "From the *name* plugin", and in the plugin's panel. A card calls a `read` tool with fixed arguments when it is shown. |
| `panel` | A tab that lists the plugin's commands, then its cards. Optional. |

Field types are `text`, `url`, `number`, `boolean`, `choice` (with `choices`)
and `secret` (with the name of a declared secret). A command's form takes every
type except `secret`. `show` is `text`, `markdown` or `table`.

Everything a plugin shows is untrusted text. Studio draws it as text or
sanitised Markdown, never as HTML or script, and links go through the same
external-link handling as the rest of Studio.

Checks inside the manifest: every command and card names a declared tool, and
that tool is `read` (a command or card can't call a tool that changes or
sends), a `secret` field and an `env` secret name a declared
secret, and tool names and local tool ids are unique across the plugin.

## The SDK

The SDK is the `IntegrationHost`, and nothing more. There is no new API for
plugins.

| Call | What it does | Limits |
| --- | --- | --- |
| `host.http.fetch(url, init)` | outbound HTTP | declared hosts only, `https`, every redirect checked again; secrets are placed by Halonic |
| `host.settings` | the values the person set in `ui.settings` | never a secret value |
| `host.wait(ms, signal)` | a pause a server asks for | at most 30 seconds, ends with the call |

Your backend exports an `Integration` and returns an `IntegrationConnection`
from `connect` (`callTool`, `close` and, optionally, `listTools`). That is the
whole surface. There is no file system, no secrets reader, no global `fetch`,
no timer, and no access to the workspace or to Studio. A plugin that needs more
is a local tool, and the sandbox fences it.

The `sdk` number follows the integration port's version. New optional fields
keep it. A breaking change raises it and comes with a decision record.

## Trust, and what changes when a file changes

`halonic plugin add <folder | git address>[@commit]` copies the plugin (or
clones the repository at one commit) into the plugins folder in your profile
(your Halonic data on this computer), never into a workspace, and records the SHA-256 of every file. Then it shows the
trust check and asks.

The check lists what the plugin can do and reach:

- **Tools for agents:** every tool, as **Reads**, **Changes things** or
  **Sends**. A tool that changes or sends asks a person first.
- **Programs on this computer:** local tools, each with its command and
  arguments.
- **Secrets:** each by name and the addresses it goes to, never its value.
  This is the backend's route; a secret named in a local tool's `env` goes to
  that program.
- **Addresses:** the hosts the backend may call, and the hosts the local tools
  may reach.

Your yes trusts one fingerprint. It covers the normalised manifest and every
file in the folder. So:

- **Any change to the manifest, to any file or to a pin changes the
  fingerprint.** The plugin is then off until you trust it again, and the check
  is shown again in full (it doesn't mark what changed, so compare it with the
  one you saw).
- Editing `ui` text counts too, because the fingerprint covers the whole
  manifest.
- Trust is a record in your profile, per computer. A plugin's own files, or a
  workspace that names it, can't create or change it.

Other commands: `halonic plugin list` shows each plugin and whether it is on.
`halonic trust --plugin <id>` turns on a plugin already added;
`halonic trust --plugin <id> --remove` removes the trust, so the plugin is off
(its settings and secrets stay). `halonic plugin remove <id>` asks first (or
needs `--yes`), then removes the plugin with its trust, settings and the API
key you entered.

In a script, `plugin add` and `trust --plugin` take
`--yes --fingerprint <fingerprint>`; the fingerprint must match what the check
shows now. `plugin remove` takes only `--yes`.

Trust is a list, not a sandbox. Read what the check says before you answer. See
[workspace trust](../security/trust.md) for the limits.

## Run the conformance suite

`@halonicjs/testing/integration` runs the same suite on a plugin folder. In your plugin's own tests:

```ts
import { fileURLToPath } from "node:url";
import { describePluginConformance } from "@halonicjs/testing/integration";
import { acmeOrders } from "../backend/index.js";
import findOrder from "../recordings/find-order.json" with { type: "json" };

describePluginConformance({
  folder: fileURLToPath(new URL("..", import.meta.url)), // the folder with plugin.yaml
  backend: acmeOrders, // what the backend's entry exports
  recordings: [findOrder],
  cases: [{ tool: "find-order", scenario: "find-order", args: { order: "A-1001" } }],
});
```

It reads `plugin.yaml` the way Halonic does, and checks for these. It fails when:

- the folder has no manifest, or both `plugin.yaml` and `integration.yaml`;
- the manifest fails its schema or its own checks, or its `sdk` isn't this
  Halonic's;
- a file the manifest names (the backend's `entry`, a local tool's `script`) is
  missing;
- the backend's code differs from the manifest (name, version, a tool's text,
  arguments, `risk` or `untrusted`).

Then every backend check runs against your recordings, with fake key values and
the network replaced by tripwires. It checks for a backend that:

- reaches a host it didn't declare, or sends a secret to a host the secret may
  not go to;
- reads a file, or uses global `fetch`, `process`, `eval`, `import()`, timers
  or other globals the integration rules forbid;
- lets a key, or the provider's error body, reach a result, an error, a log or
  a URL;
- sends a request while connecting, or keeps going after its call is aborted.

A recording is a `halonic.recording/1` file: one scenario, its exchanges in call
order, with keys and personal content scrubbed. On replay, a request that
doesn't match the next recorded exchange fails closed.

The suite doesn't start local tools in a sandbox, so it doesn't check that a
local tool stays inside its declared tools and hosts. Check that yourself: your
local tool should offer only the tools you declared.

## Share your plugin

Put the folder in a git repository. People add it with
`halonic plugin add <git address>@<commit>`, so give them a commit to pin. A
new version is a new commit, which is a new fingerprint and a new trust check
for everyone who has it. There is no registry yet.

## The whole manifest

`core/format/spec/plugin.schema.json` is the schema editors use. The sample's
`plugin.yaml` shows a working plugin; the schema lists every field. To report a vulnerability in the plugin
system, see [SECURITY.md](../../SECURITY.md). Report a bad plugin the same way.

<!-- Keeping this page true: a pull request that changes the manifest, the SDK,
the trust check or the conformance suite updates this guide in the same pull
request. -->
