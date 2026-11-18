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
- A plugin backend **can't hold sign-in tokens** yet, so no token value ever
  enters the worker.
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
to agents) and the hosts the manifest declares. A pinned package also gets the
folder, path and registry variables Halonic sets itself, and may reach its
registry's host (for PyPI on `pypi.org`, also `files.pythonhosted.org`). A tool the
server offers that the manifest doesn't declare is refused. No proven fence
means no start, and a yes to run without the sandbox (not offered yet) doesn't cover plugin
programs. Where no sandbox works (Android, the browser) local tools don't run.

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
  whole process. Windows is a preview: there a backend worker may run only
  when MXC fences it, on Windows 11, with only its heap limited, and no app
  uses MXC yet. Without MXC it doesn't start, because a yes to run it without
  the sandbox isn't offered yet. So for now a backend worker doesn't start on
  Windows. And
  a program that is allowed a host can send anything there.
- **Tool results are untrusted content.** A plugin's answer can try to steer a
  model, as any outside text can. See
  [model output](threat-model.md#42-model-output-and-content-b2).
- **A pinned package is trusted by its pin.** The check names the version, not
  what the package does.

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
[threat model](threat-model.md#8-limits-of-trust-and-of-the-sandbox) together.
