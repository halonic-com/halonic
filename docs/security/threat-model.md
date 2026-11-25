# Threat model

What Halonic protects, from whom, and where the lines are drawn. Read it before
you change anything that touches a boundary in [section 3](#3-trust-boundaries).
To report a problem, see the [security policy](../../SECURITY.md).

Every mitigation carries one of these marks, or one per part when only part of
it is built:

- **On `main`**: the code is merged and tested. It protects you today only
  where the row names the `halonic` command-line tool (`apps/cli`) or code it
  calls. A row that names `apps/studio` or `apps/agent-host` is in an app that
  doesn't ship yet; the rest is library code that no app uses yet (see
  [section 1](#1-scope)).
- **Lands with #n**: built in an open pull request, not merged yet. Until it
  merges, read it as **Planned**.
- **Planned (HAL-n)**: decided, not built. Don't rely on it. The number is the
  task that builds it.
- **Probed**: no code of ours; a probe on a real machine showed the platform
  refuses the attack. It holds only on the system the row names, and the row
  names the probe.

A **known limit** is a risk we accept and say so. Nothing on this page is a
promise about a mitigation marked **Planned**.

## 1. Scope

Halonic is a local-first app. The Studio and the `halonic` command-line tool
are designed to run on your own machine, as you. On `main` there are three
apps:

- `apps/cli`, the `halonic` command. It is part of 0.1, run from source. It
  validates, trusts, runs and tests workspaces, and checks the sandbox before a
  run.
- `apps/studio`, the desktop app. It is being built and doesn't ship yet. It
  opens a folder as a workspace and checks its trust the way the CLI does (see
  [4.1](#41-workspace-code-b1)).
- `apps/agent-host`, the program that runs the sandbox for Studio. Studio's
  shell starts it on the first call to it (see
  [4.6](#46-agents-in-a-sandbox-b8)).

An **On `main`** item is code that is on `main`. Whether you have it today
depends on the app. The CLI uses the trust check in
[4.1](#41-workspace-code-b1) and the run log in
[4.2](#42-model-output-and-content-b2) now. Studio's **On `main`** rows are code
on `main` that you get once Studio ships. The rest is tested code that no app
calls yet.

| Shape | Who can reach it | Status |
| --- | --- | --- |
| `halonic` on your machine | you, and programs running as you | Part of 0.1, run from source |
| Studio on your machine | you, and programs running as you | Being built (phase 1, plan HAL-9). Not shipped |
| `halonic serve` on loopback | programs and web pages on your machine | On `main`, run from source (phase 4, plan HAL-9) |
| `halonic serve --network` on a LAN | everyone on that network | On `main`, run from source (`cli.commands.serve.serve`, which needs a password). Treated as public |
| `serve` through a tunnel or on a VPS | the internet | Planned (phase 4). Treated as public |
| Cloud deployments (Cloudflare, containers) | the whole internet | Library code on `main`; no command deploys yet. See [section 6](#6-cloud-deployments-b7) |

One deployment has **one owner**. Several users on one deployment are out of
scope. That needs its own section here first.

## 2. Assets and attackers

What we protect, most valuable first:

| Asset | Where it lives | If lost |
| --- | --- | --- |
| Deploy credentials for a cloud account | OS keychain on the owner's machine | Planned. Total control of a cloud deployment |
| Model provider keys, Google client secret and refresh tokens | configured secrets; the token store | spend on your accounts; your mail and Drive |
| Sign-in password hash and session tokens | the hash in the profile's secrets as `serve-password`; the session hashes in `Coordination` | full control through the API |
| Run logs, inbox items, records, files a run made | the data folder | privacy breach |
| Workspace definitions (agents, workflows, connectors) | the workspace folder, usually a git repository | changing them changes what runs with your keys |
| Your money: model spend, cloud bill | not stored | direct cost |

Who we defend against:

| Attacker | What they can do |
| --- | --- |
| A malicious or careless **workspace** (cloned, shared, a dependency) | define connectors, routines, workflows and prompts; ask for programs to run |
| **Untrusted content** that reaches a model: mail, documents, web pages, tool results, tool listings | steer the model's output and so its tool calls |
| A **server you connect to** (MCP server, integration backend) | write the names and descriptions of its tools; return anything |
| A **plugin** you add, often written by someone else | ship a backend, programs and text Studio draws; change its files after you trust it |
| A **harness program** (Claude Code, Codex) steered by that content, or a careless command it runs | run any command in its sandbox, as you, and try to reach out of it |
| A **malicious web page** you visit | make your browser send requests to `localhost` and your network |
| **Anyone on the internet**, once something listens publicly | send any request, at any rate |
| A **leaked key or token** | everything its scopes allow |
| A **malicious contributor or dependency** | open pull requests, publish a bad package |

Trusted, so out of scope: your machine and operating system account, the cloud
provider you deploy to, TLS, and what model providers do with what you send
them.

## 3. Trust boundaries

| # | Boundary | What crosses it | Section |
| --- | --- | --- | --- |
| B1 | workspace to engine | connectors, routines, workflows, prompts, programs | [4.1](#41-workspace-code-b1) |
| B2 | model output and content to engine | tool calls the model asks for; mail, documents | [4.2](#42-model-output-and-content-b2) |
| B3 | tool listings from servers to host | names, descriptions and schemas a server writes | [4.3](#43-tool-listings-from-servers-b3) |
| B4 | host to outside services | provider keys, tokens, prompts | [4.4](#44-secrets-tokens-and-outbound-calls-b4) |
| B5 | Google setup and sign-in | client secret, sign-in callback, tokens | [4.5](#45-google-setup-and-sign-in-b5) |
| B6 | client to `serve` | HTTP from browsers, phones, scanners | [5](#5-serve-b6) |
| B7 | owner to cloud deployment | deploy credentials, workspace files, runtime data | [6](#6-cloud-deployments-b7) |
| B8 | agent sandbox to host | model calls, tool calls, approvals, blocked access | [4.6](#46-agents-in-a-sandbox-b8), [4.7](#47-sandbox-backends-on-windows-b8) |
| B9 | plugin to Halonic | a plugin's files, its backend's calls, its local tools' programs, the text Studio draws | [4.8](#48-plugins-b9) |
| B10 | an agent's brief to Claude Code on your server | the brief an agent wrote, your server's host and user, a terminal on your computer | [4.9](#49-run-with-claude-on-your-server-b10) |

## 4. Threats per boundary

### 4.1 Workspace code (B1)

**A workspace can run code.** A local MCP server (`stdio`) is a program on your
machine, and tests, hooks and scripts in a workspace are too. Opening a
workspace you didn't write is like running its code.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| A workspace starts programs before you trust it | Ask "trust this workspace" before any program starts; no `shell: true`. The CLI asks: `halonic trust` shows what the workspace can start and trusts it on this computer, by a fingerprint of its connectors, agents and providers. `run`, `runs send` and `routines watch` refuse a workspace that isn't trusted here, or changed since, and start nothing (exit 3); a run that can only reach the test model needs no trust (`reachesOnlyTheTestModel`). A trust record that can't be read counts as no trust. Studio asks too: it checks the folder with the CLI's `TrustService`, and its review lists the programs, agents, addresses and the fingerprint before you trust it; its older "Trust this folder?" question only lets the shell open a folder you didn't pick. The requirement `ports.connector-trust-enforcement` is still a draft, because the stdio launcher that checks the grant itself isn't built (HAL-230) | CLI **On `main`** (`apps/cli`, `workspace-trust.ts`); Studio **On `main`** (`apps/studio`, `src/studio/workspace-trust.ts`, `src/studio/trust-review.ts`; `studio.workspace-trust`); the requirement becomes active with the contract suites (HAL-181) |
| A hub or an agent lists the token collection | Halonic's own collections (`_tokens`, `_google_setups`) start with `_`, which no workspace collection id may, so a hub, an agent or a ref field can't name them; the scheduler's and coordination's collections (`halonic.scheduler.timers`, `halonic.coordination`) are kept out by their `.` (`packages/core/format`, `collectionId`) | **On `main`** |
| A workspace picks a token or one of Halonic's own secrets by name | A provider's, a model's or a connector's `secret` (and a program's `secretEnv`) is read through `workspaceSecrets`, which refuses `token-key`, `serve-password`, every name under the token prefix `halonic_token_` and every name under the plugin prefix `plugin__`, where the app keeps each plugin's secrets, in any case and with `-` or `_` (`packages/core/ports`). A plugin's connector in the CLI reads no workspace pick: it reads only its own plugin's names, through `pluginSecrets(id)` on the store (`cli.open-plugin-backend`, HAL-15079). Together with the row above, no workspace name reaches a token or Halonic's own secrets in either store: the record store keeps tokens in `_tokens`, and a store that holds secrets and tokens together, such as the desktop keychain, keeps tokens under the prefix | **On `main`** (`ports.workspace-secrets`); tokens under the prefix in the keychain: the bridge **On `main`** (`services.shell-secrets`), and the desktop app using it **On `main`** (`apps/studio`, `start-studio.ts`; HAL-2952) |
| A workspace reads another workspace's or hub's data | Isolation between workspaces and hubs is not built | **Planned** (phase 2, plan HAL-9) |
| A workspace carries the profile folder, so a pull or a checkout changes the trust records, the yes to run without the sandbox or the placements | Every CLI command that opens a workspace, and `halonic init` and `halonic extract` for the folder they make, refuse one that holds a profile a variable (`HALONIC_HOME`, `XDG_DATA_HOME`, `LOCALAPPDATA`) moved there, and one that is inside the profile, from their real paths (`profile.profile-outside-workspace`, `cli.profile-outside-workspace`). Studio's shell refuses the same folders when the person picks one, reopens one from Recent, trusts one or makes or opens one with New workspace (`studio.src-tauri.crates.trust-grant.profile-place`); the engine and the agent host only work in folders the shell opened, and take the profile from it. The built-in profile in a home folder workspace stays allowed (HAL-7039): the sandbox denies it, and Studio's file commands and the workspace store fence it. Residual: a dotfiles repo in the home folder could still track the built-in profile. The fences cover Halonic's own writes; git isn't one of them | **On `main`** |
| A listed tool of an untrusted workspace lowers its risk | Without a trust grant every listed tool counts as `write`; `readToolListing` ignores the workspace's lower risks (`packages/core/app/src/tool-listing.ts`) | **On `main`** |
| Secrets committed to the repository | The leak guard blocks private keys, Google client secrets, OAuth tokens, protected personal terms and absolute local paths (`tooling/check/src/leaks`, [leak guard](../guides/leak-guard.md)) | **On `main`** |
| A sandbox limits what a trusted workspace's program can do | Harness agents: see [4.6](#46-agents-in-a-sandbox-b8). Stdio connectors a workspace starts get their own sandbox (D45): see [the workspace connector's sandbox](#workspace-connector-sandbox) | The start in a sandbox **On `main`** (`connector-stdio-sandbox.workspace-connector-start`, `.workspace-connector-profile`); the agent host's routes that start a connector in its own session **On `main`** (`agent-host.connector-routes`), which check the request's trust grant against the host's own trust record before any start, fenced or not (HAL-8674); Studio calling them **On `main`** (`apps/studio`, `src/connect/agent-host-tool-lister.ts`, `src/library/workspace-listed-tools.ts`) |
| A compromised Studio window asks the host to send workspace text to a remote model | The host's model route (`POST /v1/models/chat`) loads the workspace itself, takes the provider's address and key from its files, refuses any provider that fails `isOnThisMachine` and any request with tools, an address or a key, caps the messages and `maxTokens`, and calls through a client that reaches loopback addresses only, checked after the name resolves. Through this route, keys stay in the host. Right before the call it checks the user's trust record lists the provider it loaded, so a provider file saved after Studio's own trust check isn't called (only the test model needs no trust). This route isn't the window's only way out. In the desktop app the main window's page is the model client: it reads stored keys and tokens through the shell's `secret_get` and `token_get`, and reaches outside addresses through `http_fetch`, which refuses link-local, cloud metadata and other service addresses and plain `http` to a public address, but not a public `https` address. So a compromised main-window page can send a key or workspace text to an address of its choice. These commands are granted to the app's own main window only, never to the Studio page the host serves to a browser | Route: **On `main`** (`agent-host.model-routes`, `agent-host.model-trust`). Main-window page reaching public `https`: **Open**, see HAL-16342 |

#### Workspace connector sandbox

When the host sets one up (D45), a `stdio` connector a workspace starts runs in
the same sandbox as a plugin's local tool, not as you on your computer:

- **Its own folders.** It gets a new working folder and a new temp folder. A
  program that runs a script from the workspace (`node tools/mail.js`) can read
  the workspace, read-only. A pinned package (`npx`, `uvx`) doesn't get the
  workspace at all.
- **No agent's files.** The profile denies reading every harness agent's
  working folder, so a connector can't load a file an agent wrote, even one it
  never names (`require('./lib')`, a pnpm `node_modules` link). Before the
  start, `touchesWorkingFolder` also checks the start folder, the program, its
  arguments, its `env`, and the program found on `PATH`, and refuses one that
  points into an agent's folder.
- **Its own environment.** Only its `env` and `secretEnv`. `inheritEnv` is
  refused in a sandbox: it names variables from your environment, which the
  sandbox doesn't hand over.
- **Only its `sites`.** The network is limited to Halonic's bridge and the sites
  in the connector file's `sites`. A connector with no `sites`, or with an empty
  list, reaches nothing else; it never means no fence. The proxy refuses
  loopback, private, link-local and metadata addresses after it looks up a
  name, so `1.2.3.4.nip.io` doesn't reach a local address.
- **Where there's no sandbox, nothing changes.** A connector the launcher
  starts without one (setting `off`) starts as before, with your rights and
  without a fence, and `sites` limits nothing. The trust check's "Allowed
  sites" list is a fence only where the program starts in a sandbox. A plugin's
  local tool is never started without one.

The limits in [sandbox.md](sandbox.md#the-limits) apply: a site that is allowed
sees what the connector can read, and the fence is not a virtual machine.
Attack tests run in a real sandbox: an undeclared site, a read outside its
folder, and a read of the environment (`workspace-connector-attacks.test.ts`).

**Known limit.** After you trust a workspace, its programs run with your
rights. Trust only workspaces from people you trust. A
program gets only a small base of your environment and what its connector
names, but it can still read your files: see the known limits in
[4.4](#44-secrets-tokens-and-outbound-calls-b4).

### 4.2 Model output and content (B2)

**Model output is untrusted.** Content a model reads (a mail, a web page, a
tool result) can steer what it asks for. Prompt injection isn't solved. The
rule is that a steered model must not be able to do more than you approved.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| Injected text makes the model call a risky tool | Tools have a risk: `read`, `write` or `send`. Every risk above `read` needs approval in the engine (`checkToolCall`), not in the model's prompt; only `read` runs at once. A run stops before such a call and waits for a person; a chat turn, which can't wait, refuses it. Halonic's own tools that add or update records and save or forget memory declare no risk, so a run counts them as `read` and runs them without asking: they reach only what the agent's file grants it, so injected text can change records in a collection the file grants or the agent's notes, and the grants and the run log are the control. Listed tools: see 4.3 | **On `main`** (`packages/core/engine/src/agent/check-run-tool-call.ts`, `check-chat-tool-call.ts`; `engine.run-tool-calls`, `engine.turn-approval-stop`) |
| A tool result carries instructions | Results from tools marked untrusted reach the model only inside a fence | **On `main`**: every result of a server's tool, in chat turns and runs (HAL-5205) |
| An earlier run's log carries instructions | `read_run` and `list_runs` fence the tool arguments, tool results and errors they show, so an agent with `runLogs: true` reads them as data (`engine.run-log-fenced`) | **On `main`** |
| Knowledge or documents carry instructions | Knowledge reaches a model only through the engine's `knowledge_search` and `knowledge_read` tools, which fence the titles, snippets and texts of any source not marked `untrusted: false` (`ports.untrusted-knowledge`, `engine.knowledge-tools`). The ref the model sends back stays unfenced, so a hit or a document whose ref is longer than 512 characters is dropped (`knowledgeHitForModel`, `knowledgeDocForModel`). Agents don't get these tools in runs yet (HAL-4174) | **On `main`** |
| A run is changed after the fact | Each run is an append-only event log, kept apart from the definitions ([ADR](../adr/2026-11-08-runs-are-stored-separately.md)). `FolderRunStore` keeps it as `<runId>.jsonl` in the workspace's `runs` folder in your profile, one event per line, and only adds to it. An append names the last event it expects (`expectedSeq`), holds `<runId>.lock` so the CLI and the Studio shell can't both write, and counts as stored only once flushed to disk; a failed append is cut back and stores none of its events, though one cut off by a crash of the program may leave the first events of its batch stored. The folder is private to you (`700`, files `600`), and a log that is a link or has a second name is refused. The CLI uses it for every run; the Studio shell's run store reads and writes the same files under the same lock, with the same modes, link refusals and flushes | **On `main`** (`packages/adapters/fs-node/src/run-store.ts`; `fs-node.run-store-files`, `run-store-lock`, `run-store-recovery`, `run-store-private-files`; the shell's `apps/studio/src-tauri/crates/run-store`, `studio.src-tauri.crates.run-store.run-store-private-files`) |
| A compromised page or a run's file name writes a file somewhere you didn't choose | **Save…** on the run page's Items line goes through `run_file_save`, granted only to the main window's local page. The page names the run and the file's hash, never a path; the shell saves only a file that run's own log says it created, with the bytes stored under that hash. It writes only to the file you pick in its own save dialog, which asks before it replaces one; Cancel writes nothing. The run's name for the file is only the dialog's suggestion, cut to its last part and without hidden characters. The bytes are the model's words as the run saved them: Halonic doesn't check or change what is in them | **In review** (`studio.src-tauri.run-file-save`, HAL-17832) |

**Known limit.** Run logs have no tamper evidence. An append-only interface
doesn't stop a program running as you from rewriting the files.

**Known limit.** Approvals and secret bindings limit the harm of a steered
model. They don't stop it from being steered.

### 4.3 Tool listings from servers (B3)

A server you connect to writes the descriptions of the tools it lists. A
**listed tool** is one the server lists and nothing Halonic reviewed declares.
Its text is attacker text. The rules are the requirement
`ports.untrusted-tool-listings`.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| Oversized or deeply nested schemas | Parameters over 64 KiB, nested over 64 levels, or with a text over 10,000 characters are refused | **On `main`** |
| Hidden instructions in schema keywords (`default`, `examples`, `x-…`, `pattern`) | `parameters` are rebuilt from an allow-list of keywords; everything else is dropped and reported | **On `main`** |
| Instructions in names, `enum` and `const` values, which can't be fenced | Names must be 1 to 64 letters, digits, `_` or `-`; a bad `enum` is dropped; unfenced text is capped at 2,048 characters per tool | **On `main`** |
| A server swaps a reviewed tool's text | A declared tool keeps its declared description, parameters and risk; the listing can't change them | **On `main`** |
| A listed tool lowers its own risk or marks itself trusted | Its `risk` and `untrusted` are ignored; it counts as `write` unless a trusted workspace sets another risk (`read`, `write` or `send`) | **On `main`** |
| Two tools share a name | Every clashing listed tool is refused. A call a person approved goes only to the connector the approval named: when a run goes on and that connector no longer offers the tool, the call isn't made, even when another connector now offers a tool of that name | **On `main`** (`engine.approval-keeps-connector`) |
| The description reaches the model as an instruction | Descriptions and titles come back as `UntrustedText`, whose `toJSON` throws, so they can't be serialised to JSON without the fence. `toString` doesn't throw: a template string gives `[object Object]`, which doesn't leak the text. `structuredClone` or IPC turns it into a plain object and loses the guard. The fence itself is rendered when tools are assembled | **On `main`**: the engine fences every listed tool it offers (HAL-5205) |
| A call uses arguments the listing never declared | Refused at call time; a listed tool is `write` unless a trusted workspace sets another risk, so it needs approval unless that risk is `read` | **On `main`**: the engine checks every call in runs and chat turns with `checkToolCall` (HAL-998) |
| A server changes its tools after you looked | Pinning and approving listings | Planned (HAL-520) |

**Known limit.** Unfenced strings (names, `enum` values) can still carry up to
64 characters each and 2,048 per tool. Approval for every risk above `read`
(a listed tool is `write` by default) is what limits the harm.

### 4.4 Secrets, tokens and outbound calls (B4)

| Threat | Mitigation | Mark |
| --- | --- | --- |
| A secret goes to the wrong address | An integration's secret is placed by the kit only for a declared secret and an allowed host; the integration never sees the value | **On `main`** (`integration-kit.secrets-placed-by-kit`) |
| Requests go to hosts nobody declared, or redirect there | Exact, case-insensitive host match over `https`; every redirect hop is checked like the first request | **On `main`** (`declared-hosts-only`, `redirects-checked`) |
| A company proxy hides where a request really goes | With `HTTPS_PROXY` set, public `https` hosts go through a CONNECT tunnel to the host's name, and Halonic runs TLS itself over it, so the proxy sees no content and the certificate is checked against the name. The proxy setting is read once by the app, outside the sandbox, never reaches the sandbox launcher or the program, and its user name and password never appear in a message, a log or a redirect. A bad setting fails every request that needs it and never goes direct; `loopback`, `private` and `NO_PROXY` hosts always go direct with the full address check; a public host over plain `http` is refused; the CONNECT reply is size-limited, timed and must leave no stray bytes | **On `main`** (`http-node.proxy-config`, `http-node.proxy-tunnel`, `http-node.proxy-guard`, `sandbox-srt.session`) |
| Plain `http` leaks a secret | `http` only to this machine or a private address, and a secret only to this machine | **On `main`** (`local-http-hosts`) |
| A workspace sends a stored model key to an address of its choice | A provider's key goes to an address other than its type's own (such as `https://api.anthropic.com`) only when the workspace is trusted here, and the trust check shows such a provider with "Sends its key to" and the address; otherwise the call fails with `untrusted-provider-address`. A key with a list of allowed addresses goes only to an address on it (`key-origin-not-allowed`). `halonic models allow-address`, which adds to that list, refuses to run inside a run (`HALONIC_RUN_TOKEN`). In Studio, a refused call of a run a person started at the window (Run, a routine's Run now or the Inbox, not a subflow) may ask "Allow this address?"; never a chat turn, a routine's own trigger, a remote engine or a served window. The page sends only Allow or Don't allow: Allow adds only the address the engine was refused, through the shell's `secret_allow_origin`, which makes the origin itself, and every check runs again before one more try. The question waits in memory only, and ends on the run's stop or after 10 minutes with the refusal. The question is a `key-origin.asked` line in the run's log, so the step shows "Waiting for your answer", and each answer a `key-origin.answered` line, neither with the person's name or the key's value. The Anthropic and OpenAI providers follow no redirect. Errors name the provider, the address and the key's name, never its value | **On `main`** (`cli.workspace-provider-key-trust`, `cli.commands.models.allow-address`, `model-anthropic.endpoint`, `model-openai.endpoint`, `studio.src-tauri.crates.secrets.key-origins`, `studio.src-tauri.key-origin-commands`, `secrets-tauri.key-origins`); Studio checks a key's list in the desktop keychain, and its Models page writes it (`models.api-keys.address-field`); asking at the window is **in review** (HAL-11873): `cli.key-origin-ask`, `events.key-origin-answered`, `studio.key-origin-prompt`, `models.key-address.allow-address`, `runs.run-view.key-origin-answered`, `events.key-origin-asked`, `runs.run-view.key-origin-waiting` |
| One integration reads another's tokens | Names are `i<n>_<integration>_<token>`; a policy declares what each may read | **On `main`** (`scoped-tokens`) |
| A slow or huge response ties up the host | Header, idle and overall timeouts and a size limit on every request | **On `main`** (`request-limits`) |
| Logs leak secrets | The request log holds method, host, path, status, time and outcome; no query, headers or bodies | **On `main`** (`request-log`) |
| A plugin's backend in the agent host reads a secret that isn't its own, or the page plants one for another plugin | Studio hands the host one trusted plugin's declared secrets by their short names; the host checks its own trust record, builds `plugin__<id>__<secret>` itself, keeps the values in memory only and answers only `plugin__` names; the kit reads them only through `pluginSecrets(id)` | **On `main`** (`agent-host.plugin-secrets`, `agent-host-client.plugin-secrets`, `studio.plugin-secret-hand-over`) |
| A stored token is read from disk or a copy | AES-256-GCM, a new random nonce per write, bound to the token's name so a value can't be moved to another name; the key is the secret `token-key` (32 bytes). On a person's computer it is made on the first seal from the system's cryptographic generator and kept in the profile's private secrets file; a key already there or in `HALONIC_SECRET_TOKEN_KEY` is never replaced, and none is made while sealed tokens remain (`token-store.made-token-key`, HAL-13855) | **On `main`** (`packages/adapters/token-store`) |
| A wrong key looks like "not signed in" | A value that won't open throws `UnreadableTokenError`, never `null`; the error names the token, not its value | **On `main`** |
| Token names fold into each other | Case and `-` versus `_` are treated as the same name; bad names are refused before anything is read | **On `main`** |
| A workspace's secret pick reads a token or the token key | The names a workspace picks for providers and models go through `workspaceSecrets`, which refuses `token-key`, `serve-password`, the token prefix `halonic_token_` and the plugin prefix `plugin__` by their `secretKey` form; its error never repeats the name. A store that holds secrets and tokens together keeps tokens under that prefix | **On `main`** (`ports.workspace-secrets`); tokens under the prefix in the keychain: the bridge **On `main`** (`services.shell-secrets`), and the desktop app using it **On `main`** (`apps/studio`, `start-studio.ts`; HAL-2952) |
| A program a workspace starts reads the keys in your environment | A `stdio` connector's program gets only a base of the app's environment, plus its connector's `env` and `secretEnv` and the variables it names in `inheritEnv`. The base holds variables such as the program lookup (`PATH`), home, user, shell, terminal, temp, time zone and locale, `XDG_*_HOME`, your proxy, certificate and library folders, and on Windows the system folders a program needs. A model key or token in your shell, the `HALONIC_SECRET_…` variables included, stays out unless the connector names it in `secretEnv`, which the trust check lists. `inheritEnv` refuses a name that looks like it holds a secret, such as `ANTHROPIC_API_KEY`, and the trust check lists the names it takes. `NODE_TLS_REJECT_UNAUTHORIZED`, `LD_PRELOAD` and `DYLD_INSERT_LIBRARIES` stay out of the base | **On `main`** (`app.connector-base-env`, `app.connector-inherited-env`, `format.connector-inherit-env`, `mcp.stdio-connector`, `mcp.pinned-launcher`) |
| A copied data folder gives away tokens (desktop) | In the desktop shell, Studio's services keep secrets and tokens in the OS keychain; the data folder holds no token and no key (`packages/studio/services`) | **On `main`**: the bridge (`services.shell-secrets`) and the desktop app using it (`apps/studio`, `start-studio.ts`; HAL-2952) |
| A pulled workspace sends its messaging to a server of its choice (desktop) | Each workspace's messaging engine is kept in the profile (`workspaces/<key>/messaging-engine.json`, written through a rename with mode 0600, never a token), under the key the profile's `workspaceFolders` gives, never in the workspace, so a pull can't change it. A server address that isn't `https`, nor plain `http` to this computer, reads as "This computer" with a warning. The device token stays in the keychain under `server-pairing__<key>`, and only the server client's `Authorization` header carries it. While a workspace uses a server, Connect and Disconnect of local Paperclip answer `409 server_engine` and keep no key | **In review** (`agent-host.messaging-engine`, HAL-18742) |
| The device token from a server pairing reaches the page, the log or the profile's secrets file (desktop) | The host makes every pairing call to the server and puts the token straight into the keychain (`server-pairing__<key>`), reads it back, and only then saves the setting; when that fails it ends the session on the server and keeps nothing. The page gets the check code, the ending and the dates, never the token or the server's pending ID. The routes refuse another site (`403`) and answer `409 keychain_needed` without the keychain, so a token never falls back to a file. Logs name an error's kind only, never a keychain's or the server's text. Switching back to "This computer" removes the setting even when the token can't be read or deleted | **In review** (`agent-host.server-engine-pairing`, HAL-18744) |
| A locked keychain asks for a password while no window is open, and a background run hangs on it (desktop) | The shell's secret broker times out every keychain call and answers `unavailable`; the step fails with "secrets unavailable" instead of waiting | **On `main`** (`studio.src-tauri.crates.secret-broker.engine-secret-broker`; [ADR](../adr/2026-11-20-desktop-engine-runs-in-its-own-process.md)) |

**Known limits.**

- **Old copies stay on disk.** After a replace or a remove, the token store
  compacts `_tokens`, so the old sealed value is no longer in the record store
  (`token-store.old-values-removed`, HAL-719). Backups, copies and freed disk
  blocks are outside the record store and may still hold it, encrypted. If the
  key leaks, those old tokens can be read. So Halonic says it "deletes" a
  secret and "stops using it", not that it is gone from disk.
- **The store must not be writable by agents or tools.** Anyone who can append
  to it can remove a token or roll it back. The encryption doesn't prevent
  that.
- **The key sits next to the data on the same machine.** Encryption protects a
  copied data folder, not an attacker who has your account.
- **On desktop, the keychain doesn't stop a program running as you.** The
  keychain keeps tokens out of the data folder, but any program running under
  your account can ask it for them. On Linux (Secret Service, while it's
  unlocked) and Windows (Credential Manager) it gets them without a prompt. On
  macOS the keychain may ask you once for each app. An agent you run on this
  computer, outside the sandbox, is such a program (see 4.6).
- **A program a workspace starts gets only part of your environment, but it
  still runs as you.** A `stdio` connector started on this computer gets a
  small base of the app's environment and, on top, only its connector's `env`
  and `secretEnv` and the variables it names in `inheritEnv`, such as
  `AWS_PROFILE` (`app.connector-base-env`, `app.connector-inherited-env`). So
  a model key in your shell doesn't reach it, unless the connector names it in
  `secretEnv`; the trust check lists those names, so read them before you
  trust a workspace. But the base keeps your proxy settings, so a password in
  a proxy address such as `HTTPS_PROXY` does reach it. And the program runs
  with your rights, so it can read your files, such as `~/.aws/credentials`,
  and ask the keychain (see above). Halonic still removes known secret values
  from the program's error output it shows you.
- **`inheritEnv` can't tell every secret by its name.** It refuses a name
  that looks like it holds one, such as `ANTHROPIC_API_KEY` or `GITHUB_TOKEN`,
  but not one such as `DATABASE_URL`, whose value may hold a password. The
  trust check ends a program's row with the names it takes ("takes
  AWS_PROFILE from your environment"), so that row is the real check: read it
  before you trust a workspace. A pinned connector can't name a variable that
  moves its registry, proxy or certificates, and a connector in a sandbox
  can't use `inheritEnv` at all.
- **With a proxy, Halonic can't prove which address was reached.** The proxy
  resolves the name and connects, so the address check can't run. What still
  holds is an allowed name and port, TLS only, and a certificate valid for
  that name. A DNS answer at the proxy that points the name at an internal
  server works only if that server holds a valid certificate for the name,
  the same protection a browser has. Keeping private addresses out of reach
  is the proxy's own egress policy. Halonic doesn't resolve the name itself
  as an extra check: it can't be tied to what the proxy resolves, it fails
  open when local DNS is down (the usual reason for a proxy), and it would
  read as a guarantee it isn't. Also, with an `http://` proxy the proxy
  password travels unencrypted to the proxy, and model calls open a new
  connection each time (no keep-alive).
- **Outside the desktop shell there is no keychain.** The desktop app gives each
  workspace's services the keychain before any feature's services are built
  (`provideShellSecrets`, HAL-2952). In a browser, tokens go to whatever store
  the app provides, or to none.

### 4.5 Google setup and sign-in (B5)

The Google setup flow stores your own Google client secret and signs you in.
Decisions from the security reviews. What is on `main` is the library
(`packages/host/google-sign-in`, and the setup code in `core/google-setup`)
and the host's two routes, the sign-in start and the callback
(`packages/host/server`). The reasons are in
[the sign-in record](../adr/2026-11-14-google-sign-in-and-the-setup-record.md).
Studio's setup feature calls the host's setup route (`apps/studio`, `src/google/provide-google-setup.ts`):

| Threat | Mitigation | Mark |
| --- | --- | --- |
| A leaked client secret or token is committed | The leak guard has `google-client-secret` and OAuth token and code rules | **On `main`** |
| Sign-in code intercepted | PKCE (S256); the verifier is 32 random bytes, stays in memory and goes only to Google's token endpoint, in the code exchange (`packages/host/google-sign-in`) | **On `main`** |
| Forged or replayed callback | A random `state` (32 bytes), compared in constant time; a missing one never matches | **On `main`** |
| A callback with the wrong `state` cancels or consumes a sign-in | A missing or wrong `state` is checked first and changes nothing; the pending sign-in is taken once, synchronously | **On `main`** |
| Crafted redirect or auth URL | Only `127.0.0.1` redirects; every value is URL-encoded; no `error_description` is read | **On `main`** |
| The client secret is read by an integration or hub | It goes only through the `TokenStore`; only the host's sign-in and refresh code reads it; integrations get only `scopedTokens` | Library **on `main`** (HAL-698); the setup flow that calls it **On `main`** (`apps/studio`, `src/google/provide-google-setup.ts`) |
| Two setup refs map to one stored name | A ref is checked against the store's name folding before use, so none fold to another's name | Library **on `main`** (HAL-698); the setup flow that calls it **On `main`** (`apps/studio`, `src/google/provide-google-setup.ts`) |
| A secret ends up in an error message | Errors have fixed texts; a rejected input is never repeated | Library **on `main`** (HAL-698); the setup flow that calls it **On `main`** (`apps/studio`, `src/google/provide-google-setup.ts`) |
| Another computer or web page reaches the sign-in callback | The callback needs no session, so it answers only a request addressed to a loopback name (404 on any other) after the `Host` and `Origin` checks. That check reads the `Host` header, which a request made by hand on another computer can set, so the guard against such a request is the `state`: one with no matching `state` changes nothing (`packages/host/server`) | **On `main`** |
| The callback page reflects something an attacker chose | The page is fixed text for each outcome, with no script; nothing from the query, Google's answer or the record goes into it, and it is sent with `no-store`, a `default-src 'none'` content policy, `no-referrer` and no framing | **On `main`** |
| The callback URL, with its code and `state`, ends up in a log | The request log records method, path and status, never a query string | **On `main`** |
| A dead sign-in link is used to flood or spoof the open setup item | A `state` that matches no sign-in has no account: it gets the page and publishes no event | **On `main`** |
| Studio or a hub reads or changes a Google secret or setup | Setup records are in `google/setups`; secrets only in `google/tokens`, never returned. Studio reads the records through the read-only `google_setup_read` command, which takes no argument and is granted to the app's own window only | **On `main`** |

**Known limit.** The token store's old-copies limit (4.4) applies to the
client secret and to refresh tokens.

### 4.6 Agents in a sandbox (B8)

An agent whose harness is **Claude Code** or **Codex** is a program on your
machine that runs commands, reads files and asks a model what to do next.
Every such agent runs in a **sandbox on this computer** by default. The design
is plan section 4.5. The sandbox is `adapters/sandbox-srt`, built on
[sandbox-runtime](https://github.com/anthropics/sandbox-runtime) (srt). Its
launcher, `adapters/sandbox-host`, finds and starts programs.

The host can also serve the **remote gateway** (HAL-10827). It runs only
while remote is on, and only in a host given a tunnel provider (HAL-12243,
build plan decision 19, after the phase B attack suite). The shipped
executable gives the Tailscale provider (`adapters/tunnel-tailscale`) only
where a `tailscale` program is installed (HAL-17605); remote stays off until
the person turns it on, and no launch argument or environment variable turns
it on. The provider serves the gateway on the person's own tailnet with
`tailscale serve`, never Funnel. Funnel turned on later for the same port
would make it public under the same name, so the listener refuses every
request that carries Tailscale's `Tailscale-Funnel-Request` header, which the
serve proxy sets on Funnel traffic and strips from anything else. The gateway
reads no `Tailscale-User-*` identity header: a phone is known only by its
pairing key. It
never runs over `--stdio`, without a profile folder, or in a host that doesn't
hold the profile's lock. Its listener binds
`127.0.0.1` only, so only a tunnel on this computer can forward to it. It is
a second port next to the host's own, with its own checks (`Host`, no `Origin`,
a WebSocket upgrade, one parser for every frame). It takes no launch token:
anything past the Noise handshake is a phone that paired with the pairing
code, the check code and Allow, or one already in the paired phones list
(`agent-host.remote-gateway-access`). It can list the host's runs, watch their events and
send a prompt, and nothing else: no command, file or secret of its own. A
prompt steers a live agent run, though, so the agent can do whatever its run
allows without asking for approval. The host, not the
phone, judges an approval `risky` (every tool, for now), and the gateway
refuses every risky approval a phone answers until the person allows that on
the desktop, with the switch "Let phones answer risky approvals" in Settings ›
Remote. The switch is off until the person turns it on, and the desktop shell
saves it only after the person's yes in its own native dialog
(`studio.src-tauri.remote-saves-ask`). While it is off, a phone answers no
approval.
Behind that check, a phone's decision goes to the run's own approvals in
Studio, the card's path, where the first answer wins: **On `main`**
(`studio-harness-host.ts`, `agent-host` `src/bridge/studio-services.ts`,
HAL-10849). Its events are the narrow ones (prompt, answers,
approvals, result), kept in memory only.

**The phone's pairing scanner** (Android, **On `main`**:
`studio.connect.pair-scan`, `studio.src-tauri.crates.connect.pair-scan`) reads
the pairing code with Google's ML Kit (`play-services-mlkit-barcode-scanning`),
which runs on the phone inside Google Play services. The camera image and the
code it reads stay on the phone. ML Kit does send Google diagnostics and usage
data about the API: device details (maker, model, OS version and build), the
app's package name and version, a device identifier and per-installation
identifiers (Google says the per-installation ones aren't meant to identify a
user or a physical device), speed, settings such as image format and
resolution, and the event type
([Google's disclosure](https://developers.google.com/ml-kit/android-data-disclosure)).
Halonic can't turn that off, so Google Play services is trusted on Android, and
the README says so under "Models and privacy". The Play Data safety form must
declare it before the first Play upload with the scanner (HAL-12612).

The **Halonic** harness, the default, starts no program for the agent, so this
boundary doesn't apply to it. Stdio connectors a workspace starts are
[4.1](#41-workspace-code-b1). The host opens their sandbox sessions itself,
through the `/v1/connectors` routes: a request carries the connector file's
fields, its own secrets and the trust grant, never a sandbox profile, and a
workspace the launcher didn't name is refused.

The host also answers **which sandbox runs** (HAL-10796): `GET /v1/sandbox/choice` and
`POST /v1/sandbox/choice/settings-changed` give back the `SandboxChoice` as codes. The
setting is read from the profile, never from the request, and no route saves, changes or
removes it, so a program in a sandbox can't pick its own fence. Only the shell saves it,
through `agent_host_sandbox_choice_save`, which only the app's own main window may call.
That page names the backend, so a compromised page could pick one. Before the shell saves
`none`, the one choice without a fence, it asks the person in its own native dialog, and
saves nothing without their yes (`studio.src-tauri.sandbox-choice-save-asks`, HAL-16342).
A page can still move the choice between backends that fence: each backend has to pass
the fence check before anything runs in it. Until the real canary exists (HAL-10552) that
check fails closed, so no backend is reported as in use.

The host also runs **Studio's "Check this computer"** (HAL-13407): `POST /v1/doctor`
runs `halonic doctor`'s own checks (`adapters/doctor-node`) and answers facts and
ids, never words. It takes only a workspace folder the launcher named, and it
writes nothing: the profile's trust records are read only, so a record the check
would shrink stays as it is, and an agent's own sign-in isn't asked, because that
runs Claude Code or Codex on a settings folder in the profile. It reaches a model
server at an address the workspace names only once the workspace is trusted here,
as the CLI does, never a cloud provider, and runs no model test. The key lines
aren't answered: the host holds no keychain. One check runs at a time; neither
the answer nor the log quotes an error's text. A ready Sandbox line also names
the kind of sandbox the host runs, as an id from the host's own system
(`bubblewrap`, `seatbelt` or `windows`, HAL-16290): nothing a caller sends picks it.

The host also opens the **Google setup** of the profile it serves (HAL-9911):
`POST /v1/google/disconnect` asks Google to end an account's sign-in and removes
the refresh token, the record and the client secret. The page and the shell
never hold a token or a client secret: the host seals and opens them in
`<profile>/google/tokens`, and no route answers one. The route sits behind the
host's `Host`, `Origin` and launch-token checks like every other, and its
request names the account by a ref that is checked before anything is read. A
sandboxed agent has no way to the launch token, which stays in the shell, and
none to the profile folder, which the sandbox denies. A request that holds the
token can disconnect an account, which removes access and grants none. It can also send a client secret
(`POST /v1/google/secret`, `…/secret/replace`; HAL-9910): the host keeps it through
the CLI host's own handler, checks a new secret with Google before it replaces one in
use, and leaves the secret out of every answer, log line and error. The
sign-in's callback has no token by design (see the ADR
`2026-11-14-google-sign-in-and-the-setup-record`), and the host serves it in
both modes, with the same route table and the same checks (`Host`, `Origin`,
the sign-in's `state`). On the host's own port Google's redirect names that
port and `/api/google/callback`. In WSL (`--stdio`) the host has no port, so
the redirect names Studio's relay on Windows' loopback and
`/v1/google/callback`, the one request the relay passes on without the token
(`studio.src-tauri.crates.agent-host.relay-callback`: one request, no body, no
reuse of the connection, at most 4 at once). The callback page is sent with
`Cache-Control: no-store`, `Referrer-Policy: no-referrer` and
`Connection: close`, and loads nothing outside itself, because the code is in
the address bar and the history (`agent-host.google-callback-over-frames`).

An integration's sign-in (HAL-12191, HAL-8613) has a second token-free route of
its own: `GET /sign-in/<random>`, a prefix route of `host-server`, whose path is
new for each start and whose redirect names the host's own port, or in WSL
the relay's. The host
serves these routes only with a profile folder, and Studio starts it with one
(`--profile-folder`), so they are live on a shipped host. It seals the grants
with the profile's token key, as it does Google's tokens, in
`<profile>/integration-sign-ins/tokens`. Its token and revoke requests go only
to public hosts, follow no redirect and never reach the host's own ports. Only
a trusted plugin's backend can hold a sign-in: every read of its sheet,
settings or client secret reads the plugin's folder and checks the trust
record again, and a plugin that isn't there, changed or lost its trust answers
`404 unknown_integration`. The client secret is read only from that plugin's
own handed-over secrets, and the backend gets the access token only through
the kit, which places it (`agent-host.plugin-sign-ins`). Removing a plugin's
trust or the plugin signs out each of its grants first, found from the grants
and not the sheet: revoked where it can be, and deleted also when the revoke
fails, so a plugin added later under the same id isn't signed in
(`app.plugin-sign-out`), also when `halonic trust --remove` runs in the
plugin's folder without `--plugin`. Removing a plugin's record in Settings › Trusted
sources signs it out the same way, and adding a plugin under an id no folder
has signs out what is left for that id first, such as after a folder was
deleted by hand. A local integration
that isn't a plugin still can't declare a sign-in (`sign-ins-not-allowed`),
because only a plugin's trust check shows a sign-in's hosts. The callback has the
same `Host` and `Origin` checks and the same defence, the sign-in's `state`
(plus PKCE), and a path no sign-in waits on gets a plain 400 page that repeats
nothing of the request. In WSL the relay passes it on without the token only
in exactly the shape the host makes, `GET /sign-in/` and 43 base64url
characters (HAL-13427), with the Google callback's rules: one request, no body,
no reuse of the connection, a query of at most 2 KiB, and the same 4 places.
A path of another shape needs the token. So the relay lets through one more
family of token-free paths, all of which reach only the callback route: what a
process on Windows can send there without the token it could already send to
the host's own port elsewhere, and a path no sign-in waits on gets the 400 page
(`agent-host.integration-sign-in-routes`).

What the callback answers to, in relay mode as on the host's own port:

- **A web page makes the browser call the callback.** The `Host` check (the
  loopback name with the relay's port) stops DNS rebinding, and the `Origin`
  refusal stops `fetch` and XHR, which carry one. It does not stop an `<img>`,
  a top-level navigation or a `no-cors` GET, which carry no `Origin`; against
  those the `state` is the whole defence: 32 random bytes, checked first,
  compared in constant time, and the pending sign-in is taken once. A wrong
  `state` gets the "no longer valid" page and changes nothing. `Sec-Fetch-Site`
  is not used, because Google's redirect is itself cross-site.
- **Another program on Windows sends a forged callback.** The same `state`
  answer. Any local process can open the callback, as on the host's own port;
  that is the accepted model of the ADR.
- **Another program takes the relay's port after a relay crash and reads a real
  callback.** It would see the code and the `state`. The sign-in uses PKCE
  (S256), and the verifier stays in the host's memory, so the code is useless
  without it. The pending sign-in goes with the host: a restart ends it, and
  the page says the link is no longer valid.
- **A flood of callback connections keeps the relay busy or blocks a real
  sign-in.** Any local program can open the callback without the token. The
  relay holds at most 4 such connections at once, closes one whose head is not
  whole after 5 seconds and any of them after 30 seconds, so a slow or idle
  client frees its place soon (`studio.src-tauri.crates.agent-host.relay-callback`).
  While 4 are open, a real redirect can be refused until one closes, and the
  user starts the sign-in again. This is a nuisance, not a way in: nothing
  reaches the host or its memory beyond the one filtered head.
- **Request smuggling through the relay's narrow filter.** The relay passes
  exactly the bytes up to the first blank line and stops reading the client;
  the host answers with `Connection: close`, so the connection ends with the
  one answer. Tests send a second request in the same write (relay) and a
  callback that must close without waiting for `keepAliveTimeout` (host).
- **The distro's other programs reach the relay port.** The host in the distro
  already holds the launch token; it gets no more than a token-less `GET` that
  it serves itself. Under mirrored networking another distro can reach the
  relay port too, and the same `state` answer applies.

A trusted plugin's backend (`agent-host.plugin-routes`) starts the same way,
through `POST /v1/plugins/call`: the request names the plugin by an id of
lower-case letters, digits, `.`, `_` and `-` only, never a path. The host reads
the plugin's folder in its own profile and checks its own trust record at every
call; the start refuses a folder that no longer has the fingerprint just
checked. The runner starts in the host's fenced sandbox. On a computer without
it (Windows until HAL-3403), it starts only with the user's yes for the reason
at that start, read from the profile at every start, and then in the
launcher's sandbox; without that yes it answers `403 not_fenced`
and starts nothing. The yes is saved only through
`POST /v1/unfenced-runs/allow` (`agent-host.unfenced-runs-routes`), behind the
launch token, which only Studio's shell holds: runners and harness agents
never get it, and no tool the model can call reaches the route. The main
window's page reaches the route through the shell's `agent_host_request`, so a
compromised page could ask for it. Before the shell sends that call, it asks
the person in its own native dialog, and sends nothing without their yes
(`studio.src-tauri.unfenced-allow-asks`, HAL-16466). The gate saves
it only for the reason that holds at that moment, so a caller can't save a yes
for a status the user didn't see, and checks it again at every start.
`POST /v1/unfenced-runs/take-back` removes it and stops this host's runners
without the sandbox before it answers. The `halonic` command offers no yes and
never saves one. For local integrations it reads the host's yes from the same
folder, at every start (on Windows with the default WSL sandbox the host keeps
its profile in the distro, so a command in a Windows terminal never sees that
yes and runs integrations only in the sandbox), and starts the runner in the launcher's sandbox only
when the yes is for the reason at that start (`cli.local-integration-unfenced-yes`,
HAL-15144); a yes it can't read starts nothing. It doesn't look for Studio's
install: on a computer without Studio nobody can give the yes, so integrations
run only in the sandbox there, and a check for the install would only be
another file to fake. While such a runner runs, the command reads the yes again
every second, so a Take back in Studio stops it too. For plugin backends the
command still holds no yes (`noUnfencedRunConsent`, `cli.no-unfenced-run-yes`),
so that file starts no plugin backend from the command. When a start's fence proof fails though the computer passed the sandbox check
(A23), nothing runs, and the host keeps that plugin's stop in memory for the
plugin page's R15 (`agent-host.plugin-run-state`, HAL-15113):
`POST /v1/plugins/run-state` reads it and `POST /v1/plugins/run-state/check-again`
forgets it, behind the launch token, by plugin id, as codes only. Neither
starts anything or changes what the gate decides. In the host, and for
the command's local integrations, a file written into that folder by hand
counts as a yes, as the trust records next to it count as trust: whoever can
write the profile already decides what runs, and an agent that runs on this
computer with your rights can write both. A plugin's
backend gets its secrets from Studio, which hands a trusted plugin's declared
secrets to the host before each use; the host builds their names itself and
keeps the values in memory only (**On `main`**, `agent-host.plugin-secrets`;
ADR [Studio hands a plugin its secrets](../adr/2026-11-19-studio-hands-a-plugin-its-secrets.md)).
It gets no sign-in token through the host yet (HAL-8613). The shipped
single executable has no runner mode of its own (its `process.execPath` is the
host, not Node), so there the route answers `403 not_in_this_build` and starts
nothing, rather than start a second host without Node's permission layer.
The runner can read the folder that holds the Node executable and nothing
above it, built by one function (`runnerNodeFolder`) that the fence's attack
cases use as well. If Node sits in a shared folder such as Homebrew's `bin` or
`~/.local/bin`, every program there is readable to the runner; a Node that
needs sibling libraries outside that folder fails closed at start.

#### What the sandbox is meant to stop

An agent tricked by a mail, a web page or a file (B2), or a careless command,
from doing any of these:

- reading your keys and personal files: SSH and cloud credentials, package
  registry tokens (such as `~/.npmrc`), shell histories, browser profiles,
  keychain files, your own Claude Code and Codex settings, Halonic's
  data and trust records
- changing files outside its working folder, temp folder and its own settings
  folder, including the workspace's definition files, so it can't edit its own
  agent file, `approve` list or allowed sites
- sending data anywhere but the Halonic bridge and the sites you allowed for
  that agent
- outliving its run: cancelling a run, or its time limit, stops every process
  it started

#### What it doesn't stop

- **What the agent does inside its working folder.** It may change any file
  there without asking. That's what the sandbox is for. Keep work you can't
  lose in git.
- **What it sends to an allowed site.** An allowed site can receive anything
  the agent can read. The sandbox checks the site's name, not what is sent.
- **Escapes through the operating system's kernel.** The fence is built from
  the system's own controls (`os` in `SandboxCapabilities`), not a virtual
  machine. A kernel bug can break it. A micro-VM option comes later through
  the same port.
- **CPU and memory.** There are no limits. A program can slow your machine
  down until its run is cancelled or times out.
- **Being steered.** The sandbox limits the harm of a steered agent, as
  approvals do (4.2). It doesn't stop the steering.

#### What stays outside: the bridge

Keys, integrations and approvals stay in Halonic. The agent reaches them only
by asking Halonic through the bridge (`adapters/harness-bridge`), its one
loopback address.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| Another program on your machine, or another run, uses a bridge | One bridge per run, with a new 32-byte random token, compared in constant time; any other request gets a 401 whatever its path, and no reply contains the token. On Linux (WSL's distro included) and macOS the agent host serves each bridge on a Unix socket in a new folder only you can open (mode 0700), under `bridges` in Halonic's data folder, which the sandbox hides; srt's proxy sends the name `bridge.halonic.invalid` to that socket and refuses any other. On Windows it listens on a free port of `127.0.0.1`. A run you set to "On this computer" has no sandbox and so no proxy to reach a socket: the CLI serves its bridge on a free port of `127.0.0.1`, behind the same per-run token. That program already runs with your full rights, so the port gives it nothing it couldn't reach anyway | **On `main`** (`harness-bridge.server`, `harness-bridge.socket`); the agent host's socket folder **On `main`** (HAL-6316); the unfenced run's loopback bridge (`cli.local-harness-bridge-place`, HAL-13090) |
| The agent reads the provider key | The program gets the run token where a key would go; the bridge puts the agent's key in place of it and sends the call only to the provider's fixed address, or to the provider file's own `baseUrl` through a client that checks it as a connector's address and never reaches one of Halonic's own ports: in the CLI, every open bridge's and `serve`'s. An error names the key's secret, never its value | **On `main`** (`harness-bridge.anthropic`); the CLI's own ports **On `main`** (`cli.bridge-compatible-own-ports`) |
| The provider's own web tools fetch a site the fence would stop | The bridge removes `web_search_` and `web_fetch_` tools and `mcp_servers` from every request, and refuses a content block whose source is a URL | **On `main`** (`harness-bridge.anthropic`) |
| A run outlives its bridge, or a stream hangs | Closing the bridge or aborting the run stops calls in flight; response and idle time limits; a body size limit | **On `main`** (`harness-bridge.pass-through`) |
| A run's spend isn't counted | The bridge records each call's tokens and cost in the run log | **On `main`** (`harness-bridge.spend`) |
| The agent calls tools or sends without approval | Halonic's tools are offered over MCP on the bridge, with the agent's `allow` and `approve` lists, "allow sending" and trust checks, as in the built-in loop; permission questions reach Halonic's approval card | In the bridge **On `main`** (`harness-bridge.mcp`, `harness-bridge.approvals`; Claude Code gets `--permission-prompt-tool`, `harness-claude-code.command`). Neither app offers Halonic's tools through it yet: the CLI's and Studio's bridges serve none, the CLI's refuses every permission question, and Studio's sends them to its approval card (`apps/cli/src/local-harness-host.ts`, `apps/studio/src/engine/studio-harness-host.ts`; **Planned**, HAL-6477) |
| A working folder's `.mcp.json`, hooks or permission rules bypass those lists | The adapter starts Claude Code with only Halonic's MCP server (`--strict-mcp-config`) and only the agent's own settings (`--setting-sources user`), so a folder's MCP servers, hooks and permission rules don't load. Anything they would start stays in the fence | **On `main`** for Claude Code (`harness-claude-code.command`); for Codex, no folder is marked trusted, so the folder's `.codex/config.toml` (with its MCP servers) doesn't load, and `-c project_doc_max_bytes=0` and `-c skills.include_instructions=false` keep out its `AGENTS.md` and skills: **On `main`** (`harness-codex.config`). The model provider, approval policy, web search and the bridge's token headers are also set with `-c`, which wins over any settings file, and Codex doesn't start when the working folder or its project's root holds a `.codex/config.toml` (`harness-codex.pinned-settings`) For OpenCode (approved at one exact version, `docs/adr/2026-11-24-opencode-harness-program.md`), the adapter sets `OPENCODE_DISABLE_PROJECT_CONFIG=1`, so the folder's `AGENTS.md`, `CLAUDE.md`, `.opencode/` agents and skills don't load and only Halonic's pinned instructions file does; the closed config, `update: "disable"` and `share: "disabled"` keep out models fetches, updates and sharing. Two gaps are recorded, not fixed: its shell tool inherits `OPENCODE_CONFIG_CONTENT` and `HALONIC_RUN_TOKEN`, so a command the model runs can read the run token (the same as Claude Code's `ANTHROPIC_CUSTOM_HEADERS`; the bridge treats every call with that token as the agent's), and its `opencode_worktree_remove` tool ignores its deny rule (it can do nothing the shell can't, and the fence still limits it). The adapter's contract test checks the exact tool list sent to the model, so a new or ungated tool fails CI: **Planned** (HAL-16826, adapter PR 3) |

A leaked run token gives only what that agent may already do, for that one run.

#### The fence

| Threat | Mitigation | Mark |
| --- | --- | --- |
| The agent changes what it may reach | Halonic builds the `SandboxProfile` from your profile and the trusted workspace; the agent can't change it. The workspace's definition files are read-only inside. The builder resolves the working folder through links and refuses one that leaves the workspace or the run's proposal folder, or is in `.git`, a definition folder or Halonic's data | Port and builder **on `main`** (`harness-kit.harness-profile`); a host using the builder **Planned** (HAL-187, desktop agent host) |
| A working folder where tools read settings that run outside | `workingFolder` can't start with `.` (such as `.git`, `.claude`, `.codex`), be a kind's folder, `hubs`, `integrations` (local integration code, which runs outside the sandbox) or a kind file in the workspace root, or leave the workspace | **On `main`** (`format.agent-sandbox-fields`) |
| Writes outside the agent's folders | srt allows writing only to the working, temp and settings folders; denied paths are hidden for reading and writing, read-only paths for writing; a path is never read as a pattern | **On `main`** (`sandbox-srt.profile-to-srt-config`) |
| Tool settings in the working folder that would run commands | `.claude/settings.json`, `.claude/settings.local.json`, `.codex` and `.cursor` in the working folder are write-denied. **On Windows** the tool folders (`.claude`, `.codex`, `.cursor`, `.vscode`, `.zed`, `.devcontainer`, `.husky`, `.config`) are made empty when nothing is there and denied as whole folders, so nothing can be written into them later, and `.git/hooks`, `.git/config` and `.idea` are denied when they exist. srt makes root files such as `.npmrc`, `.mcp.json` and `.pre-commit-config.yaml` empty when the session opens, as it does on Linux, and denies them; the Windows fence job shows that nothing can be written, or moved, into them. Halonic makes no placeholder of its own for them. srt does the same for two-name entries such as `.yarn/releases`, and makes each missing folder on the way (`.yarn`). When the last session on the working folder closes, Halonic removes each of these files that was missing when a session opened and is still an empty file, as srt does on Linux, and then each folder on the way that was missing and is now empty (HAL-11554, HAL-16291; the Windows fence job checks it). A file that was there before or has content stays; after a host crash the empty files stay, so they show in `git status` and an empty `.pre-commit-config.yaml` makes pre-commit fail until it is removed. In the tool folders a program can still create a file, so an empty one it made may be left; it holds no content. Open: a repository made during the session has no deny on its `.git/hooks` (HAL-11305) | **On `main`** (`sandbox-srt`, `src/srt-config.ts`, `src/windows-tool-folders.ts`, `src/windows-deny-placeholders.ts`); the Windows gap is open (HAL-11305) |
| Sending data to a site nobody allowed | Only the bridge and the allowed sites are reachable; every other host is denied without asking. `allowedSites` has at most 50 entries, no bare `*`, no addresses and no local names | **On `main`** (`sandbox-srt.profile-to-srt-config`, `format.agent-sandbox-fields`) |
| An allowed name resolves to a local or private address | srt refuses a name that resolves to loopback, link-local, cloud metadata or this computer's own addresses; Halonic adds RFC 1918, carrier-grade NAT and IPv6 unique local ranges. Only the bridge's own address and port are let through | **On `main`** (`sandbox-srt.profile-to-srt-config`) |
| A changed list of allowed sites slips past you | Harness, programs, sites and folders are part of the trust fingerprint, so a change asks for trust again | **On `main`** (`workspace.trust-agents`) |
| The host's secrets reach the agent through its environment | The program gets only the variables the profile names. Probing a program before a run passes only `PATH`, `HOME` and the locale, with no shell, a 5-second limit and output cut at 4 KB | **On `main`** (`sandbox-host.program-probe-node`, `sandbox-srt.session`) |
| Code planted by the agent runs outside the fence before it starts | The srt launcher gets only the host's absolute `PATH` (without entries the program can write) and `TMPDIR`; the program's own variables are set inside the fence. A planted `bwrap` or `NODE_OPTIONS` never runs | **On `main`** (`sandbox-srt.session`) |
| The sandbox silently doesn't confine | Before a session starts anything, it proves the fence: a canary file it must hide, a canary loopback port it must block, and a control read. A session that isn't `fenced` starts nothing | **On `main`** (`ports.sandbox-fence-proof`, `sandbox-srt.session`) |
| A process keeps running after cancel | Each program runs in its own process group; `kill`, `close`, the time limit and an aborted run stop the whole group. On macOS a program that left its group is found by a variable it carries; on Windows, which has no process groups, `taskkill /T /F` ends the tree | **On `main`** (`sandbox-srt.session`) |
| No sandbox, so the agent runs without one | `check()` gives a listed reason; when it isn't `ok`, `open` refuses and Halonic doesn't run the step. No code path falls back to running without the fence | **On `main`** (`sandbox-srt.check`, `contracts.sandbox-check`) |
| Claude Code's, Codex's or OpenCode's own sandbox breaks inside ours | Their own sandboxes are switched off only where Halonic's fence is proven around the run, and ours is the fence. Everywhere else (on this computer, or in a session whose fence isn't proven or has stopped) they are switched on where available (see "This computer") | **On `main`** (`harness-claude-code.settings`, `harness-codex.config`). OpenCode has no sandbox of its own and runs its tools with `--auto`, so its harness starts only inside a proven fence (`asks: in-sandbox`), on Linux only in v1, always with `--standalone`, and refuses to start everywhere else: **Planned** (HAL-16826, adapter PR 3) |
| You can't see what was blocked | Each blocked access becomes a `sandbox.blocked` event in the run log. srt has no structured feed of blocked accesses, so sandbox-srt's session reports only the git files it undoes when it ends (see the session's requirement) | Event and git-file reports **on `main`** (`sandbox-srt.session`); reports of what the fence blocked **Planned** (HAL-193) |
| An adapter passes its own tests but leaks | Attack tests every sandbox adapter must pass, on Linux, macOS and Windows: `~/.ssh` and keychain files, writes outside the working folder, the agent's own file, sites by name, address and DNS, the bridge without or with another run's token, your own harness settings, a process left after cancel | sandbox-srt's fence tests **on `main`**: on Linux and macOS in CI (`sandbox-fence`, `sandbox-fence-macos`), on Windows as canary probes and a session test (`sandbox-windows`); the full list as a suite every adapter must pass **Planned** (HAL-193) |

#### Linux, macOS and Windows

The fence differs per system. `check()` reports the first reason it can't
start, in this order, because its fix comes first.

- **Linux** uses bubblewrap: its own user, mount and network namespaces, with
  the network reached only through srt's proxy. It needs `bubblewrap`,
  `socat` and `ripgrep`; `check()` reports `linux-tools-missing` without
  `socat` or `ripgrep`. Inside a container (Docker, Podman) it can't nest and
  reports `container`. Under WSL 1, which can't run bubblewrap, it reports
  `not-supported`.
- **Ubuntu 24.04 and later** stop programs from creating user namespaces
  (`kernel.apparmor_restrict_unprivileged_userns`). `check()` asks bubblewrap
  itself, because Ubuntu's bubblewrap profile can let it through, and reports
  `user-namespaces-restricted` when it can't and that setting is `1`. When
  bubblewrap fails with the setting off, and `socat` and `ripgrep` are there,
  the reason is `other`, with bubblewrap's own line. There are two fixes. An
  AppArmor profile for `bwrap` lets only bubblewrap through. Turning the
  setting off lets every program on the machine create user namespaces again,
  which gives local attackers more of the kernel to attack. We recommend the
  profile.
- **macOS** uses Apple's Seatbelt through `sandbox-exec`, plus `ripgrep`.
  `check()` looks for `/usr/bin/sandbox-exec` and reports `ripgrep-missing`
  without `ripgrep`. Apple marks `sandbox-exec`
  as deprecated, so a later macOS could change or remove it.
- **WSL 2** counts as Linux and gets the full Linux sandbox.
- **Plain Windows** uses srt's Windows mode, an early (alpha) version: a
  separate sandbox user account with network filters. It needs srt's install
  for the whole machine, once, as an administrator (D44); `setUp()` runs it for
  the installer, leaving out srt's grant to read your profile. Without the
  install `check()` reports `setup-needed` and nothing runs. On Windows there are
  no process groups, so stopping a program ends its whole tree at once with
  no grace period, and a program, argument or variable with a double quote,
  a percent sign, an exclamation mark, a line break or a NUL is refused
  rather than quoted. If the
  sandbox isn't set up or fails its check, Studio is to offer to run that
  agent on this computer only after a warning you confirm. That is the "this
  computer" choice below, never a fallback Halonic makes by itself. The
  Windows mode was reviewed on 15 Nov (HAL-196) and is **opt-in and
  experimental only**. Making it the default needs a new review.
- **Windows 11 with MXC** (opt-in): Microsoft's process container, a second
  sandbox on Windows 11 Home, Pro and Enterprise (the adapter is `sandbox-mxc`,
  **On `main`**). It lets a program read and write only its working, temp and
  settings folders, read the read-only folders it was given, and nothing else;
  a denied file stays hidden even inside a folder it may read. The program has
  no network but Halonic's bridge: the internet, the local network and every
  other port on your computer are closed. The adapter, **On `main`**, offers
  MXC only on Windows 11 and reports "not offered" elsewhere. It has the trust
  check as a canary: a short test session that tries to read hidden files,
  write where it may not, and reach other ports, the router, another local
  address, the internet and DNS, while two controls prove the box isn't too
  strict. What the host does with it is **Planned** (HAL-3309, HAL-3310):
  nothing outside the adapter uses MXC today, so no app starts it. The plan:
  MXC is hidden on Windows 10, Windows Server and any computer where
  Microsoft's container reports a weaker mode; the check runs before MXC runs
  and after every change to the sandbox settings; and if it fails, **MXC
  switches itself off for that start of Halonic**, with one reason code, and
  nothing runs in another sandbox in its place, even when you chose MXC: the
  next start checks again. MXC needs a
  one-time download of Microsoft's SDK, pinned and checked by hash, which
  starts only when you pick MXC. MXC is **opt-in**: making it the default and
  the Settings switch are **Planned** (HAL-3310, HAL-3309, the screen waits
  for HAL-3290), and no release ships it before the check on a real PC has
  passed (HAL-2546) and the security review (HAL-3307). Its known limits are
  in 4.6.

#### "This computer"

You can choose, per agent and per machine, to run an agent **on this
computer**, outside the sandbox. That choice turns off everything in this
section for that agent. Studio doesn't run an agent on this computer yet: it
runs agents only in the sandbox, and an agent set to this computer fails
before its program starts (`apps/studio`, `src/engine/studio-harness-host.ts`).

What you accept with it: the agent runs with all your rights. It can read
your SSH keys, browser profiles and Halonic's own data (including the token
store, whose key sits on the same machine, see 4.4), change any file you can,
including the workspace's definitions, trust records and its own settings,
and reach any address. The OS keychain doesn't stop it either: the
desktop app keeps secrets and tokens there (4.4), so such an agent can
read those items. On Linux (Secret Service, while it's unlocked) and Windows
(Credential Manager) it gets them without a prompt; on macOS the keychain may
ask you once for each app. Approvals then only hold as long as the agent keeps to
Halonic's tools. Claude Code and Codex keep their permission prompts, routed
to Halonic's approval card. They keep their own sandboxes on macOS, and on
Linux with bubblewrap (`harness-kit.own-sandbox`). Claude Code's sandbox still
asks before every shell command, and refuses a command it can't sandbox. On
Windows, and on Linux without bubblewrap, Halonic's approval step is the only
gate on this computer. Their sandboxes are theirs, not Halonic's fence.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| A downloaded workspace moves an agent out of the sandbox | The choice lives in your profile, never in the workspace; without one, the agent runs in a sandbox | **On `main`** (`ports.agent-placement-store`, `fs-node.agent-placement-store-files`) |
| A pull changes an agent you let out | The choice is bound to the SHA-256 of the agent file's raw bytes; any change, even whitespace, puts it back in the sandbox until you choose again. A file that changed while you read the prompt isn't saved | **On `main`** (`app.agent-placement`) |
| The agent or a model takes itself out | Only a person's action saves the choice; the engine gets only the read side, and no tool reaches the store. An unreadable choice means sandbox | **On `main`** (`app.agent-placement`) |
| You forget an agent runs unfenced | A permanent label on the agent that it runs with your full access | **Planned** (phase 5) |

#### The agent host

srt runs on Node, so the desktop app runs the sandbox, the bridge and the
harnesses in a separate program, the agent host (`apps/agent-host`). Studio
starts it and talks to it over loopback; the engine, budgets, approvals and
the run log stay in Studio, and the bridge asks Studio for keys, tools and
approvals as calls on a stream. For now its bridges offer no Halonic tools.
A sandboxed agent's bridge gets the key of the workspace's provider, as in
the CLI. As in the CLI, an agent on this computer keeps its program's own
sign-in, except one whose `model` is an alias, which gets the alias's key
(`harness-host.provider-access`). Studio runs an agent on this computer in
the agent host's session there (HAL-13195), served the same way, so the only
key that reaches a program outside the sandbox is an alias's, as in the CLI
(`src/engine/studio-harness-host.ts`, `studio.harness-provider-key`). The host runs as you, outside the sandbox,
like Studio.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| Another program or a web page on your machine uses the host | The host listens only on `127.0.0.1`, with a new 32-byte random token per launch that it prints only to Studio, on standard output, and compares in constant time. A `Host` other than loopback gets a 421 (DNS rebinding), any `Origin` header a 403, a wrong or missing token a 401, all before the path is looked at. In WSL (`--stdio`) the host has no port: Studio's relay listens on Windows' loopback and passes each connection as frames over `wsl.exe`'s standard input and output, and the `Host` must name the relay's port. The host drops a frame stream that breaks the format, and stops | **On `main`** (`apps/agent-host`, `src/server/host-server.ts`) |
| Someone on your Wi-Fi sends crafted packets to the pairing advertisement | While Pair a phone is open, and only then, the host's multicast DNS socket (the one socket of the host that receives from the LAN) joins the group and sends on the one interface the gateway's LAN endpoint is on, drops a query whose source isn't on that interface's subnet (RFC 6762 section 11), and reads queries with strict limits: at most 9000 bytes and 16 questions, class IN, names of at most 255 bytes, UTF-8 labels with no dot, compression pointers that must point further back and at most 16 of them; anything else is dropped whole. It answers only a PTR question for `_halonic-pair._tcp`, with the computer's name, the gateway's LAN port and its address on that interface: no key and no code. The reply is fixed bytes built before the socket opens, so nothing of a query reaches it, and goes out at most once a second however many queries arrive. The loopback guard fails on any other `node:dgram` use in the host | **On `main`** (`apps/agent-host`, `src/remote/dns-message.ts`, `pair-advert.ts`) |
| A program or a page on this computer turns remote on or pairs a phone through the host | The `/v1/remote/*` routes sit behind the launch token, `Host` and `Origin` checks like every host route. A host offers remote only when it has a tunnel provider (the executable gives one only where `tailscale` is installed); otherwise it serves remote as not offered: it shows remote unavailable, refuses to turn it on, open a pairing or change the risky switch, and keeps no file. A pairing lives only as long as its stream, so a caller that leaves closes it, even one that leaves while it is still opening; the one exception is a caller that leaves after pressing Allow, whose phone the host still keeps once it has started to save it. Its steps name it by an id the host makes. In the desktop app, a compromised page can't do it alone either: before the shell sends turning remote on, letting phones answer risky approvals or Allow for a phone, it asks in its own native dialog, which the page can't draw or answer ("Let phones reach this computer?", "Let phones answer risky approvals?", "Pair this phone?"); Cancel, closing it, or a dialog that can't open sends nothing, and the page gets `declined`. Turning them off and Don't allow pass without asking. Opening Pair a phone doesn't ask: it turns remote on and saves `on: true` while the pairing lasts, and turns remote off again when the pairing ends without a phone, so a page alone can open the tunnel for as long as it holds a pairing, but can't pair a phone without the shell's "Pair this phone?". A pairing that ends with a phone leaves remote on | **Lands with #4479** (`agent-host.remote-routes`, `agent-host.remote-not-offered`); the shell's questions **On `main`** (`studio.src-tauri.remote-saves-ask`, HAL-17795) |
| A sandboxed agent's provider key leaks through the host | Studio sends the host only the key's secret name; the host asks Studio for its value only when the bridge calls the provider, and only for a secret the bridge's providers name. Studio checks before the bridge opens that the key may go to the provider's address, with the model calls' own check. The host's bridge reaches a provider's own `baseUrl` only through a client that checks the address as a connector's (`connectorHostClass`), as the CLI's bridge does, and never reaches one of Halonic's own ports (`agent-host.compatible-provider-client`), and Anthropic's and OpenAI's own hosts through one that reaches nothing else. The host removes every key value it was given from a `bridge.failed`, and Studio removes it again before the run log records it | **Lands with HAL-13795 and HAL-13798** (`apps/agent-host`, `src/bridge/studio-services.ts`, `src/host.ts`; `apps/studio`, `src/engine/studio-provider-keys.ts`) |
| The profile Studio sends loosens the fence | The host opens a session only for a profile it built on `POST /v1/harnesses/profile` and hasn't opened a session for yet: every field as built, with only the harness's own variables added to `env` (no built variable changed or named again in another case). Anything else is a 403 `profile_not_built` and nothing opens; a host without a profile folder builds none, so it opens none. Before that, the host checks the body's shape: every field present, nothing extra, every path absolute | **On `main`** (`apps/agent-host`, `src/sandbox/built-profiles.ts`, `sandbox-routes.ts`, `src/harness/host-profiles.ts`; `agent-host.built-profile-sessions`) |
| Studio's profile request widens the fence or names a folder the person didn't open | `POST /v1/harnesses/profile` takes only the agent's working folder, sites and proposal folder, and the bridge by id. The workspace must be one the launcher named (by real path), the data folder, the home folder and the program's variables are the host's own, the body takes no other field, and the builder refuses a working folder outside the workspace, in a protected folder or in a denied one. An instructions folder must be one the host made on `POST /v1/harnesses/instructions` and hasn't removed; any other path is a 404 `unknown_instructions`. The answer never holds the bridge's token | **On `main`** (`apps/agent-host`, `src/harness/host-profiles.ts`, `profile-route.ts`) |
| Studio's proposal request opens a folder for a workspace the person didn't open | `POST /v1/proposals/{open,folder-of,end,start}` take the workspace and the run, and nothing else. The workspace must be one the launcher named (by real path); any other is a 404 and nothing is made. Worktrees, copies and records go in Halonic's data folder, never in the workspace, and git starts only when a run first needs a worktree | **On `main`** (`apps/agent-host`, `src/harness/host-proposals.ts`, `proposal-routes.ts`) |
| Studio's decision request writes a text the run never proposed, or undoes a step into another workspace | `POST /v1/proposals/{list,accept,reject,restore,settle}` take the workspace, the run, a file's path or `all`, and for Undo and Redo only an id the host made. The host keeps each step's texts itself (at most 200, none across a restart), so it writes only what the run proposal service produced; a step restores only for the workspace that made it, and a settled proposal's steps go. Accept keeps the service's checks: a file is written only while it is still the run's base, and never under `.git/` or `.halonic/`, nor in the profile folder when the workspace holds it, as with the home folder as the workspace (HAL-15201; `halonic proposals accept` alike). The page can't reach these routes until the shell's route list names them | **On `main`** (`apps/agent-host`, `src/harness/proposal-decision-routes.ts`, `proposal-undo-steps.ts`) |
| Studio's Compare request writes over an edit the person didn't see, or a text the run never proposed | `POST /v1/proposals/choose` takes the workspace, the run, a file's path, `use-run` or `combine-both`, and `seen`, the digest `…/compare` answered for the saved text. The host works out the text itself, the run's or both put together by the run proposal service, and writes it only while the saved file still has `seen`, so an edit made after Compare showed it is never lost. A file already decided, one the run doesn't propose, and one under `.git/` or `.halonic/` are refused as for Accept. `…/compare` and `…/done` only read; `…/remove` removes only a proposal whose texts are gone, and drops its steps | **On `main`** (`apps/agent-host`, `src/harness/proposal-decision-routes.ts`; `packages/core/app`, `run-proposal-decisions.ts`) |
| Studio's placement request takes an agent out of its sandbox for a workspace the person didn't open | `POST /v1/placements/{get,save,remove}` take the key or the choice's five fields, and nothing else. The location must be the real path of a workspace the launcher named; any other is a 404 and nothing is read or written. A choice is only `this-computer`, and a choice that can't be read is a 422, never "none". The files are the CLI's own, in the profile folder, never in a workspace | **On `main`** (`apps/agent-host`, `src/harness/host-placements.ts`, `placement-routes.ts`) |
| Studio's instructions request writes or removes files outside the run's own folder | `POST /v1/harnesses/instructions` takes the workspace and the files by name and text, and nothing else. The workspace must be the real path of one the launcher named; any other is a 404 and nothing is made. Only `AGENTS.md` and a skill's `SKILL.md` are written, read-only, in a new folder the host picks in the profile's harness temp folder. `…/instructions/release` removes only a folder the host made, and leaves any other path alone. Whether the instructions are trusted is checked in Studio, against the person's own records | **On `main`** (`apps/agent-host`, `src/harness/host-instructions.ts`, `instruction-routes.ts`) |
| Studio's page starts an agent outside the sandbox that the person didn't let out | `POST /v1/sandbox/this-computer/open` opens a session without the sandbox only once the host's gate passes on its own records: a workspace the launcher named, a trust record listing the agent as its file is now, the person's "On this computer" choice for that file's exact bytes, and the person's trust in its instructions as they are now; and only with a profile the host built for that agent, which the open takes, so it opens once. Without a profile folder, and on Windows, the host offers none (`403 not_offered`) | **On `main`** (`apps/agent-host`, `src/this-computer/`; `agent-host-client.this-computer`, `agent-host.this-computer-sessions`, `agent-host.unfenced-gate`) |
| Studio's page makes a program outside the sandbox run code of its choice through its environment (`PATH`, `NODE_OPTIONS`, `LD_PRELOAD`) or its command line (an instructions folder with a plugin's hooks, passed as `--plugin-dir`) | A run in a session without the sandbox starts only for the agent the host opened the session for and with no instructions folder but the one the host made and built the session's profile with, otherwise `403 task_not_host`; and only when its environment is exactly the host's: the profile the host built for the session plus the harness's own variables for the run's bridge and task, which the host works out itself, otherwise `403 environment_not_host`. Both are checked before the bridge binds or the harness starts. A session without a fence that the host didn't open for an agent on this computer starts nothing | **On `main`** (`apps/agent-host`, `src/this-computer/unfenced-sessions.ts`; `agent-host.unfenced-start`) |
| The bridge's run token leaks over the host's loopback | A run names its bridge and its session by ids the host makes, so the run token crosses loopback once, when the bridge opens, and only to Studio. The host asks Studio only for the secrets the run's providers name | **On `main`** (`apps/agent-host`, `src/harness`, `src/bridge`) |
| A caller fills the host's memory or holds it open | Bodies of at most 1 MiB, refused before reading when the length says more; a stream with more than 4 MiB unread is dropped; at most 64 sessions and 64 bridges | **On `main`** (`apps/agent-host`, `src/server`) |
| A sandboxed program outlives Studio | The host stops when its standard input closes. It cancels every run and then closes every session before it stops serving | **On `main`** (`apps/agent-host`, `src/host.ts`) |
| The host's unpacked files are changed | On launch the host checks every unpacked file against the SHA-256 the executable carries, and unpacks again when one differs. It runs a program for sandbox-srt only from this version's folder, and only while that file has its digest | **On `main`** (`apps/agent-host`, `src/main.ts`) |
| A caller makes the host run a program of its choice | `POST /v1/harnesses/sign-in` runs only a harness's own sign-in (`claude auth login`, `codex login`), found on the `PATH`, with plain-word arguments. The caller chooses only the settings folder, which must be absolute, travels as one variable, in the environment on Windows and Linux and single-quoted for `sh` in the macOS launch file, so no shell expands it; a folder under a skill's `scripts/` is refused | **On `main`** (`apps/agent-host`, `src/harness/sign-in-route.ts`, `src/terminal`) |
| A caller learns or makes a folder outside an agent's own settings folder | `POST /v1/harnesses/settings-folder` takes only the workspace, the agent's id and the harness. The workspace must be one the launcher named (by real path); the folder is the profile's `harness-settings/<agentId>/<harnessId>`, an id that can't name a folder safely is refused, and the folder is made private. It holds no sign-in until the person signs in there themselves | **On `main`** (`apps/agent-host`, `src/harness/settings-folder-route.ts`) |
| A sandboxed agent changes the host's unpacked files | The folder is in Halonic's data, so the profiles Studio builds deny it, with the rest of that data (the `halonic-data` group) | Builder **on `main`** (`harness-kit.harness-profile`); Studio using it **On `main`** where the shell starts the host (`apps/studio`, `src-tauri/src/agent_host_start.rs`) |

Studio's side is **On `main`**: the shell starts the host on the first call to
it, and at every launch until the version has proved itself
(`src-tauri/src/agent_host_start.rs`, `updates_way_back.rs`). The page calls the
host's routes only through the shell's `agent_host_*` commands, for connector
listings, plugins and Google sign-in setup (`src/connect/agent-host-tool-lister.ts`,
`src/plugins/provide-plugins.ts`, `src/google/provide-google-setup.ts`), and for
runs of agents in a harness. The page's own engine (`src/engine/engine-service.ts`)
runs such an agent in the agent host's sandbox, with the host's profiles,
bridges and proposal folders (`src/engine/studio-harness-host.ts`, HAL-10849).
Where no agent host runs, it refuses a workflow with such an agent as
`unavailable`. It refuses an agent that lists a connector the same way, so no
Studio run starts a connector.

The background engine (B1, HAL-14206): the desktop engine runs in its own
program, which the shell starts and which keeps routines and timers running
while the window is closed
([ADR](../adr/2026-11-20-desktop-engine-runs-in-its-own-process.md)). These rows
say what it holds to; each says what is on `main` and what is still planned.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| Another program, another user of this computer or a web page drives the background engine: starts or cancels runs, answers approvals, fires routines | The engine listens only on `127.0.0.1`, on a port the system picks, with a new 32-byte token per launch that only the shell knows, compared in constant time. A wrong `Host` gets a 421, any `Origin` header a 403, a wrong or missing token a 401, all before the path is looked at; no route is served without the token. The engine serves only the run routes, the two routine routes and the chat-turn route: no trust, provider-key, webhook, Google or page routes. The chat-turn route sends a stored key only to an address a provider file of the trusted live version names with that secret, because the engine role can't be built without that check (`server.engine-server`). Its Node listener uses the agent host's own limits (request times, the connection cap and the body size) and holds at most 8 open run-update streams: past them a new stream gets `503 too_many_streams` after the token checks, and no open stream is dropped (`agent-host.engine-listener`, `agent-host.engine-run-updates-cap`; the refusals are tested over a real socket). The page reaches it only through the shell's `engine_request` and `engine_stream`, by route name, granted to the main window only | **On `main`** (`agent-host.engine-listener`, `agent-host.engine-run-updates-cap`; the shell's `engine_request` and `engine_stream`) |
| A compromised or buggy engine asks the shell for a secret it shouldn't have: the CLI's token key, the `serve` password hash, another plugin's secret | The shell answers only workspace secrets, refusing `token_key`, `serve_password`, `halonic_token_*` and `plugin__*` by rule in Rust; tokens only through a separate token request; and a key's allowed origins read-only. It answers only for a workspace trusted on this computer. The engine can't set or delete a secret or add an origin. Values stay in memory for one step, are added to redaction, and are never written, logged, or put in arguments or the environment. Keychain calls time out and answer `unavailable` | **On `main`** (`studio.src-tauri.crates.secret-broker.engine-secret-broker`, `agent-host.engine-step-secrets`) |
| The engine sends malformed or oversized frames over its control pipe to crash or stall the shell, or to slip a value into the shell's log | Length-prefixed frames with a hard size cap, a closed set of message kinds and strict parsing; any fault closes the pipe, stops the engine and counts toward its restart limit. The shell never logs a frame's content, and reads frames off the UI thread into a bounded queue | **On `main`** (`agent-host.engine-control-pipe`, `studio.src-tauri.crates.engine-pipe.control-pipe`) |
| A workspace changed by a `git pull` while the window is closed runs new programs in the background | The engine reads the same trust records and checks again when a routine fires and right before each harness step. A run that needs a grant starts nothing and leaves one "needs your trust" Inbox item, which only opens the window; the grant is still the native dialog, over a fingerprint worked out again at review time | The check when a routine fires and before each step **On `main`** (HAL-12811); the "needs your trust" Inbox item **Planned** |
| The app starts at login and runs agents with access to your keys without you noticing, or a script in the page turns this on | Off by default. Turned on only through a shell command called from Settings, with its arguments fixed in Rust (`--background`). A per-user entry (HKCU `Run` on Windows, a LaunchAgent on macOS, XDG autostart on Linux) holding the installed path, quoted, and removed on uninstall. A background engine always shows a tray icon; where no tray is available, the app doesn't run in the background, and on Linux, where a tray can build with nothing showing, a start at login exits until the shell can tell. A start at login opens no window and takes its workspaces only from the profile's list of those open at the last Quit, never from arguments; each must still be a folder the person picked, unchanged, and a workspace, and its engine checks trust as every engine does. A program running as you can add or change the entry: the known limit for anything running as the same user | The login item's commands (`studio.src-tauri.crates.login-item.login-item`) and the `--background` start (`studio.src-tauri.background-start`) **On `main`**; the Settings switch **in review** (HAL-18087) |

#### Known limits

- **MXC: names may leave the box (not confirmed).** Lookups go through Windows'
  DNS client service, outside the box. A program could encode what it can read
  in the names it looks up. On `windows-11-arm` a test (HAL-9605) shows a
  lookup from the box sends no query to a counting DNS server and fails at
  once (`ENOTFOUND`, or `ERR_ACCESS_DENIED` with Node's layer on). Whether the
  box fences the client or the client turns the box away for lack of a network
  capability is not known; a profile that grants that capability needs the
  test re-checked. The canary still reports `nameLookupsLeave: true` as a
  cautious assumption. That `halonic doctor` says so while MXC is in use is
  **Planned** with the host wiring (HAL-3309); doctor doesn't know about MXC
  today.
- **MXC: pnpm and other tools that look up the drive root don't work.** They
  fail with `EPERM` on `C:\`. Halonic doesn't run them outside the box
  instead, because that runs untrusted package scripts without the fence, and
  doesn't make the drive root readable, because that shows every file name on
  the drive. Node scripts and git work. A limit, not a leak.
- **MXC: `cmd /c dir` is refused, even on the box's own folder.** Tools that
  list folders through Node work, and so does reading and writing files.
  Scripts and `.cmd` shims that shell out to `dir` fail. A limit, not a leak.
- **MXC: the permission that lets the box reach the bridge works both ways.**
  In CI the box couldn't reach the internet and the host couldn't connect in,
  but CI has no local network. The trust check probes the router and another
  local address, and the real-PC check (HAL-2546) tests both directions. The
  probes don't cover the bridge itself (`CONNECT`, or another host or port
  through it): the bridge is the box's only network control and isn't probed. Until it has passed, MXC ships in no release.
- **Subscription sign-in (D43).** An agent signed in with your Claude or
  ChatGPT plan keeps that token in its own settings folder, inside the
  sandbox, and the provider's sites are allowed. A tricked agent can read the
  token and send it, but only to that provider. Spend isn't counted for these
  runs.
- **The bridge is reachable by every program running as you.** The run token
  is what keeps them out. It lives in the sandboxed program's environment and
  in Halonic's memory for that run.
- **The fence proof is a sample.** It shows one file hidden and one port
  blocked when the session opens, not that every rule holds.
- **Same user.** The sandboxed program runs as your account. A fence escape
  lands with all your rights.
- **The agent host is reachable by every program running as you**, like the
  bridge (in WSL, through Studio's relay). Its token is what keeps them out, and it lives only in the host's
  and Studio's memory. A program running as you can also change the host's
  unpacked files between launches, or the executable itself; the digest
  check finds the first only at the next launch.
- **How the `halonic-data` group keeps other runs out differs on Windows.**
  On Linux and macOS it denies the data folder as a whole and reopens only
  the run's own folders, so a folder another run makes there later is denied
  too (HAL-5644). On Windows a deny on the data folder itself would also keep
  a program from looking at the folders on the way to its own, and Node
  can't start a script there, so the profile denies the data folder's other
  entries by name when the session opens. What is made later is kept out by
  the data folder's own access list: it is in the user profile, which the
  sandbox reads only where a grant names (with `HALONIC_HOME` elsewhere,
  that folder's access list decides). srt, though, runs every sandboxed
  program under one account and sets its grants on the folders themselves,
  where they win over a deny a folder inherits from a denied parent. The
  integration runner's profile treats the home folder and the socket folders
  the same way: denied as a whole and reopened on Linux and macOS, their
  other entries denied by name on Windows (HAL-5808). That leaves two limits
  on Windows (HAL-5882):
  - **On Windows, a sandboxed run can read folders granted to any other
    sandboxed run that is running at the same time**, whatever its profile
    denies. The window ends when the other run closes, not when this one
    does (HAL-5810). Closing it needs srt to keep sessions' reads apart;
    until it does, this limit goes in the release notes of any release that
    ships the Windows sandbox.
  - **On Windows, a sandboxed run can read the working and temp folders of
    every earlier run**, because srt keeps their write grants until
    `srt-win acl forget` removes them. Closed by HAL-5884: the host forgets
    a session's grants when it closes, also for runs still open then, and
    sweeps the grants of crashed runs when it starts.

### 4.7 Sandbox backends on Windows (B8)

Windows gets three choices ([ADR](../adr/2026-11-11-pluggable-sandbox-layer.md)):
srt inside Halonic's own WSL distro (`srt-wsl`, the default), srt's native
Windows mode (experimental), and "continue without a sandbox", where the
agent asks before every command. Native srt was reviewed on 15 Nov (HAL-196):
it is opt-in and experimental only, and making it the default needs a new
review. The rows below are the security review's conditions (HAL-5407): what
each backend must do before a release may offer it. Each row's mark says
whether it is built.

**Release rule.** A backend can be offered in a release only when every row
marked **[gate]** is **On `main`** or has a case in that backend's attack
suite, and its open probes are answered.

#### `srt-wsl`: srt inside Halonic's WSL distro

Three boundaries: the agent and the rest of the distro (bubblewrap through
srt, as on Linux); the distro and Windows (interop off, no automatic drive
mounts, only the project's own folder mounted when you keep a project on the
Windows drive); Studio on Windows and the engine in the distro (standard input
and output of `wsl.exe`). You are trusted over the distro: you can open it as
root. What matters is the distro reaching Windows.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| **[gate]** An agent on one project reads another project, a Windows-drive project mount or Halonic's data in the distro. srt on Linux leaves reads open (`/` read-only), so every file the `halonic` user can read is readable unless denied | The profile denies the other projects, the other Windows-drive mounts, `/mnt/wsl`, Halonic's data in the distro, the other harnesses' settings folders and the writable parts of `/opt/halonic`. bubblewrap's deny lasts one session, so nothing stays behind. The home, `/mnt/halonic` and `/mnt/wsl` are each denied as a whole, with only the session's own folders re-allowed inside, so a project or mount made during a session stays hidden from it; a missing one stops the session from opening. Residual (accepted, HAL-6147): mount point names stay visible in `/proc/self/mountinfo`. Attack-suite case: a session on one project reads a canary in another, also one made after it opened | The deny **On `main`** (`sandbox-srt.shared-folders`, fence case for folders made after the session opened); passing `WSL_SHARED_FOLDERS` and creating `/mnt/halonic` when Studio starts the distro **On `main`** (`studio.src-tauri.crates.agent-host.wsl-launch`, `infra/wsl-image/files/wsl.conf`) |
| **[gate]** Root in the distro reaches all of Windows: it can mount a Windows drive whatever `wsl.conf` says, and switch interop back on | Agents never run as root: no `sudo`, the root password locked. The updater, which runs as root, never runs or reads a file the `halonic` user can write, and checks a new runtime's SHA-256 on the Windows side before copying it in. A new updater comes only inside that checked runtime, is run once before it replaces the old one, and goes back with a rollback | No `sudo` and a locked root **On `main`** (`infra/wsl-image`); the updater **On `main`** (`infra/wsl-image/files/halonic-runtime`, `studio.src-tauri.crates.agent-host.runtime-update`) |
| Programs with the setuid bit give more ways to become root | The image removes it from `su`, `mount`, `umount`, `newgrp`, `chsh`, `chfn` and `gpasswd`, and its check refuses any setuid or setgid file (the allowed list is empty) | **On `main`** (`infra/wsl-image/check.sh`) |
| An agent starts `cmd.exe` or `powershell.exe` through interop | `[interop] enabled=false`. Inside srt the socket interop needs is refused anyway (seen with interop on) | **On `main`** (`infra/wsl-image/files/wsl.conf`) |
| The Windows drive is mounted | `[automount] enabled=false` | **On `main`** (`infra/wsl-image/files/wsl.conf`) |
| A planted `/etc/fstab` mounts a drive at the next start (root-only file) | `mountFsTab=false` | **On `main`** (`infra/wsl-image/check.sh`) |
| **[gate]** While a folder is imported from Windows, every process in the distro sees it; a drive mount without `metadata` shows every file as writable by everyone | The import mount is read-only, `noexec,nosuid,nodev`, under a new random name, and unmounted when the import ends, or at the next start after a crash. A project mount belongs to `halonic` with `umask=077`, `nosuid,nodev`, and holds the project folder only, never a parent | Mount options, unmounting and the clean-up at each start **On `main`** (`sandbox-srt.wsl-mounts`, `halonic-runtime cleanup-import-mounts`); Studio using the import and project mounts **Planned** (HAL-12443) |
| **[gate]** A junction or link inside a mounted project folder points at your Windows files, such as `.ssh` | Must not be readable through the mount. Real-PC probe | **Planned** (HAL-10975) |
| **[gate]** Docker Desktop puts its socket into our distro when `halonic` is the default distro. The socket is root on Docker's VM, which mounts the Windows drives | Studio always names the distro (`wsl.exe -d halonic`). When the setup is done, it reports the residual `default-distro` when `halonic` is the default distro, and `docker-desktop-visible` when Docker's socket or its `/mnt/wsl` folder can be seen. srt refuses new Unix sockets, and `/mnt/wsl` is denied. Real-PC probe | Naming the distro **On `main`** (`studio.src-tauri.crates.agent-host.wsl-launch`, `sandbox-srt.wsl-setup`); the default and Docker checks once at setup **On `main`** (`sandbox-srt.wsl-setup`); Studio running the setup **Planned** (HAL-5405); both checks at every start of the host in the distro, shown as residuals, **On `main`** (the shell reads whether `halonic` is the default distro each time it starts the host there; a list it can't read counts as not the default, and is logged); the real-PC probe **Planned** (HAL-10975) |
| A planted `wsl.exe` earlier on `PATH`, or your text reaching a shell | Studio starts `wsl.exe` from `System32` by full path, with `-d halonic --exec` and fixed arguments; project names and paths go over standard input, never on the command line | **On `main`** (`studio.src-tauri.crates.agent-host.wsl-launch`), and Studio calling it |
| Another distro named `halonic` | Distros belong to one Windows user, so only you can register one. The setup refuses to import over a `halonic` it didn't record (`distro-not-ours`) | **On `main`** (`sandbox-srt.wsl-setup`, `sandbox-srt.wsl-remove`); Studio running the setup **Planned** (HAL-5405) |
| All of your WSL 2 distros share one network. A server in your own Ubuntu on `localhost` is reachable from ours | The sandboxed agent has no network but srt's proxy, which refuses loopback and private addresses. The engine and agent host in the distro listen on no port. With mirrored networking, `localhost` in the distro is Windows' own: the bridge listens on a Unix socket in a private folder rather than a port, and the trust check's canary probes run in both modes. Studio's relay listens on Windows' `127.0.0.1`: under NAT (the default) another distro can't reach it. CI probed this through the distro's own `127.0.0.1` and through its gateway to Windows; a control port on all of Windows' addresses was reached through the gateway, the `127.0.0.1` port wasn't (HAL-7130). Under mirrored networking Microsoft documents that a distro reaches Windows' `127.0.0.1`, so expect another distro to reach the relay there: only the host token and the `Host` check stop it, as for the loopback host elsewhere. CI can't run mirrored networking, so this is a real-PC probe | Proxy rules **On `main`** (`sandbox-srt.profile-to-srt-config`); the agent host's `--stdio` mode **On `main`** (`apps/agent-host`, `src/stdio`); Studio's relay **On `main`** (`studio.src-tauri.crates.agent-host.relay`), and Studio calling it; the bridge off its port **Planned** (HAL-6316) |
| **[gate]** Removing the sandbox setup deletes every project in the distro | An explicit choice that offers an export first, and only a distro Halonic recorded as its own is removed | **On `main`** (`sandbox-srt.wsl-remove`); Studio offers it through the agent host (`apps/studio`, `src/studio/agent-sandbox-host.ts`, `settings.wsl-remove-dialog`) |
| Debian updates run as root | Signed `apt` from Debian's mirrors, checked with the archive keyring, at most once a day, outside agent sessions | Signed sources **On `main`** (`infra/wsl-image`); the updater's step **On `main`** (`halonic-runtime security-update`: at most once a day, never while a sandbox runs); a warning when they haven't run for 7 days **On `main`** (`security-updates-overdue`); Studio running the step **On `main`** (the shell runs it each time it starts the host in the distro, before the host starts, for at most 180 seconds; a failure or a timeout is logged and the host starts anyway) |

**Known limits.**

- **The kernel is shared.** The distro runs Microsoft's WSL kernel, shared by
  all of your distros and updated by WSL, not by Halonic. A kernel bug can
  break the fence, as on Linux. The setup reads the kernel version in the
  distro and, below a floor (5.15.153.1, HAL-10557), stops with
  `kernel-too-old` and offers `wsl --update`: **On `main`**
  (`sandbox-srt.wsl-setup`, W11); Studio running the setup **Planned**
  (HAL-5405). The trust check doesn't read it.
- **Your Windows tools run what the agent wrote.** Opening a project in the
  distro from a Windows git client, VS Code or Explorer runs
  their settings and hooks with your rights. srt stops the agent writing
  `.git/hooks`, `.git/config`, `.vscode`, `.idea`, `.zed`, `.devcontainer`, the
  configs of hook managers (pre-commit, lefthook, lint-staged, simple-git-hooks)
  and shell startup files; the other files it wrote are still yours to open
  with care. lint-staged and simple-git-hooks can also read their config from
  `package.json`, which stays writable because the agent edits it all the time.

#### Continue without a sandbox

The claim is "every shell command, and every file outside the project, needs
your yes". Asking is not a fence. These are the paths where a command could
run without a prompt; each becomes a case in this mode's attack suite.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| **[gate]** The agent writes tool settings inside the project (Claude Code's `.claude/settings*.json`: allowed commands, hooks, status line, key helper, plugins; Codex's `.codex/config.toml`), and the next turn runs them | Claude Code starts with only Halonic's settings source, `--strict-mcp-config` and an explicit permission mode; Codex with its home in Halonic's data and the approval policy on the command line. An edit to `.claude/`, `.codex/`, `.cursor/`, `.mcp.json`, `.vscode/`, `.idea/`, anything in `.git/`, `.envrc`, `.gitmodules` or shell startup files always asks, even inside the project | **Planned** (HAL-5397) |
| **[gate]** Codex runs commands on its own "safe" list without asking. `git status` runs a `core.fsmonitor` from `.git/config`; `git diff` runs a diff or text-conversion driver | Every command asks, with no list that skips the prompt. If the Codex version we pin can't do that, Codex doesn't run in this mode | **Planned** (HAL-5397) |
| **[gate]** A path looks inside the project but isn't: a link or junction, `..`, a Windows short name (`ABCDEF~1`), a `\\?\` or `\\.\` prefix, a network path, a file stream (`file:stream`), a different case, a hard link | The approve tool resolves the real path of the target, and of its folder for writes, compares it with the project's real path and asks when in doubt. Device paths and streams are refused | **Planned** (HAL-5397) |
| MCP servers and hooks from the project start without a prompt | Only Halonic's MCP server and settings load, as in the sandbox (4.6) | **Planned** (HAL-5397) |
| Halonic's own tools that run code (plugins, integrations, stdio connectors) | They keep their own consent and are listed under "More info". No Halonic tool runs a shell command for the agent in this mode | **Planned** (HAL-5397) |
| The approval card hides part of the command: a long line, a line break, control or bidirectional characters | The card shows the whole command, escapes those characters and wraps rather than cuts. A very long command asks with a warning | **Planned** (HAL-5397) |
| A compromised page turns the sandbox off without asking | Before the desktop shell saves the choice `none`, it asks "Continue without a sandbox?" in its own native dialog, which the page can't draw or answer; Cancel, closing it, or a dialog that can't open saves nothing and keeps the choice as it was. The page's own prompt still shows first; it is a convenience, the native dialog is the check | **On `main`** (`studio.src-tauri.sandbox-choice-save-asks`, HAL-16342) |
| A compromised page saves the yes to run plugins and integrations without the sandbox | Before the desktop shell sends `POST /v1/unfenced-runs/allow` to the agent host, it asks "Allow plugins and integrations to run without the sandbox?" in its own native dialog, which the page can't draw or answer; Cancel, closing it, or a dialog that can't open sends nothing, so no yes is saved, and the page gets `declined`. The page's own checkbox and Allow still come first; they are a convenience, the native dialog is the check. The host still saves a yes only for the reason that holds now | **In review** (`studio.src-tauri.unfenced-allow-asks`, HAL-16466) |
| No answer, or no Studio window to ask in | No answer means no. A run started from the CLI in this mode, with no way to ask, is refused | **Planned** (HAL-5397) |
| A command you allow sees your tokens in its environment | The launcher passes only the profile's variables, as in the sandbox | **Planned** (HAL-5397) |

**Known limits.**

- **An allowed command can start more.** `npm test` runs package scripts and a
  dev server keeps running after the turn. The card says so, and this mode
  has no "allow always".
- **Reads inside the project need no prompt.** A secret kept in the project,
  such as a `.env` file, can be read and sent to the model provider without a
  prompt.

#### Native srt on Windows (experimental)

The limits are in the [ADR](../adr/2026-11-11-pluggable-sandbox-layer.md):
name lookups leave the fence, reads are open by default, kept folders stay
readable to srt's sandbox account, the WSL service is reachable, and Windows'
own TLS fails inside. Another session can't write a kept folder (HAL-5432).
Plugins stay unfenced on Windows (`packages/core/app`, `runner-fence.ts`).

| Threat | Mitigation | Mark |
| --- | --- | --- |
| **[gate]** A tool folder on `PATH` granted for reading is your profile itself, `AppData`, `.` or a folder with secrets | Only `PATH` entries strictly below the profile, never the profile, `AppData`, `AppData\Roaming` or `AppData\Local` as a whole, nor a folder on the deny list or above it. Relative entries are dropped. A contract test holds those cases | **Planned** (HAL-5398) |
| **[gate]** A crash between a grant and its record leaves a folder granted forever | The folder is recorded before srt grants it and confirmed after. Removing the setup and uninstalling forget every grant, recorded or not | The record **On `main`** (`sandbox-srt.kept-grants`); removing the setup takes back the grants srt kept for you before its uninstall **On `main`** (`sandbox-srt.remove`); the rest of uninstalling **Planned** (HAL-5404) |
| A rollback to an older setup version keeps grants under the old account | A rollback that can't uninstall first is refused | **Planned** (HAL-5404) |
| Another program's srt shares the machine-wide sandbox account and reads our kept folders | The trust check reports it when another program's srt setup is present, not only a second Halonic user | **Planned** (HAL-5398) |
| The sandbox account registers a WSL distro of its own and escapes through it | Probed on Windows Server 2025: refused (WSL 1 and WSL 2, in three folders), while the same import works outside srt. A reachable WSL service stays a limit, not an escape. To confirm on Windows 11 | **Probed** (`sandbox-srt`, `scripts/windows-wsl-probe.mjs`) |

The DNS leak is what keeps native srt experimental. So does the Windows gap in
the tool settings of the working folder (4.6): a repository made during the
session has no deny on its git hooks until HAL-11305 closes it.

#### Open probes

- **CI:** WSL 2 starts on GitHub's free `windows-2025` runner (3 runs out of 3),
  so the `srt-wsl` attack suite can run in CI. GitHub doesn't officially
  support nested virtualisation there, so the suite reports "not testable",
  never a pass, when WSL 2 won't start.
- **Real-PC test** (Windows 11): WebDAV with native srt, `wsl --import` by the
  sandbox account, a junction in a mounted project folder, Docker Desktop with
  `halonic` as the only distro, and mirrored networking (does another distro
  reach a port on Windows' `127.0.0.1`, as Microsoft documents?). CI can't answer these: on the
  `windows-2025` runner, WSL can't set up mirrored networking and falls back to
  none (`0x803b0015`).

### 4.8 Plugins (B9)

A plugin is a folder someone else often wrote, which you add to your profile.
Its backend runs in the integration worker, its local tools in a sandbox
session, and Studio draws its `ui` as text. [Plugins and security](plugins.md)
explains the fences; these are the threats, part by part. The attack tests
named here run in CI on every pull request, and those under a `fence` folder in
a real sandbox. Plugin secrets and sign-ins are in
[4.4](#44-secrets-tokens-and-outbound-calls-b4) and [4.6](#46-agents-in-a-sandbox-b8).

| Threat | Mitigation | Mark |
| --- | --- | --- |
| A plugin's files change after you trusted it: a file edited, added, hidden, renamed, moved or swapped | The fingerprint covers the manifest and every file, by path and SHA-256, so any change turns the plugin off until you trust it again. A link or special file anywhere refuses the whole folder | **On `main`** (`app.plugin-trust`, `contracts.trust-fingerprint`; `packages/core/app/src/plugin-trust-attacks.test.ts`) |
| A workspace or another program trusts or adds a plugin for you, or adding one writes outside the plugins folder | Adding a plugin copies it into the profile's plugins folder only; the trust record lives in the profile, which a workspace can't write. The CLI's installer refuses unsafe names, links, `.git`, and a plugins or staging folder that is a link | CLI **On `main`** (`app.plugin-add`, `fs-node.plugin-folder`, `fs-node.plugin-folder-plain`); Studio's installer, which follows no link either, **On `main`** (`apps/studio`; `studio.src-tauri.plugin-folder-place`, still a draft) |
| A plugin changes between the trust check and a start | A backend's every start, also after an idle stop, reads the folder and checks trust again; a local tool's every session does too, and runs from a copy of the files it just checked | **On `main`** (`app.plugin-backend`, `app.trusted-runner-start`, `app.plugin-local-tools`, `connector-stdio-sandbox.local-tool-plugin-copy`; `apps/cli/src/plugin-local-tool-attacks.test.ts`, `apps/agent-host/src/plugin/host-plugin-local-tool-attacks.test.ts`, `apps/cli/fence/plugin-local-tool-attacks.fence.test.ts`) |
| A backend reaches past the kit: an undeclared host, Node's modules, another plugin's secret | The backend runs in the worker, never in Halonic's process; the kit is its only way out (see 4.4). Its secrets are only its own `plugin__<id>__…` names, and only tools the manifest declares are offered | **On `main`** (`integration-runner.plugin-backend`, `integration-kit.plugin-secrets`, `integration-kit.declared-hosts-only`; `packages/adapters/integration-runner/fence/runner-attacks.test.ts`, `packages/adapters/integration-runner/src/halonic/kit-attacks.test.ts`) |
| Plugin code runs without the sandbox | Every start goes through `RunnerStartGate`. A failed sandbox check means `stopped`, never a fallback. The `halonic` command never offers the yes (its store holds nothing); Studio asks for it in the plugin's trust check, for the reason at that start, and the desktop shell asks again in its own native dialog before it sends the yes to the host. | **On `main`** (`app.runner-start-gate`, `agent-host.unfenced-runs-routes`, `studio.desktop-unfenced-runs`, `app.no-unfenced-run-consent`); the shell's question **In review** (`studio.src-tauri.unfenced-allow-asks`, HAL-16466) |
| Taking the yes back in one app leaves code running in another | Each process reads the saved yes again every second while it has runs without the sandbox and stops them when it's gone or was given again; Take back waits for starts in progress, and a stop that never returns doesn't end the checks | **On `main`** (`app.unfenced-runs`, `app.runner-start-gate`; `packages/core/app/src/unfenced-run-attacks.test.ts`) |
| A local tool reads your credentials, Halonic's data, its own plugin folder or another plugin, or changes its copy | Halonic builds the place: new working and temporary folders, a read-only copy of the checked files, denied paths for credential folders, Halonic's data and the plugins, and a refusal of a copy that overlaps any of them, compared with links resolved | **On `main`** (`connector-stdio-sandbox.plugin-local-tool-place`, `connector-stdio-sandbox.plugin-local-tool-denied-paths`, `harness-kit.home-denied-paths`, `system-node.path-overlap`; `packages/adapters/connector-stdio-sandbox/fence/plugin-local-tool-place-attacks.test.ts`) |
| A local tool reaches a host its manifest doesn't declare | The network is the bridge and the declared hosts only | **On `main`** (`connector-stdio-sandbox.plugin-local-tool-place`; the two fence tests above) |
| A plugin's setting or secret replaces `HOME`, `PATH` or a temporary folder | The manifest check refuses a local tool `env` that sets them, and Halonic's own variables are set last, so they win in any letter case | **On `main`** (`format.plugin-checks`, `connector-stdio-sandbox.local-tool-profile`; `apps/cli/src/plugin-local-tool-attacks.test.ts`) |
| A local tool runs where its fence isn't proven | Local tools run only fenced: a session whose proof isn't `fenced` starts nothing and the call fails with the reason | **On `main`** (`app.plugin-local-tools`, `cli.plugin-local-tools`, `agent-host.plugin-local-tools`) |
| Plugin text becomes markup or script in Studio | Studio draws plugin text as text or through its own small Markdown reader. A source guard keeps HTML sinks, `window.open` and page changes out of the plugins feature, and links on `ExternalLink` only | **On `main`** (`plugins.plugin-text`; `packages/studio/features/plugins/src/no-raw-markup.test.ts`, `labels.never-html.test.tsx`, `ui/plugin-result.never-html.test.tsx`) |
| A plugin link opens something other than a web page | `ExternalLink` allows only `http` and `https`, by the rule the Markdown reader shares | **On `main`** (`kit.external-link-web-only`) |
| A plugin's name imitates another's with control characters, invisible characters or text-direction marks | The manifest check refuses them in names, labels, titles and descriptions, and Studio isolates each such text | **On `main`** (`format.plugin-file`, `plugins.plugin-text`) |
| A plugin's command or card calls a tool that changes or sends something | A `ui` that calls a `write` or `send` tool is refused | **On `main`** (`format.plugin-ui-read-tools`) |

**Known limit.** On Linux, a credential folder you create while a local tool's
session runs stays readable to that session until it ends (at most 10
minutes), because the sandbox there can only hide a folder that is already
there. The next session hides it (`harness-kit.home-denied-paths`).

**Known limit.** The fingerprint covers file contents, not file modes, empty
folders or a second name for a file (a hard link). A backend that loads a file
in the middle of a call reads it then; the next call or start sees a change.
[Plugins and security](plugins.md#what-this-does-not-protect-against) lists
these with the rest of what trust doesn't cover.

### 4.9 Run with Claude on your server (B10)

"Run with Claude" (HAL-17834) opens Claude Code on your own server for one
task, with a brief an agent wrote. Claude Code there runs with your access to
that server, so the brief is untrusted content that steers it (B2), and the
person who presses the button is the only check. On the desktop the page asks
the shell's `server_session_open` command; nothing else can reach it.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| A served Studio, another window or an agent starts a session | The capability `desktop-server-session.json` grants `server_session_open` to the app's own local `main` window, on macOS and Linux only; the served Studio and other platforms are refused. No agent tool, engine or bridge names the command | **In review** (`studio.src-tauri.served-page`, #5804) |
| A compromised page starts a session without asking | The shell asks "Start Claude Code on your server?" in its own window, which the page can't draw or answer, naming the user, the host and the task and showing the whole brief in a read-only box that scrolls. The window's page is written by the shell and served to that window only; it has no script, and no capability names the window, so it can call no command. Start and Cancel are links the shell catches before they load. Cancel, closing it, or a window that can't open writes nothing. Only one brief window is open at a time, so a page can't stack them. A second launch of one request within 60 s is ignored, but that only stops a double click: the window is the check | **In review** (`studio.src-tauri.crates.server-session.launch`, `studio.src-tauri.server-session-brief-window`, #5804 and the brief window's PR) |
| The window shows one brief and Claude Code reads another | The shell refuses a brief with a control or format character (zero-width characters, U+FEFF, the bidi controls, the tag characters), a variation selector or a line or paragraph separator; the page's builder refuses the same characters, against shared cases | **In review** (`action-steppers.server-session-brief`, `studio.src-tauri.crates.server-session.launch`, #5804) |
| The brief, the host or the user reaches a command line | The page gives only the task id, the brief and a hash. The shell reads the host, user and port from the profile's settings itself and checks them (no leading `-`, no shell character; `--` before the destination). The launcher it writes holds no path and no brief text: the brief goes to the server only over ssh's input, into a file named from the task id, and `claude` starts with a constant prompt and no flag | **In review** (`action-steppers.server-session-launch`, `studio.src-tauri.crates.server-session.launch`, #5804) |
| Another program swaps the brief or the launcher on disk | Both are made new (`O_CREAT` with `O_EXCL`, which refuses a link) with modes `0600` and `0700` set as they're made, in a `0700` folder in the app's data that may not be a link or open to others. The launcher deletes both once the brief is copied | **In review** (#5804) |
| A program named like a terminal in `~/bin` runs instead | The terminal is looked for in `/usr/bin` first (only `/usr/bin/open` on macOS) and started with fixed arguments and the launcher's path as one argument. It gets only `PATH` and a short list of variables, not Studio's whole environment | **In review** (#5804) |

**Known limits.**

- **The window has no Escape key.** Its page has no script, so Escape does
  nothing; Cancel or closing the window answers no.
- **Whatever the person allows, Claude Code does with their access.** The
  brief is written by an agent and not checked by Halonic; Claude Code still
  asks for its own permissions as it always does.
- **`terminal-opened` means only that the terminal started.** A failed upload
  shows in the terminal, and Claude Code doesn't start.
- **The server's shell must be POSIX-like** (sh, bash, zsh), not csh or tcsh.
- **Some Linux terminals break a launcher path with a space.** On some
  systems `x-terminal-emulator` points at a terminal that joins the `-e`
  arguments into one string and splits it again, so a launcher path with a
  space in it (the app's data folder) breaks. That fails closed: nothing
  runs.
- **Windows has no launcher in v1.** The page shows the manual steps instead.

## 5. `serve` (B6)

`halonic serve` is built (phase 4, plan HAL-9) and run from source. This
section is the design the code is held to. Only what is marked **On `main`**
works today.

- **A `serve` on a non-loopback address is public.** Every rule below applies.
- Threats: DNS rebinding and a wrong `Host`, no sign-in, password guessing in
  parallel, a stolen session, cross-site requests, script injection,
  oversized bodies, error text that leaks, unsigned webhooks that start runs,
  and cost abuse.
- **On `main`:** the server's trust gate. `POST /api/runs` and
  `POST /api/agent-runs` ask the host's trust check on every request, and
  answer 403 (`workspace_not_trusted`) for a workspace that isn't trusted, or
  500 when the check fails, and start nothing. The gate behind `halonic serve`
  answers `trusted` for a workspace that can reach only the test model, which
  needs no trust, and checks every other workspace. `GET /api/trust` is read-only and no route
  grants trust, so a page, an app or a script that reaches the server can't start a workspace's programs
  or trust the workspace itself (`server.trust-gate`; see
  [workspace trust](trust.md#where-trust-is-checked)).
- **On `main`** (`host/server`, `adapters/password-scrypt`,
  `targets/node/runtime`): a host allow-list; required sign-in on public
  shapes, with the server refusing to run without a password hash; scrypt
  password hashing and a shared, atomic login limiter; session tokens stored
  only as hashes, in a `__Host-` cookie over HTTPS (over plain HTTP, the
  only way `serve --network` is reached, the cookie is `halonic-session`
  without `Secure`; see the known limits below); an exact `Origin` check; strict security
  headers; a body limit enforced while streaming; errors that carry a code and
  a short message only; HMAC-signed, replay-protected webhooks; the daily
  request ceiling. The outside-a-run connector gate (see the
  [port list ADR](../adr/2026-11-07-port-list-and-versions.md)) is **On `main`**:
  `POST /api/connector-calls` asks `checkOutsideRunCall` before every call, so
  only a `read` tool the connector's lists allow runs, with declared
  arguments, and a write, send or approve call is refused
  (`server.outside-run-connector-gate`).

#### Agents in a harness on the serve host

An agent in Claude Code or Codex that a served start runs is a program on the
computer that serves, started with the rights of the person who owns it, so the
caller of the API (a phone, a page, a script, or anyone on the network when
`--network` is on) must not steer where or how it runs. The rules of
[4.6](#46-agents-in-a-sandbox-b8) hold unchanged: the fence, the bridge and the
trust fingerprint belong to the host, and nothing in a request reaches them.

| Threat | Mitigation | Mark |
| --- | --- | --- |
| A caller moves an agent out of its sandbox, onto "this computer", into another folder or to other sites, or swaps its harness, by naming that in the start | `POST /api/runs` and `POST /api/agent-runs` answer 400 to a body that names `harness`, `placement`, `sandbox`, `profile`, `workingFolder` or `allowedSites`, before the trust gate is asked, and start nothing. The executor gets only the fields the route validated. Where and how an agent runs comes from its file and from the choices a person made at the computer, never from a request | **On `main`** (`server.harness-on-host`) |
| A caller starts a harness agent in a workspace that changed after it was trusted | The trust gate is asked again on every start, as for any run; the harness is part of the trust fingerprint (4.6), so a changed harness asks for trust again | **On `main`** (`server.trust-gate`, `workspace.trust-agents`) |
| A served run of a harness agent starts a program the sandbox check would have refused | Each served run is checked for the sandbox before it starts, as for `routines watch`; a computer that can't start the sandbox runs no such agent, and the choice "this computer" is never a fallback | **On `main`** (`cli.commands.serve.harness`) |
| A caller picks the version an agent works in | The start routes never pass a version. A served start, and a webhook start, which goes through the same executor, reads the live version, as a routine's run does, and the agent works in a copy of it in Halonic's profile, so it can't change the workspace files | **On `main`** (`cli.commands.serve.harness`) |
| The agent's work leaves the host through the API | The agent's changes stay in a proposal folder in the profile until a person accepts them at the computer. No route accepts one | **On `main`** (`harness-host`; Accept in `halonic proposals accept` and Studio, `cli.commands.proposals.decide`, `agent-host.proposal-decision-routes`) |
| A caller of a chat turn sends a stored key to an address of their choice, in the turn's unsaved model settings | A secret name in a turn's settings is accepted only when a provider file of the workspace names that secret, has the same type and calls that same address; otherwise `POST /api/chat-turn` answers 400 `model_address_not_allowed` before the executor is asked, so no model request is made. An untrusted workspace answers 403 `workspace_not_trusted` first, without asking the address check. A settings object without a secret sends no key. Halonic's own and plugin secret names stay refused (400 `secret_name_not_allowed`) | **On `main`** (`server.chat-turn-model-address`) |
| A harness agent makes `serve` a way to run commands for anyone who signs in | A signed-in caller can start only what the trusted workspace defines, never a command of their own. Known limit: anyone with the password can start the trusted workspace's agents and spend its model budget; the daily request ceiling, where one is set, caps that | **On `main`** (`server.daily-requests`) |

Pieces already on `main` that `serve` is built on:

| Piece | Mark |
| --- | --- |
| `PasswordHasher` port and the hash format: scrypt, `ln=14, r=8, p=5`, 16-byte salt, checked ranges so one check stays within 32 MiB of memory (`ports.password-hash-format`). Cloud targets use `$pbkdf2-sha256-chain$` instead, made at deploy time, because a Worker has too little memory for scrypt at safe settings | **On `main`** |
| Constant-time comparison in `core/std` | **On `main`** |
| `Coordination` port with a Node adapter: leases, compare-and-set, counters that never pass their limit, fixed-window attempt counts safe against parallel calls | **On `main`** |
| The scrypt implementation, the sign-in flow, the login limiter and the server | **On `main`** |

**Known limits.** Sign-in is a single factor on the public internet until
passkeys land. On loopback, "no password" may stay. On `--network` over plain
HTTP, anyone on that network who can see the traffic can read the session cookie
and the password.

## 6. Cloud deployments (B7)

Partly built (phase 4, plan HAL-9). The library parts are on `main` in
`packages/targets/cloudflare/{runtime,deploy}`; no `halonic` command deploys
yet, so no app calls them. A cloud deployment is reachable by the whole
internet and holds provider keys, Google tokens and your data, so the `serve`
rules apply, plus these:

| Threat | Mitigation | Mark |
| --- | --- | --- |
| A leaked deploy token | An account-scoped token with the least scopes, stored only in the OS keychain, read from standard input, never in the Worker, logs or workspace. The Global API Key is refused | The deploy library checks the token with the fewest calls and keeps it out of its errors **On `main`** (`packages/targets/cloudflare/deploy`, `deploy.credentials`); keychain storage and standard input **Planned** |
| Deployed code differs from what you reviewed | Upload from git objects at a commit, not the working tree; `deploy status` shows the commit and bundle hash | The deploy reads the commit's snapshot and checks the script against the hash its build reported **On `main`** (`deploy.orchestrate`, `deploy.upload`, `deploy.status`) |
| Private files uploaded | Tracked files only; no symlinks or submodules; a filename deny-list (`.env*`, `*.pem`, `*.key`) even for tracked files; `--plan` lists every file | **Planned** |
| The sign-in password, a session cookie or an admin key is sent over the internet in clear text | The Worker serves nothing over plain HTTP. A plain-HTTP `GET` or `HEAD` is redirected (308) to the same address over HTTPS, and any other method is refused with 403 `https_required` before its body is read. This check runs before every route, so these secrets only travel over HTTPS, and every session cookie the Worker sets is `Secure`. Only a loopback name (`wrangler dev`) is served over plain HTTP. The plain-HTTP case that section 5 accepts is a LAN, and a deployment is never on a LAN | **Lands with #5192** (`runtime.https-only`) |
| Old versions stay reachable | Preview URLs turned off | **On `main`** (`packages/targets/cloudflare/deploy`, `src/client.ts`) |
| A stolen session changes what runs | Definitions and configured secrets are read-only on cloud targets | **Planned** |
| Tokens leak in a data export | Tokens are encrypted per record with the deployment id as bound data; exports hold no secrets or tokens | Export stops on anything shaped like a secret **On `main`** (`packages/targets/cloudflare/runtime`, `runtime.export-data`); per-record encryption **Planned** |
| A model-driven fetch reaches the cloud's metadata service | Outbound HTTP refuses loopback, link-local and private ranges unless a connector is allowed | **Planned** |
| Cost abuse | Budget reserved atomically before each model call; per-trigger limits; a daily request ceiling | Daily request ceiling **On `main`** (`packages/targets/cloudflare/runtime`, `src/request-counts.ts`); the rest **Planned** |
| Export and import | A one-job admin key whose hash the Worker holds, valid for that job only, never in a URL | **On `main`** (`packages/targets/cloudflare/deploy`, `src/admin-key.ts`; `runtime.admin-key`) |

Rows marked **Planned** aren't built; don't rely on them.

**Known limits.** A leaked deploy token is total compromise of that
deployment. Cloudflare has no hard cap on spending, so set billing alerts. The
cloud provider is trusted. An export folder is plain personal data on your disk.

## 7. Keeping this page true

- A pull request that changes a boundary in [section 3](#3-trust-boundaries), a
  port's security rules or a requirement named here updates this page in the
  same pull request.
- When a **Planned** or **Lands with #n** item merges, change its mark to
  **On `main`** and name the code or the requirement that proves it. A pull
  request that closes without merging turns its items back into **Planned**.
- A pull request that changes a sandbox or harness package, the bridge, the
  sandbox profile or where an agent runs checks
  [4.6](#46-agents-in-a-sandbox-b8) in the same pull request. A new sandbox
  adapter (a VM, Halonic Cloud) or a new system it supports gets its own entry
  under "Linux, macOS and Windows" before it is called supported.
- A pull request that changes how plugins are trusted, added or run checks
  [4.8](#48-plugins-b9) and [Plugins and security](plugins.md) in the same
  pull request.
- A new deployment shape adds a section here before it is called supported.
- Write only what ships, as in [writing docs](../guides/writing-docs.md). Say
  **Planned** for the rest.

The trust gate's limits are on [workspace trust](trust.md) and the sandbox's on
[the sandbox's limits](sandbox.md). The docs site's Sandbox page, for people who
use Halonic, must agree with them.

## 8. Limits of trust and of the sandbox

The trust prompt is a list, not a sandbox: it shows what a workspace can start
and where it can talk to, and a yes lets those programs run with your rights.
The sandbox is a fence built from the operating system's own controls, not a
virtual machine. It has no CPU or memory limits, on Windows it is a preview,
and an agent you run "on this computer" has none of it. The limits are written
out on pages that must agree with this one:

- [Workspace trust](trust.md): what the CLI asks for, what Studio doesn't ask
  for and what trust does not protect against.
- [The sandbox's limits](sandbox.md): the fence, its reason codes, Windows and
  "this computer".
- [Plugins and security](plugins.md): the worker and sandbox fences, why a
  plugin's screens carry no code and what trust doesn't cover.
