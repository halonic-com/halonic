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
- Studio has screens for plugins on `main`: Settings → Plugins to add one,
  the trust check, and Review changes for a plugin that changed. Studio isn't
  released yet, so the words on those screens may still change. The steps are
  in [Add and trust a plugin in Studio](https://halonic.dev/docs/guides/studio-plugins).
  A plugin's `ui` (settings, commands, cards, the panel) is drawn by those
  screens, so you can see your own settings and cards in a Studio build.
- The sandbox's attack tests for local tools are on `main`. A local tool is
  fenced by the sandbox; still check for yourself that yours lists only the
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
5. Run the [conformance suite](plugin-conformance.md) until it passes.
6. Add it to your own profile: `halonic plugin add ./my-plugin`. It asks
   "Trust *name* and turn it on?". Answer yes to turn it on. No, or no
   terminal, leaves it added but off; a script passes
   `--yes --fingerprint <fingerprint>` (see Trust below). When its backend
   can't run in the sandbox on this computer, it asks only "Trust *name*?"
   and says first that trusting it won't turn it on, and why.
7. Give an agent its tools: add the plugin's connector to a workspace. A
   workspace names the plugin; it can't trust it. Write a connector file,
   such as `library/connectors/my-plugin.connector.yaml`, that names the
   plugin by its id:

   ```yaml
   name: My plugin
   transport:
     plugin:
       id: my-plugin
   ```

   Then list the connector, by its file name without `.connector.yaml`, in
   the agent: `connectors: [my-plugin]`. When the plugin reaches a host,
   also set `privacy.localOnly: false` in `workspace.yaml`; `halonic validate`
   reports it while that is still `true`, and warns when no plugin with that
   id is added on this computer.

## Run it and see errors

- **Check the manifest:** `halonic plugin add ./my-plugin` reports schema and
  manifest errors with the line and field they're about, as `validate` does,
  for example
  `✕ Couldn't add the plugin: plugin.yaml 21:13 backend.tools[0].risk: Invalid option: expected one of "read"|"write"|"send"`.
  `halonic validate` checks a workspace, not a plugin folder.
- **After you edit:** `plugin add` copies the plugin into the `plugins/<id>`
  folder of Halonic's data folder (`HALONIC_HOME`, see the
  [CLI README](../../apps/cli/README.md#environment)), and Halonic runs that
  copy. Editing the folder you added it from changes nothing until you add it
  again: `halonic plugin list` says so, as "copied from ~/my-plugin on 20 Nov".
  To pick up your edits, run `halonic plugin add ./my-plugin --update`. It
  puts the new copy in place and keeps the plugin's settings and the API key
  you entered. A changed file changes the fingerprint, so it shows the check
  and asks you to trust it again; No leaves it off, and `halonic plugin list`
  shows it as "! not trusted yet · halonic trust --plugin <id>" until you run
  that command. (It shows "! changed since you trusted it" instead when the
  plugin's copy in your profile changes some other way.)
- **Adding it twice without `--update` is refused** ("is already added").
  Don't remove and add it instead: removing it deletes its settings and the
  API key you entered.
- **Errors:** a backend or local tool that fails returns an error that names
  the plugin; the rest of Halonic keeps working.

| You see | Cause | Fix |
| --- | --- | --- |
| a validation error naming a field | unknown or mistyped field; every object is strict | fix the field named |
| "added but off" | you answered No, or there was no terminal | `halonic trust --plugin <id>` |
| "changed since you trusted it" | a file or the manifest changed | trust it again |
| "off on this computer" | the plugin has a backend, and plugin code can't run in the sandbox here (the line under it says why); the CLI never runs it without | fix what the line names, or allow it in the Halonic desktop app to use it there: **Settings › Plugins**, open the plugin, then **Review** |
| a local tool "needs the desktop app" | no sandbox on Android or in the browser | use the desktop app, the CLI or `serve` |
| a tool refused | the server offers a tool the manifest doesn't declare | declare it, or remove it from the server |
| "<connector> didn't start, so its tools are off in this run.", with "The sandbox didn't work when the plugin <name> started, so none of it ran." and "Halonic tries <name> in the sandbox again the next time a run uses it." under it | the computer passed the sandbox check, but the sandbox didn't work when the plugin started, so Halonic stopped it | nothing to do; the next run that uses it tries the sandbox again |
| "! The backend of the plugin <name> didn't start, so its tools are off in this run.", with the reason under it (in a container: "Halonic is running inside a container, …") and "See why with halonic doctor." | the sandbox can't start on this computer, for example in a container, so the plugin's backend can't run | do what the line under it says (in a container, run Halonic on the computer itself); `halonic doctor` shows why; the rest of the plugin keeps working |

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
| `sdk` | yes | The SDK version the plugin was built for: `1`, or `2` for a backend with `signIns`. The loader refuses a higher one. |
| `name` | yes | What people see. Plain text. |
| `description` | no | One line about what it does. |
| `backend` | no | Code that calls outside services, in Halonic's isolated worker. |
| `localTools` | no | Programs on this computer, started in the sandbox. |
| `ui` | no | Settings, commands, cards and a panel that Studio draws. |

At least one of `backend` and `localTools` is required. A plugin with only
`ui` has nothing for its forms and cards to call.

Text people read (`name`, `description`, and every `label`, `title`,
`help` and choice under `ui`) can't hold control characters or text-direction marks,
such as a right-to-left override: they could make one plugin's name look like
another's. A `description` or `help` may break lines.

Every object is strict: an unknown field is an error, so a typo in `risk` can
never make a tool look harmless. `halonic plugin add` checks the manifest,
and `plugin.schema.json` in `core/format` gives editors
the schema.

### `backend`

`backend` is the integration's permission sheet without `id`, `version` and
`kit`. Halonic fills those from the plugin's `id`, `version` and `sdk`, so each
number is written once.

- **`entry`:** the built JavaScript module that exports the `Integration`. A local runner uses the module's `default` export, because a folder has no other way to say which export is the integration.
  Default `backend/index.js`.
- **`hosts`:** every host the code may call, by exact name. `https` only.
- **`secrets`:** each secret by name, with its `purpose`, the `hosts` it may go
  to and where it goes (`as`). The code names a secret and Halonic puts the
  value into the request. The backend's code never sees it.
- **`tools`:** every tool, with `description`, `risk` (`read`, `write` or
  `send`), `untrusted` and `arguments`.
- **`signIns`:** optional, the OAuth sign-ins Halonic runs for the backend.
  See [Sign-ins](#sign-ins) below.

Two rules are specific to plugins:

- A plugin backend **can't declare `tokens`**, the tokens an integration
  stores itself. For a service with an OAuth sign-in, declare `signIns`; for
  any other, use an API key.
- A plugin backend **can't need a process** (`needs: process`). Starting a
  program is what `localTools` is for.

### Sign-ins

A backend that signs in to a service with OAuth declares it in `signIns`, and
the plugin says `sdk: 2`. With `sdk: 1`, `plugin add` refuses it with "signIns
need sdk: 2 or higher". Halonic's own code runs the sign-in and keeps the
tokens; the backend uses the access token but never reads it.

```yaml
sdk: 2
backend:
  hosts: [api.acme.example]
  secrets:
    acme-client-secret:
      purpose: The client secret of Halonic's Acme app.
  signIns:
    account:
      purpose: Access to your Acme account.
      flow: oauth-code
      authorizeUrl: https://acme.example/oauth/authorize
      tokenUrl: https://acme.example/oauth/token
      revokeUrl: https://acme.example/oauth/revoke # optional
      clientId: acme-app-id # or { fromSetting: <a setting under ui.settings> }
      clientSecret: acme-client-secret # optional
      scopes:
        - { scope: orders.read, reason: read your orders }
      access:
        hosts: [api.acme.example]
        as: bearer
```

- **`purpose`** is what the person reads above the sign-in.
- **`flow`** is `oauth-code`: authorization code with PKCE and a loopback
  redirect, the only flow so far.
- **`authorizeUrl`**, **`tokenUrl`** and the optional **`revokeUrl`** are
  `https` addresses. The revoke address is on the host of the token or the
  sign-in page, because signing out sends it the refresh token.
- **`clientId`** is a fixed ID or `{ fromSetting: <setting> }`, never a
  secret: OAuth puts it in the browser's address bar.
- **`clientSecret`** names a secret of the backend that has only a `purpose`
  and no `hosts`. It goes only to the token and revoke addresses, and comes
  only from the plugin's own secrets. Leave it out for a public client.
- **`scopes`** each have a `scope` and a `reason`, which the trust check shows.
- **`access`** lists the hosts the access token may go to and how it goes in:
  `as: bearer`, or `as: header` with `header` and an optional `prefix`.

The backend's code names the sign-in in a request,
`auth: { signIn: "account", as: "bearer" }`, and Halonic puts the token in,
only on the `access` hosts and only over `https`. When the person has to sign
in again, the request fails with `sign-in-needed`. The full field list is in
[the permission sheet](integrations.md#the-permission-sheet).

The trust check lists each sign-in under **Sign-ins**, with its purpose and one
line that names the plugin, such as "Signs in to your Acme orders account at
acme.example. Halonic gets the tokens from acme.example. It can: read your
orders. The sign-in is used only with api.acme.example." for a plugin named
"Acme orders". When the sign-in page and the token address are on different
services, a `!` line says so. Studio's summary counts the sign-ins;
`halonic plugin add` and `halonic trust --plugin` print no summary line.

In Studio, the plugin's page has a **Sign-ins** section with a block for each
one: **Sign in** opens the sign-in page in the browser, and the block shows
"Waiting for *service*… Finish in your browser." with **Cancel** until you
finish there. **Cancel** drops the pending sign-in. After 10 minutes without an
answer the block says "The sign-in didn't finish. Nothing was saved." Signed in, it
shows **Sign out**. A sign-in whose manifest entry changed asks you to
**Sign in again**.

Removing a plugin's trust or the plugin signs it out first: Halonic revokes
each saved sign-in at its `revokeUrl`, where there is one, and deletes it even
when the revoke fails. That holds for Studio's **Remove trust**,
`halonic trust --plugin <id> --remove`, `halonic trust --remove` in the
plugin's folder, `halonic plugin remove` and Settings › **Trusted sources**.
A plugin added later under the same id doesn't start signed in.

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
  A package may also set `registry`, the base address of the registry to fetch
  it from (an `https://` address, without `/simple` for PyPI). Leave it out to
  use the runner's public registry; set it only when the package is on a
  private or mirror registry.
- **`env`** maps a variable to a setting or to a secret this local tool
  declares in its own `secrets`. A literal value is not allowed, and a secret
  declared on another local tool or on the backend doesn't count. A secret
  named here is given to that program, so it does get the value; the trust
  check lists it. `HOME`, `PATH`, `TMPDIR`, `TEMP` and `TMP` aren't allowed:
  Halonic sets those itself, to folders inside the sandbox.
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
a plugin's backend worker starts there only when MXC fences it, on Windows
11, and no app uses MXC yet, so for now it doesn't start on Windows. On Android
and in the browser the plugin still loads, and its local tools show as needing
the desktop app. Halonic builds the sandbox's rules; a plugin can't ask for
more. See [the plugins page of the
security docs](../security/plugins.md).

When a part of a plugin can't start in a run, the run goes on without that
part's tools. `halonic run` warns once for each part and reason, with the
reason and its fix under it:

```text
! The program lister of the plugin files didn't start, so its tools are off in this run.
  Halonic is running inside a container, and the sandbox can't start there. Run halonic run on the computer itself, not in a container. …
  More: https://docs.halonic.dev/security/sandbox/#container (container)
```

The run's log records the same as a `connector.part-off` event: the agent,
the connector, the part (`backend`, or `local:` and the program's id) and a
reason code, such as `sandbox-unavailable`, never an error's text. The
plugin's other parts keep working. `halonic run --json` lists the event with
the run's others.

`halonic runs show` reads it back later, under the run's steps: one warning
for each part and reason, with the reason the code gives and the command
that shows more, `halonic tools review <connector>`. The log keeps no error
text, so a part that is off for another reason (`failed`) gets only that
command.

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
trust check and asks. In the Studio desktop app, **Settings → Plugins → Add plugin** does the same
from a folder you pick with **Choose folder…** or from a git address: the app exports one commit
of the repository (files only, with no `.git`, no submodules and none of your git settings), checks it
as `plugin add` does, and adds the plugin not trusted, so you review the check next. The desktop
app reads only a folder you picked: for a path typed into **Folder**, it asks you to use
**Choose folder…**.

An `https://` address works only for a public repository: the export uses none of your git
settings, so no credential helper signs in, and a password or a user name in the address is
refused, since that's where a token would go. For a private repository, use an `ssh://` address, such as
`ssh://git@github.com/acme/weather`: git signs in with your ssh key.

Both leave private names out of the copy, at any depth: `.git`, `.studio`, `.env`, `.env.*` and
`.envrc`. Keep them out of your plugin's folder and they never reach anyone else's profile.

The check lists what the plugin can do and reach:

- **Tools for agents:** every tool, as **Reads**, **Changes things** or
  **Sends**. Agents get them through a connector, and each one asks a person
  first, a tool that reads too, until the connector file's `read` list names it.
- **Programs:** local tools, each with its command and
  arguments, and a **Runs** line under each that says whether it can run on
  this computer: in the agent sandbox, or not now, because the sandbox can't
  start here.
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
Under a plugin with programs, a line says whether they run on this computer,
with `!` when they don't, so a plugin that is on but whose programs can't start
here doesn't look as if they run.
`halonic trust --plugin <id>` turns on a plugin already added;
`halonic trust --plugin <id> --remove` removes the trust, so the plugin is off
(its settings and secrets stay). `halonic plugin remove <id>` asks first (or
needs `--yes`), then removes the plugin with its trust, settings and the API
key you entered. Both, and **Remove trust** in Studio, also sign you out of
the plugin's sign-ins on this computer: each token is revoked at the provider
where the sign-in has a revoke address, and forgotten here either way. When the
provider doesn't confirm the sign-out, the command (or Studio) names the sign-ins and says
the token may still work there until it expires: "To end it now, remove the
access you gave in your account settings at the provider." By then the trust or
the plugin is gone, so Halonic has nothing left to retry.

In a script, `plugin add` and `trust --plugin` take
`--yes --fingerprint <fingerprint>`; the fingerprint must match what the check
shows now. `plugin remove` takes only `--yes`.

In Studio the same check is in Settings → Plugins, and a changed plugin shows
**Review changes**, which tags each row New, Changed or Removed. See
[Add and trust a plugin in Studio](https://halonic.dev/docs/guides/studio-plugins).

Trust is a list, not a sandbox. Read what the check says before you answer. See
[workspace trust](../security/trust.md) for the limits.

## Run the conformance suite

Run the conformance suite on your plugin folder in your plugin's own tests,
until it passes. What it checks, and how to call it:
[Run the plugin conformance suite](plugin-conformance.md).

## Share your plugin

Put the folder in a git repository. People add it with
`halonic plugin add <git address>@<commit>`, so give them a commit to pin. A
new version is a new commit, which is a new fingerprint and a new trust check
for everyone who has it. There is no registry yet.

## The whole manifest

`core/format/spec/plugin.schema.json` is the schema editors use. The sample's
`plugin.yaml` shows a working plugin; the schema lists every field. To report a vulnerability in the plugin
system, see [SECURITY.md](../../SECURITY.md). Report a bad plugin the same way.

<!-- Keeping this page true: a pull request that changes the manifest, the SDK
or the trust check updates this guide in the same pull request. The conformance
suite has its own page, plugin-conformance.md. -->
