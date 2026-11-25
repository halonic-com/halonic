# Plugins and security

What stops a plugin from doing harm, what doesn't, and why a plugin's screens
carry no code. For how to write one, see [writing a plugin](../guides/plugins.md).
The decision is in [the plugins record](../adr/2026-11-09-plugins.md). For the
trust check's own limits, see [workspace trust](trust.md), and for the fence
local programs run in, see [the sandbox's limits](sandbox.md).

A plugin is a folder you add yourself, often written by someone else. It has
three optional parts: a **backend** (code that calls outside services), **local
tools** (programs on your computer) and **`ui`** (settings, commands and cards
Studio draws). Each part has one defence: the worker and its kit (the
calls the backend is allowed to make), the sandbox, or, for `ui`, that Studio
draws it as text.

## The two fences

| Part | Where it runs | What fences it |
| --- | --- | --- |
| Backend | the isolated worker, through the integration kit | the kit's limited host |
| Local tools | a sandbox session, never directly on your computer | the sandbox |
| `ui` | nowhere: it is data | Studio draws it as text; nothing from the plugin runs |

### Fence 1: the worker and the kit

A plugin backend runs in a separate process, the worker, that holds one
integration. Its only way out is the `IntegrationHost`:

- It can call only **declared hosts**, over `https`. Plain `http` is
  allowed only to this machine or a private network address, never to a
  link-local or cloud metadata address. A host can also come from a setting:
  the manifest names the setting and the kind of address it must hold
  (this machine, a private network or the internet), and the address you set
  must match it. A redirect is followed (up to five hops) and each hop is
  checked against the declared hosts again.
- It can't import Node's modules, and the fence gives it no network of its
  own, so the kit is its only way out.
- The backend **never sees a secret.** It names the secret and where it goes,
  and Halonic puts the value into the request, only for the hosts that secret is
  declared for. Results, errors and logs pass through a filter for secret
  values. The trust check's "goes only to *host*" describes this route. A
  local tool is different: a secret named in its `env` is given to that
  program (Fence 2), and the check lists it.
- A plugin backend **never holds a sign-in token.** A backend with `sdk: 2`
  may declare `signIns`, which the trust check lists under **Sign-ins** with
  the hosts the token may go to. Halonic runs the sign-in and keeps the token,
  and puts it into a request only for those hosts, as it does a secret, so no
  token value ever enters the worker. Removing the plugin's trust, or the
  plugin, signs out its sign-ins on this computer first: each token is revoked
  at the address the person approved, where there is one, and forgotten here
  even when the revoke fails. When the provider doesn't confirm, the CLI and
  Studio say the token may still work there until it expires, as Studio's
  **Sign out** does.
- Every tool has a `risk`, which the trust check shows. Agents reach the tools
  through a connector, and every call asks a person first, whatever the risk,
  unless the connector file's `read` list names the tool; a plugin can't add a
  tool to that list. Every result of a plugin's tool reaches a model fenced as
  outside content, whether the tool is marked `untrusted` or not.

### Fence 2: the sandbox

A local tool starts only inside a sandbox session, after the session has proven
its fence. Halonic builds the sandbox's rules, never the plugin: a fresh working
folder, an environment with only the variables the manifest names (plus `PATH` and the folder variables Halonic sets itself, such as `HOME` and the temporary folders), and a
network limited to Halonic's own bridge (how the program's tools are offered
to agents) and the hosts the manifest declares. Before every session Halonic
reads the plugin's folder and checks its trust again, and the program runs from
a copy of the files it just checked, never from the plugin's own folder. A pinned package also gets the
folder, path and registry variables Halonic sets itself, and may reach its
registry's host (for PyPI on `pypi.org`, also `files.pythonhosted.org`). A tool the
server offers that the manifest doesn't declare is refused. No proven fence
means no start, and a yes to run without the sandbox never covers local tools. Where no sandbox works (Android, the browser) local tools don't run.

### Why `ui` carries no code

Studio draws a plugin's settings, commands and cards itself, from the manifest.
No plugin script or web page is loaded into the window. By design, a plugin's
`ui` has no way to read the rest of Studio, skip a theme or keyboard rule, or
send Studio messages, because there is no frame and no message interface. Everything a plugin
shows is untrusted text: it is drawn as text or sanitised Markdown, never as
HTML or script, and its links go through Studio's external-link handling. A
command or a card may only call a tool whose `risk` is `read`: a manifest
whose `ui` calls a `write` or `send` tool is refused. Studio's plugin screens are on `main` and draw `ui` by these rules, but Studio
isn't released yet. A broken plugin fails with an error that
names it, and the rest of Studio keeps working. A secret setting goes straight to Secrets under the plugin's own name,
and the plugin reads only the secrets stored for it.

## Trust

Adding a plugin copies it into your profile, never into a workspace, and
records a SHA-256 of every file. Nothing from it runs until you trust its
**fingerprint**, which covers the whole manifest and every file. Any change to
the manifest, a file or a pin changes the fingerprint, so the plugin is off
until you trust it again. Trust is a record in your profile that a workspace can't write, so a
cloned workspace can't trust itself.

## What this does not protect against

- **The trust check is a list, not a sandbox.** It shows tools, programs,
  secrets and addresses, and your yes lets them run within their fences.
- **A backend can still misuse what it is given.** A declared host receives
  whatever the plugin sends it, including text from your tools. Halonic
  doesn't check what a plugin does with what it's given.
- **The sandbox has limits.** It sets no CPU or memory limits, so a local
  tool's program has none. A backend worker brings its own memory limit: on
  its JavaScript heap, and on Linux, where `prlimit` is installed, on the
  whole process. Windows is a preview: there MXC could fence a backend
  worker, on Windows 11, with only its heap limited, but no app uses MXC yet.
  Without MXC it starts only after you allow plugins and integrations to run
  without the sandbox in Studio's trust check or in Settings › Agent sandbox,
  and the launcher it then runs
  in doesn't fence it. Without that yes it doesn't start. And
  a program that is allowed a host can send anything there.
- **Tool results are untrusted content.** A plugin's answer can try to steer a
  model, as any outside text can. See
  [model output](threat-model.md#42-model-output-and-content-b2).
- **A pinned package is trusted by its pin.** The check names the version, not
  what the package does.
- **On Linux, a credential folder made during a session.** A local tool's
  session can't read the credential folders in your home folder. One you
  create while a session runs (say `~/.aws`) stays readable to that session
  until it ends, at most 10 minutes, because the Linux sandbox can only hide a
  folder that is already there. Its network stays limited to the declared
  hosts, and the next session hides the folder (`harness-kit.home-denied-paths`).
- **The fingerprint covers file contents, not file modes or empty folders.**
  Adding a plugin drops modes, and programs start through `node` or `python`,
  so a file's executable bit changes nothing.
- **A backend that loads a file in the middle of a call reads it then.** Trust
  is checked again at every call and every start, so a file changed in between
  can reach only the call already running; the next call or start sees the
  change and doesn't run.
- **A file with a second name (a hard link) isn't refused.** Adding a plugin
  copies bytes, so it never makes one. Only a program that can already write to
  your profile could.

## What the security review checked

Before 0.1 each part of the plugin system was reviewed against this page, and
every gap was fixed or accepted (the accepted ones are listed above). The
attack tests below stay on `main` and run in CI on every pull request. Tests
under a `fence` folder run in a real sandbox in CI's fence jobs (bubblewrap on
Linux, Seatbelt on macOS).

### Trust

- **What holds:** the fingerprint covers the manifest and every file, by path
  and SHA-256. Hidden files, nested folders, empty files, a renamed or moved
  file, a change of letter case and swapped bytes all change it, so the plugin
  is off until you trust it again. A link or special file anywhere refuses the
  whole folder. Both installers copy only into the profile's plugins folder,
  and refuse unsafe names, links, `.git` and a plugins folder that is itself a
  link.
- **Tests:** `packages/core/app/src/plugin-trust-attacks.test.ts` (each change
  to a trusted folder turns the plugin off; `app.plugin-trust`,
  `contracts.trust-fingerprint`), `packages/adapters/fs-node/src/plugin-folder.test.ts`
  (`fs-node.plugin-folder-plain`).

### Backends

- **What holds:** a backend never runs in Halonic's own process. Every start
  goes through one gate that reads the plugin's folder and checks trust again,
  also on the restart after an idle stop. A sandbox check that fails means the
  backend stays stopped; it never falls back to running without the sandbox.
  The `halonic` command never gives the yes to run without the sandbox, and
  never uses it for a backend: its store for plugin backends holds nothing
  (`app.no-unfenced-run-consent`). It reads the yes only for a workspace's
  local integrations (`cli.local-integration-unfenced-yes`). Studio asks for
  it in the plugin's trust check and in the workspace's trust check, and its
  agent host keeps it (`agent-host.unfenced-runs-routes`). Taking the yes back stops runs in every
  process within a second, waits for starts in progress, and keeps checking
  past a stop that never returns (`app.unfenced-runs`,
  `app.runner-start-gate`).
- **Tests:** `packages/adapters/integration-runner/fence/runner-attacks.test.ts`
  and `packages/adapters/integration-runner/src/halonic/kit-attacks.test.ts`
  (the worker and the kit), `packages/core/app/src/unfenced-run-attacks.test.ts`
  (taking the yes back across two processes, through the real gate).

### Local tools

- **What holds:** Halonic builds the place a program runs in: its own working
  and temporary folders, a read-only copy of the checked files, Halonic's
  `PATH`, and a network of the bridge and the declared hosts. It hides your
  credential folders, Halonic's data, the plugin's own folder and other
  plugins, and refuses a copy that would overlap any of them, also through a
  link (`connector-stdio-sandbox.plugin-local-tool-place`). A local tool's
  `env` can't set `HOME`, `PATH` or a temporary folder from a setting or a
  secret, and Halonic's own values win in any letter case
  (`format.plugin-checks`, `connector-stdio-sandbox.local-tool-profile`). A script changed after the trust check
  doesn't start, and a session whose fence isn't proven starts nothing
  (`app.plugin-local-tools`, `cli.plugin-local-tools`,
  `agent-host.plugin-local-tools`).
- **Tests:** `packages/adapters/connector-stdio-sandbox/fence/plugin-local-tool-place-attacks.test.ts`
  (a hostile program can't read or change what it's denied, or reach an
  undeclared host), `apps/cli/fence/plugin-local-tool-attacks.fence.test.ts`
  (the same through `halonic run`), `apps/cli/src/plugin-local-tool-attacks.test.ts`
  and `apps/agent-host/src/plugin/host-plugin-local-tool-attacks.test.ts`
  (a changed script, an unproven fence and reserved names, in the CLI and the
  agent host).

### UI

- **What holds:** no screen of the plugins feature can draw HTML, open a
  window or change the page, and only `ExternalLink` carries a link. It allows
  only `http` and `https`, by the same rule the Markdown reader uses
  (`kit.external-link-web-only`). A manifest's names, labels, titles and
  descriptions can't hold control characters, invisible characters or text-direction marks
  (`format.plugin-file`), and Studio isolates them so they can't reorder the
  text around them (`plugins.plugin-text`). A command or a card can call only a
  `read` tool (`format.plugin-ui-read-tools`).
- **Tests:** `packages/studio/features/plugins/src/no-raw-markup.test.ts` (a
  source guard), `packages/studio/features/plugins/src/labels.never-html.test.tsx`
  (hostile text in every manifest text, across all six plugin screens),
  `packages/studio/features/plugins/src/ui/plugin-result.never-html.test.tsx`
  (every shape of a tool's answer).

## What works in 0.1

The plugin file kind, the trust check, the `halonic plugin` and
`halonic trust --plugin` commands and the conformance suite work, and the
sandbox's attack tests for local tools are on `main`. Studio's screens for
plugins (Settings → Plugins, the trust check, Review changes) are on `main`
but not released; see
[Add and trust a plugin in Studio](https://halonic.dev/docs/guides/studio-plugins).
The trust check there is still a list, not a sandbox. To report a vulnerability in the plugin system, see
[SECURITY.md](../../SECURITY.md). The
[threat model](threat-model.md#1-scope) names what is in an app you can run.

## Keeping this page true

A pull request that changes the plugin manifest's `backend`, `localTools` or
`ui`, the plugin trust check, or how plugins are run updates this page, the
[plugin guide](../guides/plugins.md) and the
[threat model](threat-model.md#48-plugins-b9) together. One that moves,
renames or removes a test named under "What the security review checked"
updates that list too.
