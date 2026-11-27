# Halonic ToolScript: a TypeScript profile for reviewed actions and agent tools, run in an isolate

- **Status:** Accepted (board, HAL-10, 24 Nov ~15:20 UTC), **revision 8**; security section **signed by Julian on revision 5** (HAL-17596). Revision 6 changes only where the code lives (sections 0, 5, 6, 7 and the CLI name), not section 3. Revision 7 changes how `eval` is removed (section 2.1) as Julian decided on HAL-17650. Revision 8 makes our own QuickJS-ng build the plan (sections 2.1 to 2.3, 3.3 and 6), as the board chose on HAL-17781.
- **Date:** 2026-11-24
- **Author:** Liam. **Security reviewer:** Julian (section 3).
- **Lands as:** `docs/adr/2026-11-24-toolscript.md` in `halonic` (task T1, HAL-17566).

## Revisions

Written on HAL-17560 in six revisions on 24 Nov. Julian's security reviews (HAL-17596) are answered in sections 2 and 3, and Tomas's stepper properties (HAL-17488) in 3.4. Revision 6 follows the board's choice of the monorepo (HAL-10, ~15:20 UTC): the core is a set of `halonic` packages (section 5). Revision 7 (T4, HAL-17569): QuickJS can't compile the script with the `Eval` intrinsic off, so a checked host prelude replaces every path to the compiler instead (section 2.1), the `ToolScriptIsolate` port is named (section 5), and the T4 fence list gains Julian's conditions from HAL-17650 (section 6). Revision 8 (HAL-17847) follows the board's runtime choice **13a** (HAL-17781, 24 Nov 20:35 UTC) with Julian's conditions: we build the QuickJS-ng WASM ourselves (HAL-17780), each run gets a fresh WASM module instance, the CPU limit is a hard kill of the worker, ToolScript isn't switched on for users before our build lands, and an OS-sandbox layer around the server host comes later as its own task.

## 0. Scope (board, 14:03 UTC)

**This track builds the core**, as packages in `halonic` (section 5):
- the TypeScript profile and its checker and build;
- the isolated runtimes and their shared fence suite;
- the `ctx` host (capabilities by audience, handles, frozen arguments, batches, touches);
- the header, with inputs, steps, guide text and **UI and wording from OpenUI components**;
- the library index and the search tool agents use;
- versioning and pinning, dry runs and test fixtures, and the run record format.

**The uses are built by the tracks that own them**, on top of the core, each as one "adopt Halonic ToolScript" task blocked by the core:

| Use | Track |
| --- | --- |
| stepper actions, setup wizards, server runbooks | approvals stream (HAL-17488) |
| buttons in chat replies that run a reviewed action | OpenUI (HAL-17107 line) |
| agent tools and no-model workflow steps (PR watcher, routines) | phase 3 (HAL-17450) |
| one-tap safe approvals on the phone | apps phase 2 (HAL-17503) |
| build, test and deploy actions | Halonic Code |
| a shared public action library for other users | later, its own step after the core |

## In short

- **Halonic ToolScript ("ToolScript" below) is not a new language.** It's ordinary TypeScript in one file, `*.tool.ts`, written under a few strict rules. Editors, `tsc` and Biome all work on it as usual.
- **A script can only do what `ctx` lets it do.** Every effect goes through one injected object, `ctx`, whose methods are our **reviewed capabilities**: catalog step types for users, reviewed actions for agents. A script can loop, branch and shape data. It can **never add an API route, an address, a key or a library**.
- **The runtime is the boundary; the static check is there to help authors.** Scripts run in **QuickJS-ng compiled to WebAssembly, built by us,** on desktop, Node and the Paperclip plugin, and in a **Cloudflare Dynamic Worker** (a V8 isolate with no network) on the Cloudflare target. Neither has `eval`, network, files or timers, and both enforce limits on memory, CPU time, calls and output. One fence suite runs against both. Nothing that matters for security depends on the static check.
- **One header, two audiences, two separate registries.** `audience: "user"` scripts run only in Studio desktop, with the user's own sign-in through the shell. `audience: "agent"` scripts run only in the engine or the Paperclip plugin, with the agent's permissions. Neither host can even import the other's capabilities.
- **Declarative steps are ToolScripts with no code.** A header with `steps` (the same blocks as `halonic.stepper-request/1`) and no `run` function is a complete ToolScript. The manual guide is generated from the header, as it is for steppers.
- **The header carries the UI and wording too** (OpenUI card, table, form, buttons), so code, screens and text are reviewed together, and an action looks the same in the stepper, the Inbox, a chat reply and on the phone. The capability's own preview lines can't be hidden or reworded.
- **A reviewed library comes first.** Agents search it, then reuse an action, copy and adapt it, or draft a new one. A draft runs scripted API steps only after review.
- **Repo:** everything lives in `halonic` (board, 15:20 UTC). The core packages are capability-agnostic; Halonic's capabilities (the stepper catalog, the agent actions) and the library that uses them sit next to them in the same repo.

## Context

The board (HAL-10, 24 Nov 13:23 UTC) wants one way to write **actions and steps** for the approvals stream (HAL-17488) and **agent tools** for the phase 3 plugin (HAL-17450), with API calls allowed and safety kept. Today:

- **Steppers** (architecture note HAL-17491, revision 10) are reviewed `StepperDefinition` modules in `core/action-catalog`. The shell sends only routes generated from that catalog. On-demand requests combine reviewed blocks (`use`, `step`, `browser`) but can't express logic: "for each of these 4 repos, read the variable, set it if it differs" needs a new definition.
- **Phase 3** moves tool *definitions* into the workspace, but "the builder copies no code from the workspace". Each tool maps 1:1 onto a reviewed action, so composing two actions needs new plugin code.
- The repo has **no in-process code isolation**, only OS-level process sandboxes (`Sandbox` port; `sandbox-srt`, `sandbox-mxc`, the Cloudflare container). Those are too heavy to start per tool call and don't exist in a webview.

Alternatives we looked at:

- **A new DSL or YAML with expressions:** another language to learn, document and tool. Rejected.
- **Plain TypeScript with lint rules only:** a linter can't stop a determined script, so it's no boundary. Rejected.
- **No code at all, only blocks:** stays the default, but it can't handle loops or conditions over read results.
- Runtimes: see section 2.

## 1. The profile and how it's enforced

### 1.1 What a ToolScript file is

One self-contained file, `<name>.tool.ts`, with exactly two top-level exports:

```ts
import type { UserContext } from "@halonicjs/toolscript";

export const header = {
  format: "halonic.toolscript/1",
  id: "acme.sync-release-variables",
  version: 1,
  audience: "user",
  // … see section 4
} as const;

export async function run(ctx: UserContext<typeof header>): Promise<void> {
  for (const repo of ctx.input.repos) {
    const current = await ctx.github.getVariable({ repo, name: ctx.input.name });
    if (current?.value === ctx.input.value) continue;
    await ctx.github.setVariable({ repo, name: ctx.input.name, value: ctx.input.value });
  }
}
```

A declarative ToolScript has `header.steps` and no `run`.

### 1.2 Profile rules

| # | Rule | Why |
| --- | --- | --- |
| P1 | The only import allowed is `import type` from `@halonicjs/toolscript`. No other imports, no `import()`, no `require` | no outside code; types only, erased at build |
| P2 | `header` is a **pure literal**: no calls, variables, spreads or `${}` interpolation (like a workflow's `meta`) | tools read it without running code |
| P3 | `run(ctx)` takes only `ctx`; inputs are `ctx.input` | one door in and out |
| P4 | Not allowed: `eval`; the `Function`, `AsyncFunction`, generator and async-generator constructors; `globalThis`/`window`/`self`; `with`; `Proxy`; `Reflect`; `arguments.callee`/`arguments.caller`; `Atomics`; `SharedArrayBuffer`; `WebAssembly`; `debugger`; getters or setters on `ctx`; writing to built-in prototypes | no code from strings, no reach outside, no tampering. The runtime fences cover all of these anyway (T4) |
| P5 | Not referenced: `fetch`, `XMLHttpRequest`, `WebSocket`, `setTimeout`/`setInterval`, `process`, `Deno`, `Bun`, `crypto.subtle`, `Date.now()`/`new Date()` without arguments, `Math.random` | effects and time only through `ctx` (`ctx.now()`), so tests replay exactly |
| P6 | One file, at most 300 lines; `run` follows the repo's function and complexity limits | reviewable in one sitting |
| P7 | Repo code rules apply: no `any`, no `@ts-ignore`, no `!` | same bar as our code |

### 1.3 Enforcement: two layers, and only one of them is the boundary

1. **Static check (for authors and reviewers).** `halonic toolscript check <file>` uses the TypeScript compiler API (in an adapter, see T3). It type-checks against `@halonicjs/toolscript`, walks the syntax tree for P1–P7, and checks `header` against its schema (section 4). Each failure names the rule (`P4: eval is not allowed in a ToolScript`). It runs in `pnpm check` for `*.tool.ts` files in `halonic`, in the phase 3 builder, and in the workspace's CI.
2. **Runtime (the boundary).** The isolate (section 2) enforces what matters even if the static check is skipped or fooled. The isolate has no reachable `eval` or `Function`, no network, file or timer globals, a frozen `ctx` made of host functions only, and hard limits. A fence test suite (T4) runs **known escape attempts with the static check turned off**, and each must fail inside the isolate.

### 1.4 Build: TypeScript in, one checked JS string out

Scripts are compiled **at build time, never at run time**. `halonic toolscript build` checks the file, strips types (TypeScript `transpileModule`, ES2023, ES module), and writes an **artifact**: `{ header, code, sourceHash, codeHash, profileVersion }`. Hosts run only artifacts. Following the content-addressed artifacts ADR, a host refuses an artifact whose `codeHash` doesn't match its code, and anyone can rebuild it and compare.

**Who builds the artifact.** An agent can write both a `*.tool.ts` file and an artifact next to it, so an artifact found in a workspace is never trusted:

- **Shipped catalog scripts:** built by `pnpm discover` into a generated file in `core/action-catalog`, reviewed in the same pull request as the source. CI rebuilds them and compares `codeHash`.
- **User scripts from a workspace:** **Studio builds the artifact itself from the source it showed for review.** It never loads a prebuilt artifact from a workspace. Studio desktop therefore carries the type stripper (`transpileModule` from `adapters/toolscript-check`, wired only into `studio/services`). It runs at review time, outside the isolate.
- **Agent scripts (phase 3):** the builder builds them in CI from the reviewed commit and pins each `codeHash` in the plugin manifest. The plugin host refuses an artifact whose hash isn't pinned. No TypeScript compiler ships in a cloud runtime.

## 2. The isolated runtime

### 2.1 Choice: QuickJS (quickjs-ng) compiled to WebAssembly by us, driven through `quickjs-emscripten-core`

| Option | Desktop (webview) | Node engine / plugin | Cloudflare | Memory limit | CPU limit | Boundary |
| --- | --- | --- | --- | --- | --- | --- |
| **QuickJS WASM, built by us** (chosen) | yes | yes | yes | yes, hard (fixed-size memory) | yes: the interrupt handler, and the worker's hard kill as the real limit (2.3) | its own WASM module instance per run, so its own linear memory; no host objects |
| `isolated-vm` | no | yes (native addon) | no | yes | yes | strong, but Node only |
| `node:vm` | no | yes | no | no | partial | **not a security boundary** (Node docs) |
| SES / Hardened JS | yes | yes | yes | no | no | good for capabilities, no resource limits |
| Deno subprocess | no | yes | no | yes | yes | heavy: a second runtime to ship and update |
| **Cloudflare Dynamic Worker** (Worker Loader; chosen for the Cloudflare target) | no | no | yes | platform limit per isolate | yes, Workers CPU limit | a V8 isolate of its own, with Cloudflare's second-layer sandbox; `globalOutbound: null` cuts all network |
| rquickjs in the Rust shell | yes | no | no | yes | yes | desktop only, so two runtimes |
| OS sandbox (`Sandbox` port) | no | yes | container | yes | yes | strong, but a process per call; can wrap the server host as an extra layer |

The deciding reason for QuickJS is that it **runs the same on desktop, Node and the Paperclip plugin**: Studio's webview, the Node engine and Paperclip plugin, and Cloudflare Workers. It uses no Node APIs and gives hard memory and CPU limits. We use the **sync** build with promise-based host functions (`newPromise` plus `executePendingJobs`), not asyncify.

**Board choice 13a (HAL-17781, 24 Nov 20:35 UTC):** QuickJS-ng in WASM, built by us, on every host except Cloudflare, which keeps the Dynamic Worker. **workerd** on server and desktop (13b) is the fallback, only if we ever need full V8 speed; its per-isolate limits would have to be checked in a spike first.

**How `eval` and `Function` are removed:**
- `eval` is removed by a fixed host prelude that replaces every path to the compiler with a frozen thrower, checked by the host before each run. The `Eval` intrinsic stays on because QuickJS needs it to compile the script: with `Eval` off, the context refuses every source text, the host's own included, and `quickjs-emscripten` doesn't expose loading precompiled bytecode (found in T4, decided with Julian on HAL-17650).
- The paths the prelude replaces are `globalThis.eval`, `globalThis.Function`, the `constructor` of the function, async function, generator and async-generator prototypes, and the thrower's own `constructor`. Each slot is non-writable and non-configurable; the thrower and its prototype chain up to `Function.prototype` are frozen. The prelude deletes nothing.
- The prelude runs as its own `evalCode` call, never joined to the script text. After it, the host reads every slot's descriptor back through the QuickJS API and refuses to run the script if the prelude threw or any slot is wrong, so a library update that changes the intrinsics fails closed. After the prelude, the host never calls `evalCode` on text derived from the script or its output.
- The context's intrinsics list is explicit: `Proxy`, `TypedArrays` and the bignum extras are off, and there is no module loader, so `import()` of any string is refused and `std` and `os` aren't globals.
- The fence suite tests behaviour, not mechanism: every path must throw. A unit test pins the intrinsics list and the prelude's list of paths. If upstream ever exposes bytecode loading (HAL-17651), switching to a context without the compiler needs no fence test change.

**We build the engine ourselves (HAL-17780); this is the plan, not a fallback.** The wrapper's prebuilt WASM has one maintainer and carries an older quickjs-ng than upstream, with bugs that later releases fix. So `adapters/toolscript-quickjs` builds the release-sync WASM itself from a **pinned quickjs-ng release (0.13 or later)** and the wrapper's MIT C glue, with a pinned Emscripten toolchain and a **fixed-size memory** (no growth). CI builds it twice, checks the two builds match byte for byte and that the shipped module matches the source, and a unit test pins the engine version. `quickjs-emscripten-core` stays the JavaScript API, through `newVariant`; the prebuilt `@jitl/quickjs-ng-wasmfile-release-sync` variant goes. Both are MIT-licensed. `quickjs-emscripten-core` and the build's pins (engine, glue, toolchain image) are used only by `adapters/toolscript-quickjs`, with a `dependencies.json` entry; any update reruns the fence suite and needs my dependency review. Nothing above the `ToolScriptIsolate` port changes, and everything else reaches the engine only through the `ToolScriptHost` port.

**No user runs before our build (blocks T9).** ToolScript isn't switched on for users, in Studio or anywhere else, until HAL-17780 has landed and the fence suite passes against our build. Until then the prebuilt variant is used only in tests and development.

**Isolates are never reused: one fresh WASM module instance per run** (Julian, HAL-17781). Each run instantiates the WASM module anew, with its own linear memory, then makes a new runtime and context in it; the instance is dropped when the run ends or a limit trips. The compiled module (`WebAssembly.Module`, code only) may be cached and shared; an instance and its memory never are. `quickjs-emscripten` shares one module, and so one linear memory, across runtimes by default, and then a memory bug in one run could read or corrupt another run's heap in the same host process. So the adapter never reuses a module instance, not even for a later run of the same artifact, and a fence test (T4) pins it.

**Cloudflare target: a Dynamic Worker, not QuickJS (board question, 14:11 UTC).**
- **How it works:** the Worker Loader starts the artifact's code in a new V8 isolate in a few milliseconds. We start it with:
  - `globalOutbound: null`, so it has no network at all;
  - an `env` that holds **only RPC stubs** for the run's `uses` capabilities, through Cap'n Web, with **no secret bindings**;
  - and our CPU limit.
  The parent Worker holds the keys and makes the calls (S6, S16).
- **Why it's better there:** it's a stronger boundary than QuickJS-in-WASM inside the request's own isolate, which was Julian's 3.3 point about that Worker's `env`. And it puts no extra library in the cloud bundle, so **QuickJS no longer needs `cloudRuntime: true`**, and the earlier board card about it can be closed.
- **No reuse between runs (S3):** each run is loaded under a **fresh id**, `<codeHash>:<runId>`, so the loader's cache can never hand one run's module state to the next. A fence test pins it: run 1 writes a module global, and run 2 must not see it.
- **Pinned code only:** the parent checks that the artifact's `codeHash` is pinned (1.4) before it calls the loader, and loads nothing else.
- **Cost:** it needs the Workers Paid plan. The price is $0.002 per unique Worker loaded per day, waived during the beta, plus normal CPU time. Because every run gets a fresh id, **each run counts as one unique Worker**: about $0.002 per run, so 1,000 agent tool runs a day cost about $2 a day. Reusing an id per version to save cost would need its own decision with Julian.
- **Beta risk:** the API is in open beta and may change. It sits behind the same `ToolScriptHost` port, the same fence and conformance suite must pass on it, and if it breaks or changes, the fallback is QuickJS in a secretless Worker reached through a service binding.

| Host | Runtime |
| --- | --- |
| Studio desktop | QuickJS in a Web Worker |
| Node engine, Paperclip plugin | QuickJS in `worker_threads` |
| Cloudflare target | Dynamic Worker |

### 2.2 Where it runs

| Host | Audience | Process | Kill switch |
| --- | --- | --- | --- |
| Studio desktop, page side (`studio/services` wires it) | `user` only | a dedicated **Web Worker** that holds the QuickJS instance | `worker.terminate()` when a limit trips or the stepper closes |
| Desktop or server engine (Node) | `agent` only | a `worker_threads` Worker per run | `worker.terminate()`; an OS-sandbox layer around it comes later (below) |
| Paperclip plugin (phase 3) | `agent` only | same adapter, inside the plugin process | same |
| Cloudflare target | `agent` only | a **Dynamic Worker** per run, with `globalOutbound: null` and RPC stubs only (2.1) | the platform's CPU limit; the parent drops the stub |

**The worker has no power of its own.** A WASM escape would land in the worker (3.3), so:
- **Studio:** the Web Worker loads from a dedicated script under its own CSP: `default-src 'none'; connect-src 'none'; script-src 'self' 'wasm-unsafe-eval'`. It gets no Tauri IPC, because the Tauri capability files grant the worker nothing. Its only channel is `postMessage` to `studio/services`. A worker doesn't inherit the page's `<meta>` CSP, so the CSP is sent as a response header for the worker script by Tauri's custom protocol, and a test checks it's really delivered. Because `script-src 'self'` still allows same-origin `importScripts`, the app origin serves only our own bundle.
- **Node:** the `worker_threads` worker starts with an empty `env` and no secrets in `argv` or `workerData`. The only channel is its message port, and keys stay in the parent.
- **Either way, the parent side decides (S16).** It checks every message against the artifact's `uses`, `touches` and input schemas itself, and never trusts the worker's word.

**An OS-sandbox layer around the server engine's ToolScript host comes later, as its own task.** The engine's ToolScript workers would then run inside the `Sandbox` port (`sandbox-srt` on Linux and macOS, `sandbox-mxc` on Windows) as defence in depth, with no network, a read-only file system, an empty environment and real memory and CPU caps. Where no such sandbox is available, that layer refuses to start rather than run without it. It doesn't block T9: QuickJS in a fresh module per run is the boundary on its own.

User scripts run on the **page side** on purpose. There they have no more power than the page already has: they can only ask the shell for catalog steps through `ActionSender` (HAL-17491 2.4). They never run in the engine process, which must never hold `ActionSender`.

### 2.3 Limits (defaults; a header may only lower them)

| Limit | User script | Agent tool |
| --- | --- | --- |
| Memory (QuickJS heap) | 32 MB | 32 MB |
| Stack | 256 KB | 256 KB |
| CPU time inside the isolate | 2 s in total; waiting on `ctx` or the user doesn't count | 2 s |
| Wall clock | open-ended while the stepper is open (6.7: foreground only) | 60 s |
| `ctx` calls | 100 | 50 |
| Input, output, `ctx.log` | input 16 KB, output 64 KB, log 200 lines of 300 characters | same |
| Memory on the Cloudflare host | the Workers platform limit per isolate (128 MB) applies instead of 32 MB; the host reports it as `limit.memory`, and the conformance suite expects whichever limit the host declares | same |
| Arguments to one `ctx` call, after the plain-data copy (S15) | 8 KB, at most 8 levels deep, arrays of at most 100 items | same |
| Pending promises | 32 | 32 |

**The CPU limit is a hard kill of the worker.** The interrupt handler stops a script at its next check, but long native operations (a regex, a sort, building a big string) check it rarely or not at all. So in every host, the plugin included, the parent also counts the time the isolate is running (not waiting on `ctx` or the user) and **terminates the worker** (`Worker.terminate()` or `worker_threads` `terminate()`) once the CPU limit plus a short grace has passed, whatever the isolate is doing. On Cloudflare the platform's CPU limit is that hard kill.

When a limit trips, the run stops with a named reason (`limit.cpu`, `limit.memory`, …) that goes into the record, and the host throws the isolate away. Nothing is retried on its own. **No outside libraries:** the only code in the isolate is the script and a fixed prelude of our own (`ctx` wiring, frozen). Lodash, an SDK or anything else can't be bundled in, because P1 refuses imports and the builder bundles nothing.

## 3. The `ctx` capability model and keeping user and agent apart (Julian signs this section)

### 3.1 Capabilities

A **capability** is one reviewed operation with a typed input schema, a typed and trimmed result, a risk level, a preview sentence and **exactly one audience**:

- **User capabilities are catalog step types, nothing new.** Each is a one-step definition in `core/action-catalog` (HAL-17491 7.1), such as `github.set-variable@1` or `cloudflare.add-dns-record@1`. In a script it's `ctx.github.setVariable(…)`. The call goes through `ActionSender` to the shell, which sends it only if it's on the generated route list, with the user's keychain token. **ToolScript adds no route, origin or path prefix.** The route list is still generated from step types alone.
- **Agent capabilities are the phase 3 runtime's reviewed actions**, such as `paperclip.comment`, `paperclip.task-get`, `github.pr-checks` and `stepper.request`, with credentials held in the plugin's settings or the engine's secret port.
- **Shared plain helpers** (`ctx.input`, `ctx.log`, `ctx.now`, `ctx.fail`) have no effect outside the isolate and exist for both audiences.

A service's sign-in, account check and test revoke are not capabilities: they run through `ActionSender` or `ServiceSignIn`, never through `ctx` (Liam, HAL-17545).

### 3.2 Separation rules

| # | Rule | Enforced by |
| --- | --- | --- |
| S1 | Every capability has exactly one audience. User and agent capabilities live in separate folders and separate generated registries (`user-capabilities.ts` and `agent-capabilities.ts`). An id in both registries, or a capability whose folder doesn't match its audience, fails `pnpm check` | discovery and `pnpm check` |
| S2 | `UserContext` and `AgentContext` are distinct types built from those registries, so `ctx.github.setSecret` doesn't exist on an `AgentContext` | the editor and the static check (help only) |
| S3 | A header lists every capability it uses in `uses`. The check refuses a capability of the other audience. **At run time** the host builds `ctx` anew for each run, with only the methods in `uses`, all from its own audience's registry, and `Object.freeze`s `ctx` and each namespace. Isolates are never reused (2.1; on Cloudflare, a fresh loader id per run), so a prototype write or a module global in one run can't reach another | static check, then the runtime |
| S4 | A host runs **one audience only** and refuses an artifact of the other (`toolscript.wrong-audience`). The Studio host has no agent registry; the engine, plugin and target hosts have no user registry | the runtime |
| S5 | **Dependency wall.** `core/engine`, `adapters/harness-bridge`, the phase 3 plugin runtime, `host/*` and `targets/*` may not import the user registry, `ActionSender`, `ActionRecords` or `adapters/action-send-tauri`. This extends HAL-17491 4.3's "can only file" test, and `studio/services` stays the only importer. The `toolscript*` packages themselves import neither registry: a host gets its registry from the wiring | `pnpm check` rule |
| S6 | **No credential enters the isolate.** Host functions add tokens outside it, and a result holds only the capability's declared fields. Neither the isolate nor its `ctx` has a way to read a token | runtime and fence tests |
| S7 | **Secrets are handles, unforgeable and bound to their destination.** `ctx.input.secret("value")` returns a handle: a random id made per run and looked up in a **host-side table**, never an object the script could rebuild. It's accepted only in fields that a capability declares `secret`, and only in the run that made it. A forged, foreign or expired id is refused (`toolscript.bad-handle`). The script can pass a handle on but can't read, compare, log or return it. The user types the value in the shell's native dialog, which **names the destination from the frozen arguments** (S9): the step type, the repo or zone, and the secret's name. So a script can't steer a typed secret somewhere the user didn't expect | runtime, Rust shell tests |
| S8 | **The only bridge from agent to user is filing.** An agent script may call `ctx.stepper.request(…)`, which files a `halonic.stepper-request/1` through the engine (HAL-17491 7.2) and returns its id. No agent capability runs a user step, or waits on one and gets the user's token or result beyond the folded answer. If the request names a workspace user ToolScript, S10's review-on-change applies **when the user opens the request** (an agent may have just edited it). The request's parameters are checked against that script's `inputs` schema before any preview | registry review, the S5 test, Studio |
| S9 | **The user confirms exactly what runs.** Reads (`check` step types) run without asking. For each write, the host first **deep-copies the arguments out of the isolate into plain host data** (S15) and freezes them. The preview is built from that frozen copy with the step type's own preview (from the catalog, never the script's words), and **exactly that copy is sent**, with no call back into the script between confirmation and sending. `admin` and `irreversible` steps use the shell's native dialog, as today. `ctx.batch([...])` gathers several writes into one frozen list shown as one preview. A `routine` batch is confirmed in the page. A batch with any `admin` item is confirmed in the native dialog, which lists every item. A batch may not contain an `irreversible` item: those are confirmed one at a time, outside any batch (`toolscript.irreversible-in-batch`) | `core/toolscript` service, shell, stepper screen |
| S10 | **Trust covers the code that actually runs.** User scripts run only from (a) the shipped catalog (reviewed like a definition, as a security change; artifact rebuilt in CI), or (b) the user's own workspace. For (b), **Studio builds the artifact itself** from the source (1.4) and never loads a prebuilt one. The trust entry in the instruction trust store (ADR 2026-11-15) holds the **source hash, `codeHash`, `uses`, `touches` and `risk` together**. A change to any of them asks for review again, because agents can edit workspace files. The review screen shows **the TypeScript source**, not the stripped JS. Agent scripts come from the workspace through review (phase 3), with each `codeHash` pinned by the builder. **Agent-written scripts are drafts** (7.3): a draft never runs scripted API steps until it's reviewed, and an agent draft doesn't run at all. Promoting a draft binds the trust entry to the **reviewed** hash, not the draft's | trust store, Studio build, builder, ADR |
| S11 | Script text never becomes trusted text. `ctx.log`, results, errors and the header's `guide` are shown or returned as plain, capped, untrusted text (like HAL-17491 4.2), labelled "from the script", and can't change a preview's wording | the stepper screen, the tool result path |
| S12 | An agent tool's result goes back to the model as **data**: capped at 64 KB, structured, never as instructions or with extra system text | the agent host |
| S13 | Records follow the allow-list of HAL-17491 4.2. They add the artifact's `codeHash` and the capability ids called, never input values marked `secret`. Limit and error reasons are a fixed code (`limit.cpu`, `toolscript.bad-handle`, …) plus at most the S11-capped message. A QuickJS error `stack` is cut down to the script's own frames, with no host function names or paths | the record schema test |
| S14 | **Declared effects, so the preview and guide stay static** (Tomas, HAL-17488). A `user` header declares `touches`: for each write capability in `uses`, the target templates it may touch, built only from `inputs` (e.g. `github.set-variable@1` on `repo: {input.repos[]}`, `name: {input.name}`). Before anything runs, Studio shows the full touches list from the header and the input values, the same way it shows a stepper's. At run time the `touches` templates are matched against the **S15 frozen copy** of the arguments (the same data the preview uses), never against values still inside the isolate. A call whose target isn't covered is refused (`toolscript.undeclared-target`) before any preview. A test per script compares its recorded calls with its header. The manual guide lists the declared touches with each step type's `manual` form | header schema, runtime, tests |
| S15 | **Arguments cross as plain data only.** The host copies each `ctx` argument out of the isolate itself: only `null`, booleans, finite numbers, strings, plain arrays and plain objects with own data properties (no getters, no accessors, no prototypes other than `Object.prototype` and `Array.prototype`), within the 2.3 per-call cap. It calls **no function in the isolate** while copying: no getter, `toJSON`, `valueOf`, `Symbol.toPrimitive` or `Proxy` trap. Anything else is refused (`toolscript.bad-argument`). `ctx` methods ignore `this`. A saved `ctx` method called after the run ended, or after a limit tripped, does nothing: the isolate is gone, and no host promise resolves into it. **On the Cloudflare host**, where Cap'n Web passes functions and objects by reference, the parent refuses any argument that is or contains an RPC stub, a function or a promise (`toolscript.bad-argument`). It never calls or awaits anything from the script, neither while building the preview nor between confirmation and sending. Results go back to the script as plain data only, never as stubs | runtime, fence tests |
| S16 | **The parent side decides.** The worker that holds the isolate has no network, IPC or secrets (2.2). `studio/services`, the Node parent, or **the Cloudflare parent Worker**, checks every call against the artifact's `uses`, `touches`, the capability's input schema, the S15 copy and the run's handle table itself, and never trusts the isolate's word. On Cloudflare, each capability's RPC stub does these checks itself. Stubs are made for one run and **revoked** when the run ends or a limit trips, so a saved stub does nothing | Studio services, Node host |
| S17 | **Reviewed UI, but the capability's own words stay.** The header's `ui` (4.2) lays out the form, the preview, the confirm text and the result card from OpenUI components, and its wording is reviewed with the code. Every write's preview **always includes the capability's own preview lines from the frozen arguments** (S9), as a block the header can't hide, reorder away or reword. `admin` and `irreversible` confirmations stay in the shell's native dialog with the capability's wording. Header text comes only from the reviewed artifact, never from inputs or results (`{input.x}` values are inserted as plain text). Unreviewed drafts show their `ui` text under "from the script, not reviewed". **Buttons:** the header may define only the confirm and cancel buttons, with their labels. No button carries a URL, a capability or an action of its own. A chat-reply button (A3) or a phone tap (A4) **opens the S9 flow**; it never sends anything itself. **Fallback:** a renderer that can't show the capability preview block offers no confirm button, and a fallback to the guide text never drops that block. **Input values in header text** are shown on one line, capped at 200 characters, with no OpenUI or Markdown markup, so an input can't draw a fake capability block. The `result` card's values come from results and keep the S11 "from the script" label | header schema, renderer, S10 |

### 3.3 Leftover risk, said plainly

- A trusted **user script with a logic bug** can make many reviewed writes. Answers: S9's per-write preview, the limit of 100 calls, and `irreversible` confirmed one at a time.
- An **agent tool** composes the agent's own powers. It can do nothing the agent couldn't do with two tool calls, but it can do them without the model seeing the step in between. Answers: S3 makes `uses` part of the review, and the phase 3 rule that tool changes need Liam (and Julian for keys, permissions and network) still applies.
- **QuickJS bugs**: a WASM escape still lands in the host's worker, which has only the capabilities wired for that audience. On the server an OS-sandbox layer goes around the engine's ToolScript host later, as its own task (2.2).
- **Cloudflare:** answered by the Dynamic Worker host (2.1). The loaded isolate holds only RPC stubs and no secret bindings, and it can't reach the network. Until that host passes the fence suite (T11), agent ToolScripts don't run on the Cloudflare target.

### 3.4 The stepper's five properties hold for `audience: user` (Tomas, HAL-17488)

| Property (HAL-17491) | How ToolScript keeps it |
| --- | --- |
| 1. The shell sends only reviewed calls (2.4) | each user capability is one catalog step type, sent through `ActionSender` and checked by the shell against the same generated route list. There is no `ctx.http` for `user` (S1, S3), and ToolScript adds no route |
| 2. The preview and guide are static (1.2, 7.8) | `touches` in the header (S14); undeclared targets are refused at run time; a test compares calls with the header; the guide is built from the header |
| 3. Secrets never reach the script (1.2, 2.4) | handles in a host-side table, typed in the native dialog that names the destination (S7) |
| 4. Risky steps are confirmed outside the page (6.4) | `admin` and `irreversible` steps, and any batch with an `admin` item, are confirmed in the shell's native dialog from the frozen arguments, whatever the script does (S9) |
| 5. Foreground only (6.7) | the worker lives only while the stepper is open; closing it terminates the worker and the run; nothing continues in the background (2.2) |

## 4. File format and header

The header is shared by the approvals stream, the phase 3 builder, the manual guide and Studio. Its schema lives in `core/toolscript` as a Zod schema built with `schema-kit`, strict: unknown keys are refused.

| Field | Type | Notes |
| --- | --- | --- |
| `format` | `"halonic.toolscript/1"` |  |
| `id` | `<namespace>.<name>`, lower case, dots and dashes | namespace `halonic.` is reserved for the shipped catalog |
| `version` | integer ≥ 1 | the major version. A request names `id@version`, as with definitions |
| `audience` | `"user"` or `"agent"` |  |
| `title`, `summary` | plain text, ≤ 80 / ≤ 300 characters | shown in the Inbox, the tool list and the guide |
| `risk` | `routine`, `admin` or `irreversible` | at least the highest risk of anything in `uses`; the check computes and compares |
| `inputs` | map of name → `{ type: string, integer, boolean, enum or list, pattern?, values?, secret?, description }` | declarative and turned into a strict Zod schema; every string needs a `pattern` or `values`; `secret` only for `user` |
| `outputs` | same form, optional | for agent tools, what the model gets back |
| `uses` | list of `capability@version` | S3 |
| `touches` | `user` only: per write capability in `uses`, the target templates it may touch, from `inputs` only | S14; part of the trust entry (S10) |
| `steps` | list of `halonic.stepper-request/1` blocks (`use`, `step`, `browser`) with `{input.name}` placeholders | declarative; can't be used together with `run` in v1 |
| `guide` | `{ intro?, perStep?: { [capability or block index]: text } }` | extra wording for the manual guide; the guide itself comes from `renderManualGuide` (HAL-17491 7.8) using each capability's own `manual` form |
| `limits` | optional, lower only | section 2.3 |
| `tool` | agent only: `{ name, description }` | the short tool name and the description the model sees (phase 3) |
| `ui` | optional: `form`, `preview`, `confirm`, `result`, each built from OpenUI components | 4.2 and S17 |
| `examples` | optional: named input sets with the expected calls | dry runs and test fixtures (section 7.4) |

### 4.2 UI and wording in the header (board, 14:00 UTC)

The header's `ui` section says how the action looks and reads, using only the four **OpenUI components** (HAL-17107): `card`, `table`, `form` and `buttons`. Like the rest of the header, it's a pure literal.

- **`form`:** the order of the inputs, their labels, help text and widgets. The kind of field comes from the input's type.
- **`preview`:** a card or table that explains what will change. The capability's preview block is always added after it (S17).
- **`confirm`:** the button label and a short sentence.
- **`result`:** a card built from `outputs` and the kept fields.

Every renderer reads the same `ui`: the Studio stepper, an Inbox item, a chat reply (OpenUI buttons) and the phone app. So one reviewed action looks and reads the same everywhere. A renderer that can't show a component falls back to the manual guide's text, but never drops the capability preview block, and if it can't show that block it offers no confirm button (S17). The wording lives in the header, so a wording change is a reviewed change. When we translate later, the strings get keys, but they stay in the reviewed file.

### 4.3 How each consumer reads it



- **The approvals stream:** a user ToolScript is listed in the catalog like a definition. A `halonic.stepper-request/1` names it in a `use` block (`acme.sync-release-variables@1` plus parameters), so the request format doesn't change. The manual guide for a scripted ToolScript lists the capabilities in `uses` with their manual forms and the script's `guide` text, and says plainly that the order depends on what the reads return.
- **The phase 3 builder:** a `*.tool.ts` with `audience: "agent"` becomes a tool in the plugin manifest (`tool.name`, `tool.description`, `inputs` as its parameters). Its artifact is bundled as data and run by the plugin runtime's ToolScript host. **This changes the phase 3 rule** "the builder copies no code from the workspace" to "**workspace code enters only as ToolScript artifacts run in the isolate, with only reviewed actions**". The plan's principle, that a workspace can never grant itself a new power, still holds.

## 5. Repo: packages in `halonic` (board, 15:20 UTC)

The board chose the monorepo on 24 Nov at ~15:20 UTC (HAL-10), replacing its 14:28 choice of an own repo. The empty private `halonic-com/toolscript` is **archived**: that's reversible and keeps the name if we split the core out after 1.0. T0 (HAL-17588) is cancelled.

**Why:** one PR per change, no npm release (and no board card) between the core and its users, one CI and one leak guard, and no stand-alone brand next to the other "Toolscript" projects (8.1).

**What lives where.** The core packages are **capability-agnostic**: they know how to check, build, run and show a script with a given capability registry, but not which capabilities exist. Each is made with `pnpm new package`, so it gets its own `AGENTS.md` and passes every check.

| Package | Layer | Holds | Task |
| --- | --- | --- | --- |
| `packages/core/ports` | core | the `ToolScriptHost` port: run an artifact with an audience, a registry, inputs and limits; get the output or a fixed reason code | T1 |
| `packages/core/toolscript` (`@halonicjs/toolscript`) | core | header schema (with `ui`, `touches`, `examples`), `UserContext`/`AgentContext` over a registry, the artifact format, the `toolscript-index/1` format and search ranking | T2, T10 |
| `packages/core/toolscript-host` | core | the `ctx` host: S3, S7, S9, S14–S17, over any isolate; no timers or vendor code | T5 |
| `packages/adapters/toolscript-check` | adapter | the P1–P7 checker and the reproducible build, with the TypeScript compiler API | T3 |
| `packages/adapters/toolscript-quickjs` | adapter | the QuickJS isolate, on any runtime with WebAssembly; implements `ToolScriptHost` with `core/toolscript-host` | T4, T5 |
| `packages/adapters/toolscript-quickjs-node` | adapter (Node) | that isolate in a `worker_threads` worker per run (2.2), with the hard kill of 2.3; for now without host functions, for rule steps | S11c (HAL-18669) |
| `packages/adapters/cloudflare-toolscript` | adapter | the Dynamic Worker host on the Cloudflare target | T11 |
| `packages/testing/contracts` | testing | `FakeToolScriptHost` and the `ToolScriptHost` contract every host passes | T1 |
| `packages/testing/toolscript-fence` | testing | the fence suite (T4 list), run against every isolate with the static check off | T4 |
| `apps/cli` | apps | `halonic toolscript check`, `build`, `guide`, `test`, `index` and `search`, as thin commands | T8, T10 |
| `tooling/check` | tooling | the S1 and S5 rules | T9 |

**Next to them, in the same repo:** the capability registries and their implementations (catalog step types for `user` in `core/action-catalog`, phase 3 actions for `agent`), the Studio, engine and Paperclip plugin wiring, and the **library** of reviewed scripts next to the capabilities they call (section 7).

**Rules that keep it modular:**
- Only `adapters/toolscript-check`, `adapters/toolscript-quickjs` and `adapters/cloudflare-toolscript` hold vendor code (the TypeScript compiler, `quickjs-emscripten-core` and our quickjs-ng build, the Workers API), each with a `dependencies.json` entry and my approval.
- The engine, Studio, targets and the plugin reach a run **only through the `ToolScriptHost` port**; the wiring (`studio/services`, the Node and Cloudflare targets) picks the adapter.
- Below that port, an isolate is reached through the `ToolScriptIsolate` port in `core/ports`: one fresh isolate per run, given code, input, host functions by namespace and limits, giving back output or a fixed reason. `adapters/toolscript-quickjs` and `adapters/cloudflare-toolscript` implement it, `core/toolscript-host` builds on it, and `testing/toolscript-fence` runs against it.
- No `toolscript*` package imports a capability registry; registries are passed in (S1, S5).
- A new package and a change to the port are core building blocks, so I give final approval; T4, T5, T9 and T11 are security PRs (Julian signs).
- The core ships with Halonic's normal releases. There's no separate npm release and no standing 0.x ask.

## 6. Task split (one task per PR) and what the approvals stream does meanwhile

**Core, in `halonic`** (T1 first; T0 is cancelled):

| # | Task | PR | Owner | Blocked by | Done when |
| --- | --- | --- | --- | --- | --- |
| T0 | HAL-17588 | cancelled: the board chose the monorepo | Mateo | – | – |
| T1 | HAL-17566 | this ADR as `docs/adr/2026-11-24-toolscript.md`, the `ToolScriptHost` port, `FakeToolScriptHost` and its contract | Liam | none | the ADR merged; `packages/adapters/memory/src/fake-tool-script-host.test.ts` runs `toolScriptHostContract` against `FakeToolScriptHost` and passes; `pnpm check` passes |
| T2 | HAL-17567 | `core/toolscript`: header schema (with `touches`, `ui`, `examples`), types, artifact format | Maya | none | `packages/core/toolscript/src/header.test.ts` covers strict keys, risk ≥ `uses`, no `secret` for `agent`, `steps` and `run` exclusive, `ui` only from the four components, and `touches` only from `inputs` |
| T3 | HAL-17568 | `adapters/toolscript-check`: rules P1–P7, reproducible build | Elena | T2 | one fixture per rule yields exactly that rule's message; the test `build-is-reproducible` passes |
| T4 | HAL-17569 | `adapters/toolscript-quickjs` (the isolate) and `testing/toolscript-fence`, **security PR** | Mateo | T1 | the T4 fence list below passes with the static check off |
| T4b | HAL-17780 | our own quickjs-ng WASM build (2.1) in `adapters/toolscript-quickjs`, **security PR** | Mateo | T4 | the fence suite passes against our build with the static check off; a unit test pins the engine version (0.13 or later) |
| T5 | HAL-17570 | `core/toolscript-host`: `ctx` by audience, handles, frozen arguments, batches, `touches`, the `ui` preview block; `adapters/toolscript-quickjs` implements `ToolScriptHost` with it, **security PR** | Priya | T2, T4 | tests for S3, S4, S7, S8, S9, S14–S17 pass against an `acme` registry; the `ToolScriptHost` contract passes against `adapters/toolscript-quickjs` |
| T8 | HAL-17573 | `halonic toolscript check`, `build`, `guide`, `test`; `docs/guides/toolscript.md`; `examples/acme/tools/` | Maya | T3 | `pnpm exec node apps/cli/bin/halonic.js toolscript check examples/acme/tools/bad-eval.tool.ts` prints `P4: eval is not allowed in a ToolScript` and exits 1; `guide` prints the pinned guide |
| T10 | HAL-17589 | library index and search: the `toolscript-index/1` format and ranking in `core/toolscript`, `halonic toolscript index` and `search`, the agent skill text | Owen | T2, T8 | `index` on `examples/acme/tools/` writes the pinned `toolscript-index.json`; `search "release variable"` returns `acme.sync-release-variables@1` first with its declaration |
| T11 | HAL-17590 | `adapters/cloudflare-toolscript` (Dynamic Worker host), **security PR** | Ravi | T4, T5 | the fence suite and the `ToolScriptHost` contract pass against the Dynamic Worker host in `wrangler dev` (local, no network); a script calling `fetch`, `connect()` from `cloudflare:sockets` or a remote `import` fails with `toolscript.no-network`; the parent refuses an unpinned `codeHash` before calling the loader; a module global from run 1 isn't visible in run 2 |

**T4 fence list:**
- `eval`, and `Function` through `.constructor` of a function, async function, generator and async generator, and of the thrower itself;
- the prelude (section 2.1): a forced prelude failure means the script never runs; after a script that tries `defineProperty`, `delete` and assignment on every replaced path, each slot still holds the same thrower and is non-writable and non-configurable;
- `import()` of a `data:` URL or any other string is refused; `std`, `os`, `Proxy`, typed arrays and bignum are `undefined`;
- `globalThis` probing; `Reflect` and `Object.getPrototypeOf(ctx)`;
- prototype writes; another `this`; a `ctx` call after the run ends or after a limit trips;
- getters, `Proxy`, `Symbol.toPrimitive`, `toJSON` and `valueOf` in arguments;
- an 8 KB argument cap; forged handles and another run's handles; reading a secret handle;
- the limits for CPU, memory, stack, promises and output; a long native operation (such as a catastrophic regex) is stopped by the worker's hard kill within the CPU limit plus the grace;
- **a fresh WASM module instance per run:** run 1 writes a global and a value in its heap, and run 2 in the same host process sees neither; the adapter never starts a run on a module instance that already ran one;
- the worker CSP, including `importScripts` of a `blob:`, `data:` or remote URL;
- an empty Node `env`;
- on the Cloudflare host: an argument that is or contains a stub, function or promise (`toolscript.bad-argument`), a stub saved and called after the run ends, a module global set in run 1 and read in run 2, and `fetch`, `cloudflare:sockets` `connect()` and a remote `import` (`toolscript.no-network`).

**Halonic integration:**

| # | Task | PR | Owner | Blocked by | Done when |
| --- | --- | --- | --- | --- | --- |
| T9 | HAL-17591 | wiring (the first time users can run ToolScript): `studio/services` (user host) and the Node target (agent host) pick `adapters/toolscript-quickjs`; the S1 and S5 checks in `tooling/check`; the agent tool `toolscript_search` in `harness-bridge`, **security PR** | Priya | T5, T10, T4b (HAL-17780) | the S1 rule fails on a fixture with one id in both registries; the S5 rule fails on a fixture importing `ActionSender` from `core/engine`; `toolscript_search` finds the `acme` example |

**Adopt Halonic ToolScript** (one task per consuming track, all blocked by T9):

| # | Task | Track | Owner |
| --- | --- | --- | --- |
| A1 | HAL-17571 | approvals stream: scripted stepper actions, setup wizards, server runbooks | Tomas |
| A2 | HAL-17572 | phase 3: agent tools and no-model workflow steps | Tomas (phase 3 lead) |
| A3 | HAL-17592 | OpenUI: chat-reply buttons that run a reviewed action | Elena |
| A4 | HAL-17593 | apps phase 2: one-tap approvals on the phone | Liam (phase 2 plan) |
| A5 | HAL-17594 | Halonic Code: build, test and deploy actions | Ravi |
| L1 | HAL-17595 | later: a shared public action library for other users | Maya (backlog) |

**The approvals stream meanwhile** (unchanged): declarative steps and `halonic.stepper-request/1` go ahead now. A ToolScript is named in a `use` block, so the format doesn't change. Scripted steps wait for A1.

## 7. The library, and how agents find it (board, 13:36 UTC)

I agree with Chief's proposal, with these specifics.

### 7.1 Where it lives

| Kind | Where | Reviewed by |
| --- | --- | --- |
| Generic actions on Halonic's capabilities (GitHub, Cloudflare, npm, Paperclip, …) | `halonic`, next to the capabilities: `packages/core/action-catalog/scripts/` (user) and the phase 3 runtime's `library/` (agent) | Liam, plus Julian for keys or writes |
| Company-specific actions | `halonic-com/workspace-company`, `tools/` | the same, through that repo's PRs |
| A user's own actions | their workspace's `tools/` | the user, through Studio's code review (S10) |
| Examples of the format | `halonic`, `examples/acme/tools/` | Liam |

### 7.2 How agents find it

- `halonic toolscript index` writes a **`toolscript-index.json`** (format `toolscript-index/1`) for each source. Each entry has the id, version, title, summary, audience, inputs, `uses`, `touches`, `codeHash` and a **generated TypeScript declaration** of how to call it. Halonic ships the index of its own library; `pnpm discover` writes a workspace's index.
- Agents search with **`toolscript_search { query, audience? }`**: in Studio's build agent through `harness-bridge`, and in Paperclip through the phase 3 plugin. It returns the best matches with their declarations, so the model sees exact types instead of prose (an idea from toolscript-mcp's `search_tools`).
- A short **skill**, "Find or make a Halonic ToolScript", tells agents the order: search first; reuse as is; or copy the closest one and adapt it; only then draft a new one.

### 7.3 Made on the fly: only as a draft

- An agent **may write a new script, but it's a draft.** What a draft may do depends on its audience:
  - **`user`:** until it's reviewed, only its declarative steps run, exactly like an on-demand request today. Each `use`/`step` write still goes through S9, one write at a time, and `browser` steps open only origins and path prefixes the catalog allows.
  - **`agent`:** an unreviewed draft **doesn't run at all**. The engine and the plugin run only pinned `codeHash`es.
- Scripted API steps run only after review: a PR to the library or the workspace (Liam, plus Julian for keys or writes), or for another user's own workspace, that user's code review in Studio (S10).
- **Why:** a reviewed action is checked once and then trusted by its hash every time. An on-the-fly script would need the user to read code each time, and the board shouldn't have to.
- **Agent code mode is a separate later option** (8.2). It covers only agent capabilities and never the user side.

### 7.4 Versions, dry runs, tests and the run log

- **Pinning:** a workspace pins what it uses in **`toolscript.lock`** (`id@version` → `codeHash`). An update arrives as a reviewed bump: a PR, and for Paperclip, the phase 3 plugin release.
- **Dry run:** `halonic toolscript test <file>` runs the header's `examples` against recorded capability answers. It shows the calls the script would make, compares them with `touches` (S14), and never sends anything. The same recordings are the script's unit tests.
- **Run log:** each run records its id, the `codeHash`, the capability ids called, its outcome and the fixed reason codes (S13). For user scripts this goes in the per-request record (HAL-17491 4.2); for agent tools, in the run's events. That gives an audit trail of every run.

## 8. Prior art: toolscript-mcp and Cloudflare Code Mode (board, 14:07–14:11 UTC)

### 8.1 toolscript-mcp

[yeeyon/toolscript-mcp](https://github.com/yeeyon/toolscript-mcp) is MIT-licensed and published on npm as `toolscript-mcp`. It's "code mode" for MCP: the model writes one JS program that calls other MCP tools, and only the result goes back into the context.

- **Name:** "ToolScript" is taken on npm and GitHub. The board's working name is **Halonic ToolScript**. Our packages are scoped (`@halonicjs/toolscript*`), so there's no clash on npm, and the docs always say "Halonic ToolScript".
- **Isolation:** its README says its Node `vm` sandbox "is not a security boundary by itself". That confirms our choice: Node `vm` or permission flags aren't enough for user-only actions with keys, so we use a real boundary (2.1).
- **Ideas we take, not its code:** typed declarations shown to the model (7.2), a search step over the library (7.2), and code mode itself (8.2).

### 8.2 Code mode for agents, later (the 2K model-mix goal)

**What it is:** in code mode, an agent writes one short program that calls several **agent** capabilities, and only the result goes back into its context. Cloudflare reports up to 81% fewer tokens, and toolscript-mcp 27–69%.

**What it would take:**
- the same isolate and host;
- only agent capabilities explicitly marked `codeMode: true` (reads first);
- never `audience: user` and never secrets;
- the usual limits;
- a run record like any tool call.

**Why it fits:** it adds no power. The agent could make the same calls one by one (3.3).

**On Cloudflare** it would run in our Dynamic Worker host. We borrow the idea; we don't need `@cloudflare/codemode`.

**Not in v1:** it gets its own short decision, with Julian, once T5 and T11 have landed. That decision must include:
- `codeMode: true` as a reviewed flag per capability, reads only at first;
- a note on prompt injection: a read result can steer the rest of the program without the model seeing the step in between (3.3). I'll add it to the 2K goal's backlog as a candidate.

## Consequences

- One header and one host for both audiences; two runtimes (QuickJS-ng built by us, and a Dynamic Worker on Cloudflare) that pass one fence suite. Authors use their normal TypeScript tools.
- What a user can be asked to run is still bounded by the catalog's route list, and what an agent tool can do is still bounded by the reviewed actions. ToolScript adds composition, not power.
- No second repo: the core uses `halonic`'s CI, guard, review rules and releases (section 5).
- New reviewed surfaces: our QuickJS-ng build and its pins, the Dynamic Worker host, the `ui` renderer, the fence suite, the S5 dependency wall, and the capability registries (changing a capability is a security review, as for a step type).
- It changes the phase 3 rule on workspace code (section 4) and adds the instruction trust store to user scripts from workspaces.
- We own the engine build: each quickjs-ng update is our job (a pin bump, a rebuild and the fence suite), not the wrapper's.
- Harder: QuickJS is slower than V8 (fine for orchestration that is mostly waiting on `ctx`), and the manual guide for a branching script can only list what it may do, not the exact order.
