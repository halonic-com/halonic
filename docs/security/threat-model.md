# Threat model

What Halonic protects, from whom, and where the lines are drawn. Read it before
you change anything that touches a boundary in [section 3](#3-trust-boundaries).
To report a problem, see the [security policy](../../SECURITY.md).

Every mitigation carries one of two marks:

- **On `main`**: the code is merged and tested. This is library code. No app or
  command-line tool uses it yet, so it isn't a protection you get today.
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

## 4. Threats per boundary

### 4.1 Workspace code (B1)

**A workspace can run code.** A local MCP server (`stdio`) is a program on your
machine, and tests, hooks and scripts in a workspace are too. Opening a
workspace you didn't write is like running its code.

| Threat                                                     | Mitigation                                                                                                                                                                                                         | Mark                                                                                                |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| A workspace starts programs before you trust it            | Ask "trust this workspace" before any program starts; no `shell: true`. The `TrustStore` port and its record format exist; nothing asks yet. The requirement `ports.connector-trust-enforcement` is still a draft. | **Planned** (phase 2, plan HAL-9; the requirement becomes active with the contract suites, HAL-181) |
| A hub lists the token collection                           | `_tokens` can't be a workspace collection id, so a hub can't list it (`packages/core/format`, collection schema)                                                                                                   | **On `main`**                                                                                       |
| A workspace reads another workspace's or hub's data        | Isolation between workspaces and hubs is not built                                                                                                                                                                 | **Planned** (phase 2, plan HAL-9)                                                                   |
| A listed tool of an untrusted workspace lowers its risk    | Without a trust grant every listed tool counts as `write`; `readToolListing` ignores the workspace's lower risks (`packages/core/app/src/tool-listing.ts`)                                                         | **On `main`**                                                                                       |
| Secrets committed to the repository                        | The leak guard blocks private keys, Google client secrets, OAuth tokens, protected personal terms and absolute local paths (`tooling/check/src/leaks`, [leak guard](../guides/leak-guard.md))                      | **On `main`**                                                                                       |
| A sandbox limits what a trusted workspace's program can do | not built                                                                                                                                                                                                          | **Planned** (phase 3, plan HAL-9)                                                                   |

**Known limit.** After you trust a workspace, its programs run with your
rights. Trust only workspaces from people you trust.

### 4.2 Model output and content (B2)

**Model output is untrusted.** Content a model reads (a mail, a web page, a
tool result) can steer what it asks for. Prompt injection isn't solved. The
rule is that a steered model must not be able to do more than you approved.

| Threat                                          | Mitigation                                                                                                                                                                                                                     | Mark                                        |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------- |
| Injected text makes the model call a risky tool | Tools have a risk (`read` or `write`). A `write` tool needs approval in the engine, not in the model's prompt                                                                                                                  | Planned (HAL-803 for listed tools; see 4.3) |
| A tool result carries instructions              | Results from tools marked untrusted reach the model only inside a fence                                                                                                                                                        | Planned (HAL-803)                           |
| Knowledge or documents carry instructions       | The active requirement `ports.untrusted-knowledge` says such text is fenced; the fence is rendered when tools and prompts are assembled                                                                                        | Planned (HAL-803)                           |
| A run is changed after the fact                 | Each run is an append-only event log, kept apart from the definitions ([ADR](../adr/2026-11-08-runs-are-stored-separately.md)). On `main` there is the `RunStore` port and a memory adapter only; the durable log is not built | **Planned** (phase 1, plan HAL-9)           |

**Known limit.** Run logs have no tamper evidence. An append-only interface
doesn't stop a program running as you from rewriting the files.

**Known limit.** Approvals and secret bindings limit the harm of a steered
model. They don't stop it from being steered.

### 4.3 Tool listings from servers (B3)

A server you connect to writes the descriptions of the tools it lists. A
**listed tool** is one the server lists and nothing Halonic reviewed declares.
Its text is attacker text. The rules are the draft requirement
`ports.untrusted-tool-listings` (still draft, active with HAL-803), so the
**On `main`** rows below rest on a draft.

| Threat                                                                           | Mitigation                                                                                                                                                                                                                                                                                                                                                             | Mark              |
| -------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------- |
| Oversized or deeply nested schemas                                               | Parameters over 64 KiB, nested over 64 levels, or with a text over 10,000 characters are refused                                                                                                                                                                                                                                                                       | **On `main`**     |
| Hidden instructions in schema keywords (`default`, `examples`, `x-…`, `pattern`) | `parameters` are rebuilt from an allow-list of keywords; everything else is dropped and reported                                                                                                                                                                                                                                                                       | **On `main`**     |
| Instructions in names, `enum` and `const` values, which can't be fenced          | Names must be 1 to 64 letters, digits, `_` or `-`; a bad `enum` is dropped; unfenced text is capped at 2,048 characters per tool                                                                                                                                                                                                                                       | **On `main`**     |
| A server swaps a reviewed tool's text                                            | A declared tool keeps its declared description, parameters and risk; the listing can't change them                                                                                                                                                                                                                                                                     | **On `main`**     |
| A listed tool lowers its own risk or marks itself trusted                        | Its `risk` and `untrusted` are ignored; it counts as `write` unless a trusted workspace says otherwise                                                                                                                                                                                                                                                                 | **On `main`**     |
| Two tools share a name                                                           | Every clashing listed tool is refused                                                                                                                                                                                                                                                                                                                                  | **On `main`**     |
| The description reaches the model as an instruction                              | Descriptions and titles come back as `UntrustedText`, whose `toJSON` throws, so they can't be serialised to JSON without the fence. `toString` doesn't throw: a template string gives `[object Object]`, which doesn't leak the text. `structuredClone` or IPC turns it into a plain object and loses the guard. The fence itself is rendered when tools are assembled | Planned (HAL-803) |
| A call uses arguments the listing never declared                                 | Refused at call time; `write` needs approval                                                                                                                                                                                                                                                                                                                           | Planned (HAL-803) |
| A server changes its tools after you looked                                      | Pinning and approving listings                                                                                                                                                                                                                                                                                                                                         | Planned (HAL-520) |

**Known limit.** Unfenced strings (names, `enum` values) can still carry up to
64 characters each and 2,048 per tool. The `write` risk, and approval for it, is
what limits the harm.

### 4.4 Secrets, tokens and outbound calls (B4)

| Threat                                                  | Mitigation                                                                                                                                                   | Mark                                                       |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| A secret goes to the wrong address                      | An integration's secret is placed by the kit only for a declared secret and an allowed host; the integration never sees the value                            | **On `main`** (`integration-kit.secrets-placed-by-kit`)    |
| Requests go to hosts nobody declared, or redirect there | Exact, case-insensitive host match over `https`; every redirect hop is checked like the first request                                                        | **On `main`** (`declared-hosts-only`, `redirects-checked`) |
| Plain `http` leaks a secret                             | `http` only to this machine or a private address, and a secret only to this machine                                                                          | **On `main`** (`local-http-hosts`)                         |
| One integration reads another's tokens                  | Names are `i<n>_<integration>_<token>`; a policy declares what each may read                                                                                 | **On `main`** (`scoped-tokens`)                            |
| A slow or huge response ties up the host                | Header, idle and overall timeouts and a size limit on every request                                                                                          | **On `main`** (`request-limits`)                           |
| Logs leak secrets                                       | The request log holds method, host, path, status, time and outcome; no query, headers or bodies                                                              | **On `main`** (`request-log`)                              |
| A stored token is read from disk or a copy              | AES-256-GCM, a new random nonce per write, bound to the token's name so a value can't be moved to another name; the key is the secret `token-key` (32 bytes) | **On `main`** (`packages/adapters/token-store`)            |
| A wrong key looks like "not signed in"                  | A value that won't open throws `UnreadableTokenError`, never `null`; the error names the token, not its value                                                | **On `main`**                                              |
| Token names fold into each other                        | Case and `-` versus `_` are treated as the same name; bad names are refused before anything is read                                                          | **On `main`**                                              |

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
- When a **Planned** item merges, change its mark to **On `main`** and name the
  code or the requirement that proves it.
- A new deployment shape adds a section here before it is called supported.
- Write only what ships, as in [writing docs](../guides/writing-docs.md). Say
  **Planned** for the rest.

The pages on the trust gate and the sandbox come with phases 2 and 3.
