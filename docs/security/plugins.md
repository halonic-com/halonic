# Plugins and security

What stops a plugin from doing harm, what doesn't, and why a plugin's screens
carry no code. For how to write one, see [writing a plugin](../guides/plugins.md).
The decision is in [the plugins record](../adr/2026-11-09-plugins.md). For the
trust prompt's own limits, see [workspace trust](trust.md), and for the fence
local programs run in, see [the sandbox's limits](sandbox.md).

A plugin is a folder you add yourself, often written by someone else. It has
three optional parts: a **backend** (code that calls outside services), **local
tools** (programs on your computer) and **`ui`** (settings, commands and cards
Studio draws). Each part has exactly one defence, and there is no third
mechanism.

## The two fences

| Part | Where it runs | What fences it |
| --- | --- | --- |
| Backend | the isolated worker (item I5), through the integration kit | the kit's limited host |
| Local tools | a sandbox session, never directly on your computer | the sandbox |
| `ui` | nowhere: it is data | nothing needed, because it carries no code |

### Fence 1: the worker and the kit

A plugin backend runs in a separate process, the worker, that holds one
integration. Its only way out is the `IntegrationHost`:

- It can call **declared hosts** over `https`, and nothing else. A redirect to
  another host is refused. No global `fetch`, file system, `process` or timers.
- It **never sees a secret.** It names the secret and where it goes, and
  Halonic puts the value into the request, only for the hosts that secret is
  declared for. Results, errors and logs pass through a filter for secret
  values.
- A plugin backend **can't hold sign-in tokens** yet, so no token value ever
  enters the worker.
- Every tool has a `risk`. Anything above `read` needs a person's OK before it
  runs, and results marked `untrusted` are fenced as outside content.

### Fence 2: the sandbox

A local tool starts only inside a sandbox session, after the session has proven
its fence. Halonic builds the sandbox's rules, never the plugin: a fresh working
folder, an environment with only the variables the manifest names, and a
network limited to the bridge and the hosts the manifest declares. A tool the
server offers that the manifest doesn't declare is refused. No proven fence
means no start, and a yes to run without the sandbox doesn't cover plugin
programs. Where no sandbox works (Android, the browser) local tools don't run.

### Why `ui` carries no code

Studio draws a plugin's settings, commands and cards itself, from the manifest.
No plugin script or web page is loaded into the window. So a plugin can't read
the rest of Studio, a theme or keyboard rule can't be skipped, and there is no
message interface between a frame and Studio to attack. Everything a plugin
shows is untrusted text: it is drawn as text or sanitised Markdown, never as
HTML or script, and its links go through Studio's external-link handling. A
broken plugin fails with an error that names it, and the rest of Studio keeps
working. A secret setting goes straight to Secrets under the plugin's own name,
and the plugin reads only the secrets stored for it.

## Trust

Adding a plugin copies it into your profile, never into a workspace, and
records a SHA-256 of every file. Nothing from it runs until you trust its
**fingerprint**, which covers the whole manifest and every file. Any change to
the manifest, a file or a pin changes the fingerprint, so the plugin is off
until you trust it again. A workspace can't install or trust a plugin, so a
cloned workspace can't trust itself.

## What this does not protect against

- **The trust prompt is a list, not a sandbox.** It shows tools, programs,
  secrets and addresses, and your yes lets them run within their fences.
- **A backend can still misuse what it is given.** A declared host receives
  whatever the plugin sends it, including text from your tools. Halonic
  doesn't check what a plugin does with what it's given.
- **The sandbox has limits.** It has no CPU or memory limits, Windows is a
  preview, and a program that is allowed a host can send anything there.
- **Tool results are untrusted content.** A plugin's answer can try to steer a
  model, as any outside text can. See
  [model output](threat-model.md#42-model-output-and-content-b2).
- **A pinned package is trusted by its pin.** The check names the version, not
  what the package does.

## What ships today

Don't rely on what isn't merged. The plugin file kind, the trust check, the
`halonic plugin` and `halonic trust --plugin` commands and the conformance
suite are on `main`. The attack tests for local tools, and Studio's screens for
plugins, are still being built. The
[threat model](threat-model.md#1-scope) names what is in an app you can run.

## Keeping this page true

A pull request that changes the plugin manifest's `backend`, `localTools` or
`ui`, the plugin trust check, or how plugins are run updates this page, the
[plugin guide](../guides/plugins.md) and the
[threat model](threat-model.md#8-limits-of-trust-and-of-the-sandbox) together.
