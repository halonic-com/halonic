# Threat model

What Halonic protects, from whom, and where the lines are drawn. Read it before
you change anything that touches a boundary in [section 3](#3-trust-boundaries).
To report a problem, see the [security policy](../../SECURITY.md).

Every mitigation carries one of two marks:

- **On `main`**: the code is merged and tested. This is library code. No app or
  command-line tool uses it yet, so it isn't a protection you get today.
- **Lands with #n**: built in an open pull request, not merged yet. Until it
  merges, read it as **Planned**.
- **Planned (HAL-n)**: decided, not built. Don't rely on it. The number is the
  task that builds it.

A **known limit** is a risk we accept and say so. Nothing on this page is a
promise about a mitigation marked **Planned**.

## 1. Scope

Halonic is a local-first app. The Studio and the `halonic` command-line tool
are designed to run on your own machine, as you. Neither ships yet: `apps/studio`
holds only a feature list and there is no command-line package. The **On
`main`** items on this page are tested library code that no app calls yet (for
example `readToolListing` has no caller outside its tests), not protections a
user has today.

| Shape                                      | Who can reach it                          | Status                                                      |
| ------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------- |
| Studio and `halonic` on your machine       | you, and programs running as you          | Planned (phase 1, plan HAL-9). Not shipped                  |
| `halonic serve` on loopback                | programs and web pages on your machine    | Planned (phase 4, plan HAL-9)                               |
| `serve` on a LAN, tunnel or VPS            | everyone on that network, or the internet | Planned (phase 4). Treated as public                        |
| Cloud deployments (Cloudflare, containers) | the whole internet                        | Planned (phase 4). See [section 6](#6-cloud-deployments-b7) |

One deployment has **one owner**. Several users on one deployment are out of
scope. That needs its own section here first.

## 2. Assets and attackers

What we protect, most valuable first:

| Asset                                                        | Where it lives                                 | If lost                                        |
| ------------------------------------------------------------ | ---------------------------------------------- | ---------------------------------------------- |
| Deploy credentials for a cloud account                       | OS keychain on the owner's machine             | Planned. Total control of a cloud deployment   |
| Model provider keys, Google client secret and refresh tokens | configured secrets; the token store            | spend on your accounts; your mail and Drive    |
| Sign-in password hash and session tokens                     | Planned with `serve`                           | full control through the API                   |
| Run logs, inbox items, records, files a run made             | the data folder                                | privacy breach                                 |
| Workspace definitions (agents, workflows, connectors)        | the workspace folder, usually a git repository | changing them changes what runs with your keys |
| Your money: model spend, cloud bill                          | not stored                                     | direct cost                                    |

Who we defend against:

| Attacker                                                                                            | What they can do                                                            |
| --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| A malicious or careless **workspace** (cloned, shared, a dependency)                                | define connectors, routines, workflows and prompts; ask for programs to run |
| **Untrusted content** that reaches a model: mail, documents, web pages, tool results, tool listings | steer the model's output and so its tool calls                              |
| A **server you connect to** (MCP server, integration backend)                                       | write the names and descriptions of its tools; return anything              |
| A **harness program** (Claude Code, Codex) steered by that content, or a careless command it runs   | run any command in its sandbox, as you, and try to reach out of it          |
| A **malicious web page** you visit                                                                  | make your browser send requests to `localhost` and your network             |
| **Anyone on the internet**, once something listens publicly                                         | send any request, at any rate                                               |
| A **leaked key or token**                                                                           | everything its scopes allow                                                 |
| A **malicious contributor or dependency**                                                           | open pull requests, publish a bad package                                   |

Trusted, so out of scope: your machine and operating system account, the cloud
provider you deploy to, TLS, and what model providers do with what you send
them.

## 3. Trust boundaries

| #   | Boundary                           | What crosses it                                    | Section                                         |
| --- | ---------------------------------- | -------------------------------------------------- | ----------------------------------------------- |
| B1  | workspace to engine                | connectors, routines, workflows, prompts, programs | [4.1](#41-workspace-code-b1)                    |
| B2  | model output and content to engine | tool calls the model asks for; mail, documents     | [4.2](#42-model-output-and-content-b2)          |
| B3  | tool listings from servers to host | names, descriptions and schemas a server writes    | [4.3](#43-tool-listings-from-servers-b3)        |
| B4  | host to outside services           | provider keys, tokens, prompts                     | [4.4](#44-secrets-tokens-and-outbound-calls-b4) |
| B5  | Google setup and sign-in           | client secret, sign-in callback, tokens            | [4.5](#45-google-setup-and-sign-in-b5)          |
| B6  | client to `serve`                  | HTTP from browsers, phones, scanners               | [5](#5-serve-b6)                                |
| B7  | owner to cloud deployment          | deploy credentials, workspace files, runtime data  | [6](#6-cloud-deployments-b7)                    |
| B8  | agent sandbox to host              | model calls, tool calls, approvals, blocked access | [4.6](#46-agents-in-a-sandbox-b8)               |

## 4. Threats per boundary

### 4.1 Workspace code (B1)

**A workspace can run code.** A local MCP server (`stdio`) is a program on your
machine, and tests, hooks and scripts in a workspace are too. Opening a
workspace you didn't write is like running its code.

| Threat                                                            | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Mark                                                                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A workspace starts programs before you trust it                   | Ask "trust this workspace" before any program starts; no `shell: true`. The `TrustStore` port and its record format exist; nothing asks yet. The requirement `ports.connector-trust-enforcement` is still a draft.                                                                                                                                                                                                                                                                                       | **Planned** (phase 2, plan HAL-9; the requirement becomes active with the contract suites, HAL-181)                                                                              |
| A hub or an agent lists the token collection                      | Halonic's own collections (`_tokens`, `_google_setups`) start with `_`, which no workspace collection id may, so a hub, an agent or a ref field can't name them; the scheduler's and coordination's collections (`halonic.scheduler.timers`, `halonic.coordination`) are kept out by their `.` (`packages/core/format`, `collectionId`)                                                                                                                                                                  | **On `main`**                                                                                                                                                                    |
| A workspace picks a token or one of Halonic's own secrets by name | A provider's or a model's `secret` is read through `workspaceSecrets`, which refuses `token-key`, `serve-password` and every name under the token prefix `halonic_token_`, in any case and with `-` or `_` (`packages/core/ports`). Together with the row above, no workspace name reaches a token or Halonic's own secrets in either store: the record store keeps tokens in `_tokens`, and a store that holds secrets and tokens together, such as the desktop keychain, keeps tokens under the prefix | **On `main`** (`ports.workspace-secrets`); tokens under the prefix in the keychain: the bridge **On `main`** (`services.shell-secrets`), the app using it **Planned** (HAL-2952) |
| A workspace reads another workspace's or hub's data               | Isolation between workspaces and hubs is not built                                                                                                                                                                                                                                                                                                                                                                                                                                                       | **Planned** (phase 2, plan HAL-9)                                                                                                                                                |
| A listed tool of an untrusted workspace lowers its risk           | Without a trust grant every listed tool counts as `write`; `readToolListing` ignores the workspace's lower risks (`packages/core/app/src/tool-listing.ts`)                                                                                                                                                                                                                                                                                                                                               | **On `main`**                                                                                                                                                                    |
| Secrets committed to the repository                               | The leak guard blocks private keys, Google client secrets, OAuth tokens, protected personal terms and absolute local paths (`tooling/check/src/leaks`, [leak guard](../guides/leak-guard.md))                                                                                                                                                                                                                                                                                                            | **On `main`**                                                                                                                                                                    |
| A sandbox limits what a trusted workspace's program can do        | Harness agents: see [4.6](#46-agents-in-a-sandbox-b8). Stdio connectors a workspace starts get their own sandbox (D45)                                                                                                                                                                                                                                                                                                                                                                                   | **Planned** (HAL-2310)                                                                                                                                                           |

**Known limit.** After you trust a workspace, its programs run with your
rights. Trust only workspaces from people you trust.

### 4.2 Model output and content (B2)

**Model output is untrusted.** Content a model reads (a mail, a web page, a
tool result) can steer what it asks for. Prompt injection isn't solved. The
rule is that a steered model must not be able to do more than you approved.

| Threat                                          | Mitigation                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Mark                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| Injected text makes the model call a risky tool | Tools have a risk: `read`, `write` or `send`. Every risk above `read` needs approval in the engine (`checkToolCall`), not in the model's prompt; only `read` runs at once                                                                                                                                                                                                                                                                                                       | Planned (HAL-998 for listed tools; see 4.3) |
| A tool result carries instructions              | Results from tools marked untrusted reach the model only inside a fence                                                                                                                                                                                                                                                                                                                                                                                                         | Planned (HAL-998; see 4.3)                  |
| Knowledge or documents carry instructions       | Knowledge reaches a model only through the engine's `knowledge_search` and `knowledge_read` tools, which fence the titles, snippets and texts of any source not marked `untrusted: false` (`ports.untrusted-knowledge`, `engine.knowledge-tools`). The ref the model sends back stays unfenced, so a hit or a document whose ref is longer than 512 characters is dropped (`knowledgeHitForModel`, `knowledgeDocForModel`). Agents don't get these tools in runs yet (HAL-4174) | **On `main`**                               |
| A run is changed after the fact                 | Each run is an append-only event log, kept apart from the definitions ([ADR](../adr/2026-11-08-runs-are-stored-separately.md)). On `main` there is the `RunStore` port and a memory adapter only; the durable log is not built                                                                                                                                                                                                                                                  | **Planned** (phase 1, plan HAL-9)           |

**Known limit.** Run logs have no tamper evidence. An append-only interface
doesn't stop a program running as you from rewriting the files.

**Known limit.** Approvals and secret bindings limit the harm of a steered
model. They don't stop it from being steered.

### 4.3 Tool listings from servers (B3)

A server you connect to writes the descriptions of the tools it lists. A
**listed tool** is one the server lists and nothing Halonic reviewed declares.
Its text is attacker text. The rules are the requirement
`ports.untrusted-tool-listings`.

| Threat                                                                           | Mitigation                                                                                                                                                                                                                                                                                                                                                             | Mark                                                                           |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Oversized or deeply nested schemas                                               | Parameters over 64 KiB, nested over 64 levels, or with a text over 10,000 characters are refused                                                                                                                                                                                                                                                                       | **On `main`**                                                                  |
| Hidden instructions in schema keywords (`default`, `examples`, `x-…`, `pattern`) | `parameters` are rebuilt from an allow-list of keywords; everything else is dropped and reported                                                                                                                                                                                                                                                                       | **On `main`**                                                                  |
| Instructions in names, `enum` and `const` values, which can't be fenced          | Names must be 1 to 64 letters, digits, `_` or `-`; a bad `enum` is dropped; unfenced text is capped at 2,048 characters per tool                                                                                                                                                                                                                                       | **On `main`**                                                                  |
| A server swaps a reviewed tool's text                                            | A declared tool keeps its declared description, parameters and risk; the listing can't change them                                                                                                                                                                                                                                                                     | **On `main`**                                                                  |
| A listed tool lowers its own risk or marks itself trusted                        | Its `risk` and `untrusted` are ignored; it counts as `write` unless a trusted workspace sets another risk (`read`, `write` or `send`)                                                                                                                                                                                                                                  | **On `main`**                                                                  |
| Two tools share a name                                                           | Every clashing listed tool is refused                                                                                                                                                                                                                                                                                                                                  | **On `main`**                                                                  |
| The description reaches the model as an instruction                              | Descriptions and titles come back as `UntrustedText`, whose `toJSON` throws, so they can't be serialised to JSON without the fence. `toString` doesn't throw: a template string gives `[object Object]`, which doesn't leak the text. `structuredClone` or IPC turns it into a plain object and loses the guard. The fence itself is rendered when tools are assembled | **On `main`** as functions; used once the engine puts turns together (HAL-998) |
| A call uses arguments the listing never declared                                 | Refused at call time; a listed tool is `write` unless a trusted workspace sets another risk, so it needs approval unless that risk is `read`                                                                                                                                                                                                                           | **On `main`** as functions; used once the engine puts turns together (HAL-998) |
| A server changes its tools after you looked                                      | Pinning and approving listings                                                                                                                                                                                                                                                                                                                                         | Planned (HAL-520)                                                              |

**Known limit.** Unfenced strings (names, `enum` values) can still carry up to
64 characters each and 2,048 per tool. Approval for every risk above `read`
(a listed tool is `write` by default) is what limits the harm.

### 4.4 Secrets, tokens and outbound calls (B4)

| Threat                                                   | Mitigation                                                                                                                                                                                                                                                                                                       | Mark                                                                                                                                                                             |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A secret goes to the wrong address                       | An integration's secret is placed by the kit only for a declared secret and an allowed host; the integration never sees the value                                                                                                                                                                                | **On `main`** (`integration-kit.secrets-placed-by-kit`)                                                                                                                          |
| Requests go to hosts nobody declared, or redirect there  | Exact, case-insensitive host match over `https`; every redirect hop is checked like the first request                                                                                                                                                                                                            | **On `main`** (`declared-hosts-only`, `redirects-checked`)                                                                                                                       |
| Plain `http` leaks a secret                              | `http` only to this machine or a private address, and a secret only to this machine                                                                                                                                                                                                                              | **On `main`** (`local-http-hosts`)                                                                                                                                               |
| One integration reads another's tokens                   | Names are `i<n>_<integration>_<token>`; a policy declares what each may read                                                                                                                                                                                                                                     | **On `main`** (`scoped-tokens`)                                                                                                                                                  |
| A slow or huge response ties up the host                 | Header, idle and overall timeouts and a size limit on every request                                                                                                                                                                                                                                              | **On `main`** (`request-limits`)                                                                                                                                                 |
| Logs leak secrets                                        | The request log holds method, host, path, status, time and outcome; no query, headers or bodies                                                                                                                                                                                                                  | **On `main`** (`request-log`)                                                                                                                                                    |
| A stored token is read from disk or a copy               | AES-256-GCM, a new random nonce per write, bound to the token's name so a value can't be moved to another name; the key is the secret `token-key` (32 bytes)                                                                                                                                                     | **On `main`** (`packages/adapters/token-store`)                                                                                                                                  |
| A wrong key looks like "not signed in"                   | A value that won't open throws `UnreadableTokenError`, never `null`; the error names the token, not its value                                                                                                                                                                                                    | **On `main`**                                                                                                                                                                    |
| Token names fold into each other                         | Case and `-` versus `_` are treated as the same name; bad names are refused before anything is read                                                                                                                                                                                                              | **On `main`**                                                                                                                                                                    |
| A workspace's secret pick reads a token or the token key | The names a workspace picks for providers and models go through `workspaceSecrets`, which refuses `token-key`, `serve-password` and the token prefix `halonic_token_` by their `secretKey` form; its error never repeats the name. A store that holds secrets and tokens together keeps tokens under that prefix | **On `main`** (`ports.workspace-secrets`); tokens under the prefix in the keychain: the bridge **On `main`** (`services.shell-secrets`), the app using it **Planned** (HAL-2952) |
| A copied data folder gives away tokens (desktop)         | In the desktop shell, Studio's services keep secrets and tokens in the OS keychain; the data folder holds no token and no key (`packages/studio/services`)                                                                                                                                                       | **Partly on `main`**: the bridge is on `main`; the app using it is Planned (HAL-2952)                                                                                            |

**Known limits.**

- **Old copies stay on disk.** The record store only appends, so a replaced or
  removed token stays in its history, still encrypted. If the key leaks, old
  tokens can be read. Removing them for good needs compaction on the
  `RecordStore` port: Planned (HAL-719). Until then, Halonic says it "deletes"
  a secret and "stops using it", not that it is gone from disk.
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
- **The desktop app doesn't use it yet.** The bridge that gives Studio's
  services the keychain is on `main`; the code in the app that builds those
  services is Planned (HAL-2952). Until then, no desktop token reaches the
  keychain: on desktop, tokens still go to whatever store the app provides, or
  to none.

### 4.5 Google setup and sign-in (B5)

The Google setup flow stores your own Google client secret and signs you in.
Decisions from the security reviews:

| Threat                                                          | Mitigation                                                                                                                                                                                          | Mark                                                 |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| A leaked client secret or token is committed                    | The leak guard has `google-client-secret` and OAuth token and code rules                                                                                                                            | **On `main`**                                        |
| Sign-in code intercepted                                        | PKCE (S256); the verifier is 32 random bytes, stays in memory (`packages/host/google-sign-in`). Sending it only to Google's token endpoint is part of the code exchange, which is Planned (HAL-699) | **On `main`** for the verifier; exchange **Planned** |
| Forged or replayed callback                                     | A random `state` (32 bytes), compared in constant time; a missing one never matches                                                                                                                 | **On `main`**                                        |
| A callback with the wrong `state` cancels or consumes a sign-in | A missing or wrong `state` is checked first and changes nothing; the pending sign-in is taken once, synchronously                                                                                   | Planned (HAL-699)                                    |
| Crafted redirect or auth URL                                    | Only `127.0.0.1` redirects; every value is URL-encoded; no `error_description` is read                                                                                                              | Planned (HAL-699)                                    |
| The client secret is read by an integration or hub              | It goes only through the `TokenStore`; only the host's sign-in and refresh code reads it; integrations get only `scopedTokens`                                                                      | Planned (HAL-698)                                    |
| Two setup refs map to one stored name                           | A ref is checked against the store's name folding before use, so none fold to another's name                                                                                                        | Planned (HAL-698)                                    |
| A secret ends up in an error message                            | Errors have fixed texts; a rejected input is never repeated                                                                                                                                         | Planned (HAL-698)                                    |

**Known limit.** The token store's old-copies limit (4.4) applies to the
client secret and to refresh tokens.

### 4.6 Agents in a sandbox (B8)

An agent whose harness is **Claude Code** or **Codex** is a program on your
machine that runs commands, reads files and asks a model what to do next.
Every such agent runs in a **sandbox on this computer** by default. The design
is plan section 4.5. The sandbox is `adapters/sandbox-srt`, built on
[sandbox-runtime](https://github.com/anthropics/sandbox-runtime) (srt). Its
launcher, `adapters/sandbox-host`, finds and starts programs.

The **Halonic** harness, the default, starts no program for the agent, so this
boundary doesn't apply to it. Stdio connectors a workspace starts are
[4.1](#41-workspace-code-b1).

#### What the sandbox is meant to stop

An agent tricked by a mail, a web page or a file (B2), or a careless command,
from doing any of these:

- reading your keys and personal files: SSH and cloud credentials, browser
  profiles, keychain files, your own Claude Code and Codex settings, Halonic's
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

| Threat                                                         | Mitigation                                                                                                                                                                                                            | Mark                                                       |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Another program on your machine, or another run, uses a bridge | One bridge per run on a free port of `127.0.0.1`, with a new 32-byte random token, compared in constant time; any other request gets a 401 whatever its path, and no reply contains the token                         | **On `main`** (`harness-bridge.server`)                    |
| The agent reads the provider key                               | The program gets the run token where a key would go; the bridge puts the agent's key in place of it and sends the call only to the provider's fixed address. An error names the key's secret, never its value         | **On `main`** (`harness-bridge.anthropic`)                 |
| The provider's own web tools fetch a site the fence would stop | The bridge removes `web_search_` and `web_fetch_` tools and `mcp_servers` from every request, and refuses a content block whose source is a URL                                                                       | **On `main`** (`harness-bridge.anthropic`)                 |
| A run outlives its bridge, or a stream hangs                   | Closing the bridge or aborting the run stops calls in flight; response and idle time limits; a body size limit                                                                                                        | **On `main`** (`harness-bridge.pass-through`)              |
| A run's spend isn't counted                                    | The bridge records each call's tokens and cost in the run log                                                                                                                                                         | **Planned** (HAL-2553)                                     |
| The agent calls tools or sends without approval                | Halonic's tools are offered over MCP on the bridge, with the agent's `allow` and `approve` lists, "allow sending" and trust checks, as in the built-in loop; permission questions reach Halonic's approval card       | **Planned** (HAL-194)                                      |
| A working folder's `.mcp.json` or hooks bypass those lists     | The adapter starts Claude Code with only Halonic's MCP server (`--strict-mcp-config`) and only the agent's own settings, so a folder's MCP servers and hooks don't load. Anything they would start stays in the fence | **Planned** (HAL-2552 for Claude Code, HAL-2608 for Codex) |

A leaked run token gives only what that agent may already do, for that one run.

#### The fence

| Threat                                                            | Mitigation                                                                                                                                                                                                                                                                                              | Mark                                                                                 |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| The agent changes what it may reach                               | Halonic builds the `SandboxProfile` from your profile and the trusted workspace; the agent can't change it. The workspace's definition files are read-only inside                                                                                                                                       | Port **on `main`**; building the profile **Planned** (HAL-189)                       |
| A working folder where tools read settings that run outside       | `workingFolder` can't start with `.` (such as `.git`, `.claude`, `.codex`), be a kind's folder or `hubs`, or leave the workspace                                                                                                                                                                        | **On `main`** (`format.agent-sandbox-fields`)                                        |
| Writes outside the agent's folders                                | srt allows writing only to the working, temp and settings folders; denied paths are hidden for reading and writing, read-only paths for writing; a path is never read as a pattern                                                                                                                      | **On `main`** (`sandbox-srt.profile-to-srt-config`)                                  |
| Tool settings in the working folder that would run commands       | `.claude/settings.json`, `.claude/settings.local.json`, `.codex` and `.cursor` in the working folder are write-denied                                                                                                                                                                                   | **Lands with #753** (HAL-2554)                                                       |
| Sending data to a site nobody allowed                             | Only the bridge and the allowed sites are reachable; every other host is denied without asking. `allowedSites` has at most 50 entries, no bare `*`, no addresses and no local names                                                                                                                     | **On `main`** (`sandbox-srt.profile-to-srt-config`, `format.agent-sandbox-fields`)   |
| An allowed name resolves to a local or private address            | srt refuses a name that resolves to loopback, link-local, cloud metadata or this computer's own addresses; Halonic adds RFC 1918, carrier-grade NAT and IPv6 unique local ranges. Only the bridge's own address and port are let through                                                                | **On `main`** (`sandbox-srt.profile-to-srt-config`)                                  |
| A changed list of allowed sites slips past you                    | Harness, programs, sites and folders are part of the trust fingerprint, so a change asks for trust again                                                                                                                                                                                                | **Planned** (HAL-189, PR #771)                                                       |
| The host's secrets reach the agent through its environment        | The program gets only the variables the profile names. Probing a program before a run passes only `PATH`, `HOME` and the locale, with no shell, a 5-second limit and output cut at 4 KB                                                                                                                 | Probe **on `main`** (`sandbox-host.program-probe-node`); run env **Lands with #753** |
| Code planted by the agent runs outside the fence before it starts | The srt launcher gets only the host's absolute `PATH` (without entries the program can write) and `TMPDIR`; the program's own variables are set inside the fence. A planted `bwrap` or `NODE_OPTIONS` never runs                                                                                        | **Lands with #753** (HAL-2554)                                                       |
| The sandbox silently doesn't confine                              | Before a session starts anything, it proves the fence: a canary file it must hide, a canary loopback port it must block, and a control read. A session that isn't `fenced` starts nothing                                                                                                               | Port **on `main`** (`ports.sandbox-fence-proof`); proof **Lands with #753**          |
| A process keeps running after cancel                              | Each program runs in its own process group; `kill`, `close`, the time limit and an aborted run stop the whole group                                                                                                                                                                                     | **Lands with #753** (HAL-2554)                                                       |
| No sandbox, so the agent runs without one                         | `check()` gives a listed reason; when it isn't `ok`, `open` refuses and Halonic doesn't run the step. No code path falls back to running without the fence                                                                                                                                              | **On `main`** (`sandbox-srt.check`, `contracts.sandbox-check`)                       |
| Claude Code's or Codex's own sandbox breaks inside ours           | Inside our sandbox their own sandboxes are switched off in the settings folder Halonic gives them, and ours is the fence                                                                                                                                                                                | **Planned** (HAL-2552, HAL-2608)                                                     |
| You can't see what was blocked                                    | Each blocked access becomes a `sandbox.blocked` event in the run log. srt has no structured feed of blocked accesses, so the session in #753 reports none yet                                                                                                                                           | Event **on `main`**; reports **Planned** (HAL-193)                                   |
| An adapter passes its own tests but leaks                         | Attack tests every sandbox adapter must pass, on Linux, macOS and Windows: `~/.ssh` and keychain files, writes outside the working folder, the agent's own file, sites by name, address and DNS, the bridge without or with another run's token, your own harness settings, a process left after cancel | **Planned** (HAL-193; CI on macOS and Windows: HAL-2646)                             |

#### Linux, macOS and Windows

The fence differs per system. `check()` reports the first reason it can't
start, in this order, because its fix comes first.

- **Linux** uses bubblewrap: its own user, mount and network namespaces, with
  the network reached only through srt's proxy. It needs `bubblewrap`,
  `socat` and `ripgrep`; `check()` reports `linux-tools-missing` without
  `socat` or `ripgrep`. Inside a container (Docker, Podman) it can't nest and
  reports `container`.
- **Ubuntu 24.04 and later** stop programs from creating user namespaces
  (`kernel.apparmor_restrict_unprivileged_userns`). `check()` asks bubblewrap
  itself, because Ubuntu's bubblewrap profile can let it through, and reports
  `user-namespaces-restricted` when it can't. There are two fixes. An
  AppArmor profile for `bwrap` lets only bubblewrap through. Turning the
  setting off lets every program on the machine create user namespaces again,
  which gives local attackers more of the kernel to attack. We recommend the
  profile.
- **macOS** uses Apple's Seatbelt through `sandbox-exec`, plus `ripgrep`.
  `check()` only looks for `/usr/bin/sandbox-exec`. Apple marks `sandbox-exec`
  as deprecated, so a later macOS could change or remove it.
- **WSL 2** counts as Linux and gets the full Linux sandbox.
- **Plain Windows** has no sandbox on `main`: `check()` reports `windows` and
  nothing runs. The v0.1 desktop is to use srt's Windows mode, which is a
  preview, set up by the installer with one admin step (D44). If it isn't set
  up or fails its check, Studio offers to run that agent on this computer only
  after a warning you confirm. That is the "this computer" choice below,
  never a fallback Halonic makes by itself. The Windows mode needs a security
  review before it becomes the default (HAL-196). Microsoft's process container
  (MXC) as an extra Windows 11 option waits on the board (HAL-2546).

#### "This computer"

You can choose, per agent and per machine, to run an agent **on this
computer**, outside the sandbox. That choice turns off everything in this
section for that agent.

What you accept with it: the agent runs with all your rights. It can read
your SSH keys, browser profiles and Halonic's own data (including the token
store, whose key sits on the same machine, see 4.4), change any file you can,
including the workspace's definitions, trust records and its own settings,
and reach any address. The OS keychain doesn't stop it either: once the
desktop app keeps secrets and tokens there (4.4, Planned), such an agent can
read those items. On Linux (Secret Service, while it's unlocked) and Windows
(Credential Manager) it gets them without a prompt; on macOS the keychain may
ask you once for each app. Approvals then only hold as long as the agent keeps to
Halonic's tools. Claude Code and Codex keep their own sandboxes and permission
prompts, routed to Halonic's approval card (Planned, HAL-2552 and HAL-2608),
but those are theirs, not Halonic's fence.

| Threat                                                   | Mitigation                                                                                                                                                                                                   | Mark                                                                                     |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| A downloaded workspace moves an agent out of the sandbox | The choice lives in your profile, never in the workspace; without one, the agent runs in a sandbox                                                                                                           | **On `main`** (`ports.agent-placement-store`); file store **Planned** (HAL-189, PR #774) |
| A pull changes an agent you let out                      | The choice is bound to the SHA-256 of the agent file's raw bytes; any change, even whitespace, puts it back in the sandbox until you choose again. A file that changed while you read the prompt isn't saved | **On `main`** (`app.agent-placement`)                                                    |
| The agent or a model takes itself out                    | Only a person's action saves the choice; the engine gets only the read side, and no tool reaches the store. An unreadable choice means sandbox                                                               | **On `main`** (`app.agent-placement`)                                                    |
| You forget an agent runs unfenced                        | A permanent label on the agent that it runs with your full access                                                                                                                                            | **Planned** (phase 5)                                                                    |

#### The agent host

srt runs on Node, so the desktop app runs the sandbox, the bridge and the
harnesses in a separate program, the agent host (`apps/agent-host`). Studio
starts it and talks to it over loopback; the engine, budgets, approvals and
the run log stay in Studio, and the bridge asks Studio for keys, tools and
approvals as calls on a stream. The host runs as you, outside the sandbox,
like Studio.

| Threat                                                      | Mitigation                                                                                                                                                                                                                                                                                                              | Mark                                                               |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Another program or a web page on your machine uses the host | The host listens only on `127.0.0.1`, with a new 32-byte random token per launch that it prints only to Studio, on standard output, and compares in constant time. A `Host` other than loopback gets a 421 (DNS rebinding), any `Origin` header a 403, a wrong or missing token a 401, all before the path is looked at | **On `main`** (`apps/agent-host`, `src/server/host-server.ts`)     |
| The profile Studio sends loosens the fence                  | The host checks every profile before `SrtSandbox` sees it: every field present, nothing extra, every path absolute                                                                                                                                                                                                      | **On `main`** (`apps/agent-host`, `src/sandbox/profile-schema.ts`) |
| The bridge's run token leaks over the host's loopback       | A run names its bridge and its session by ids the host makes, so the run token crosses loopback once, when the bridge opens, and only to Studio. The host asks Studio only for the secrets the run's providers name                                                                                                     | **On `main`** (`apps/agent-host`, `src/harness`, `src/bridge`)     |
| A caller fills the host's memory or holds it open           | Bodies of at most 1 MiB, refused before reading when the length says more; a stream with more than 4 MiB unread is dropped; at most 64 sessions and 64 bridges                                                                                                                                                          | **On `main`** (`apps/agent-host`, `src/server`)                    |
| A sandboxed program outlives Studio                         | The host stops when its standard input closes. It cancels every run and then closes every session before it stops serving                                                                                                                                                                                               | **On `main`** (`apps/agent-host`, `src/host.ts`)                   |
| The host's unpacked files are changed                       | On launch the host checks every unpacked file against the SHA-256 the executable carries, and unpacks again when one differs. It runs a program for sandbox-srt only from this version's folder, and only while that file has its digest                                                                                | **On `main`** (`apps/agent-host`, `src/main.ts`)                   |
| A sandboxed agent changes the host's unpacked files         | The folder is in Halonic's data, so the profiles Studio builds deny it, with the rest of that data (the `halonic-data` group)                                                                                                                                                                                           | **Planned** (Studio's side of the agent host)                      |

Studio's side, which starts the host and gives the engine stand-ins over its
routes, isn't built yet, so no app uses the host today.

#### Known limits

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
  bridge. Its token is what keeps them out, and it lives only in the host's
  and Studio's memory. A program running as you can also change the host's
  unpacked files between launches, or the executable itself; the digest
  check finds the first only at the next launch.

## 5. `serve` (B6)

`halonic serve` is not built yet (phase 4, plan HAL-9). This section is the
design the code will be held to. Nothing here works today.

- **A `serve` on a non-loopback address is public.** Every rule below applies.
- Threats: DNS rebinding and a wrong `Host`, no sign-in, password guessing in
  parallel, a stolen session, cross-site requests, script injection,
  oversized bodies, error text that leaks, unsigned webhooks that start runs,
  and cost abuse.
- Planned mitigations (all **Planned**, phase 4): a host allow-list; required
  sign-in on public shapes, with the server refusing to run without a password
  hash; scrypt password hashing and a shared, atomic login limiter; session
  tokens stored only as hashes in `__Host-` cookies; an exact `Origin` check;
  strict security headers; a body limit enforced while streaming; errors that
  carry a code and a short message only; HMAC-signed, replay-protected
  webhooks.

Pieces already on `main` that `serve` will build on:

| Piece                                                                                                                                                            | Mark                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| `PasswordHasher` port and the hash format: scrypt, `ln=14, r=8, p=5`, 16-byte salt, checked ranges so a hash fits a 128 MB Worker (`ports.password-hash-format`) | **On `main`**         |
| Constant-time comparison in `core/std`                                                                                                                           | **On `main`**         |
| `Coordination` port with a Node adapter: leases, compare-and-set, counters that never pass their limit, fixed-window attempt counts safe against parallel calls  | **On `main`**         |
| The scrypt implementation, the sign-in flow, the login limiter and the server                                                                                    | **Planned** (phase 4) |

**Known limits.** Sign-in is a single factor on the public internet until
passkeys land. On loopback, "no password" may stay.

## 6. Cloud deployments (B7)

Not built yet (phase 4, plan HAL-9). A cloud deployment is reachable by the
whole internet and holds provider keys, Google tokens and your data, so the
`serve` rules apply, plus these:

| Threat                                                    | Planned mitigation                                                                                                                                                             |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A leaked deploy token                                     | An account-scoped token with the least scopes, stored only in the OS keychain, read from standard input, never in the Worker, logs or workspace. The Global API Key is refused |
| Deployed code differs from what you reviewed              | Upload from git objects at a commit, not the working tree; `deploy status` shows the commit and bundle hash                                                                    |
| Private files uploaded                                    | Tracked files only; no symlinks or submodules; a filename deny-list (`.env*`, `*.pem`, `*.key`) even for tracked files; `--plan` lists every file                              |
| Old versions stay reachable                               | Preview URLs turned off                                                                                                                                                        |
| A stolen session changes what runs                        | Definitions and configured secrets are read-only on cloud targets                                                                                                              |
| Tokens leak in a data export                              | Tokens are encrypted per record with the deployment id as bound data; exports hold no secrets or tokens                                                                        |
| A model-driven fetch reaches the cloud's metadata service | Outbound HTTP refuses loopback, link-local and private ranges unless a connector is allowed                                                                                    |
| Cost abuse                                                | Budget reserved atomically before each model call; per-trigger limits; a daily request ceiling                                                                                 |
| Export and import                                         | A one-job admin key whose hash the Worker holds, valid for that job only, never in a URL                                                                                       |

All **Planned** (phase 4).

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
- A new deployment shape adds a section here before it is called supported.
- Write only what ships, as in [writing docs](../guides/writing-docs.md). Say
  **Planned** for the rest.

The page on the trust gate comes with phase 2. The sandbox's limits for people
who use Halonic are on the docs site's Sandbox page; this section is the
reference it must agree with.
