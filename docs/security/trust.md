# Workspace trust

What the trust prompt is, what it asks for today and what it does not protect
you from. The prompt is a list, not a sandbox: it shows what a workspace can
start and where it can talk to, and you say yes or no. It does not limit what
a program does after you say yes. For the boundaries, see the
[threat model](threat-model.md), and for the fence agents run in, see
[the sandbox's limits](sandbox.md).

## What trust is

A workspace is a folder you may have downloaded from someone else. Its files
can name programs to start, addresses to call and model providers to send your
keys to. Halonic starts none of these until you have trusted the workspace
**on this computer**.

Trust is a record in your profile folder, kept per workspace folder and per
computer. A workspace's own files can't create or change it. A record holds a
fingerprint (`hfp1:` and 64 hex characters) of everything the check lists. If
any of it changes, the fingerprint changes and Halonic asks again. A change
that only removes whole entries (connectors, harness agents, local integrations
or model providers) doesn't ask. Removing a variable or another detail inside
an entry is a change, and it asks.

## What `halonic trust` shows

`halonic trust [--dir <folder>]` prints the trust check, then asks. The check
lists, in this order (requirement `cli.trust-check`):

- **Programs:** every stdio connector's command, with the path it resolves to
  on this computer, its arguments and its environment. A program started by
  `npx`, `uvx` or `pipx run` without a pinned version gets a `!` line, because
  it fetches code from npm or PyPI each time it starts. For those, the prompt
  asks a second question. Where the sandbox works on your computer, a program
  whose connector names `sites` then lists each site it may reach in it, one
  per line, as an agent's allowed sites are, and the summary counts each site
  once with the agents' sites. Where it doesn't, the check shows no site of a
  program, because the program runs with your rights and `sites` limits
  nothing.
- **Agents:** every agent that runs in Claude Code or Codex, with its allowed
  sites and its working folder when it isn't the default. A Claude Code agent
  whose file sets `asks: in-sandbox` gets one more line, "Without asking: edits
  and runs commands in its working folder, inside the sandbox" (requirement
  `cli.trust-check-asks`). The setting is part of the fingerprint
  (`workspace.trust-agent-asks`), so changing it asks for trust again, and the
  agent's Changed row says it now does so without asking, or asks again.
  Agents in Halonic's own harness aren't listed.
- **Addresses:** HTTP connectors, connectors to a plugin, local integrations
  that read an address from a setting, and every model provider other than the
  test model, with its `baseUrl` (or its type when the file names none) and the
  secret it gets. A plugin connector names its plugin and, when the plugin is
  installed on this computer, the hosts its backend lists, "Reaches
  api.acme.example.". Those hosts come from the plugin's own manifest, which
  `halonic plugin add` showed you, so they aren't in the workspace's
  fingerprint.
  Secrets are shown by name, never by value. A provider whose key goes to an
  address other than its type's own gets a second line, "Sends its key to
  https://llm.example.com." (see
  [a key goes only to its own address](#a-key-goes-only-to-its-own-address)).
- **Fingerprint:** the full fingerprint, never shortened.

When the workspace changed since you trusted it, the check shows only what is
new or changed. When it is unchanged, you get one line with the date.

Other options:

| Command | What it does |
| --- | --- |
| `halonic trust --list` | Lists the workspaces trusted on this computer, with the day each was trusted. |
| `halonic trust --remove` | Forgets the trust in a workspace, even when its record can't be read. |
| `halonic trust --yes --fingerprint <fingerprint>` | Trusts without asking, but only if the fingerprint matches what the check shows now. |

Without a terminal and without `--yes --fingerprint`, the command asks nothing
and refuses (exit 3). Files that change between the check and your answer
can't be trusted by accident: the answer binds to the fingerprint you saw.

## Where trust is checked

`halonic run`, `halonic runs send` and `halonic routines watch` refuse an
untrusted or changed workspace with exit 3 and write the check and the fingerprint (requirement
`cli.not-trusted`). A record that can't be read counts as no trust. A run that
can only reach the test model needs no trust. `halonic validate` starts
nothing, so it doesn't check.

The host's server (`packages/host/server`, behind `halonic serve` and the
cloud Worker) checks trust on every request that starts a run, which are
`POST /api/runs` and `POST /api/agent-runs` (requirement `server.trust-gate`). It
answers 403 with the code `workspace_not_trusted` for a workspace that isn't
trusted or changed since, and 500 when the check itself fails; in both cases
nothing starts. Unlike the CLI, it makes no exception for a run that can only
reach the test model. `GET /api/trust` only shows the decision. No route of the
server grants trust: you do that on the computer, with `halonic trust`.

## A key goes only to its own address

A provider file with a `secret` makes Halonic send that key to the provider's
`baseUrl`. Every call that resolves a provider checks where the key would go,
in the CLI, in Studio and for the agent editor's unsaved settings
(requirement `cli.workspace-provider-key-trust`). The key may go to a non-default address
only when the workspace is trusted on this computer. Otherwise the call is
refused with the error `untrusted-provider-address`, which names the provider
and the origin (scheme, host and port), never the key or the path, and says
to check `providers/<id>.yaml` and trust the workspace.

An address is the default when `baseUrl` is left out, or when its scheme, host
and port are the same as the type's own: `https://api.anthropic.com` for
`anthropic`, `https://api.openai.com` for `openai`, `http://localhost:11434`
for `ollama` and `http://localhost:1234` for `lmstudio`. Everything else is not
the default: a type with no address of its own such as `openai-compatible`,
`http` where the type's own is `https`, another port, an IP address (even
`127.0.0.1` for a type that uses `localhost`), a host that only looks like the
default one, and an address with a user name or password. A provider without a
`secret` and the test model have no key to protect. The model adapters never
follow a redirect, so a server can't pass the key on to another address.
A folder you already trusted stays trusted: the trust fingerprint already
holds each provider's type, `baseUrl` and secret name.

### A key can be tied to its addresses

A stored key can also have a list of allowed origins, kept with the key (in the
CLI, in the profile's secrets file). The list adds to the rule above and never
replaces it: a key with a list goes only to an origin on it, and still only
where the rule above lets it go, so a listed address that isn't the type's own
still needs a trusted workspace. A provider file can pick the key by name but
can't pair it with another address. Any origin off the list, an address that
can't be read included, refuses the call with the error
`key-origin-not-allowed`, which names the provider and the origin, never the key
or the path. Origins match as a whole (scheme, host and port), never by prefix.

A key saved before lists existed has none, and keeps the rule above.

Studio's desktop keychain keeps a key's list as a second entry beside the key
(service `halonic-origins`, under the key's name), and Studio's engine checks it
on every model call with a key, the same way. A list the keychain didn't write
is an error, never read as no list. A provider's page on the Models page writes
it: a new key is saved with an address (the provider type's own, pre-filled, or
one you type), and is removed again if its address can't be kept, so it never
stands without one. A key saved before lists existed shows "Not bound yet" and
keeps the rule above until you save an address for it. A list that can't be
read is shown as an error, never as "Not bound yet". `halonic models
allow-address` writes to the CLI's secrets file, not the keychain.

`halonic models allow-address <key-name> <address>` adds one address to a key's
list, keeping the others. It keeps the scheme, host and port of what you type,
and refuses an address with a user name or password. It refuses to run from
inside a run, when the run marker `HALONIC_RUN_TOKEN` is in its environment.
That check is a second layer so a tool gets a clear answer; it is not the
boundary. The boundary is the sandbox, which denies a run the profile folder
where the list is kept, so a tool can't edit the list even by removing the
marker.

### A harness agent's key

A Claude Code or Codex agent set to "On this computer" signs in with its own
program, and Halonic never reads or passes on a key for it. A sandboxed one
can't reach that sign-in, so the run's bridge gets the key of the workspace's
provider of the type the program calls (requirement `cli.harness-provider-key`).
When the agent's file names a `models.yaml` alias as its `model`, the bridge gets
that alias's provider's key wherever the agent runs, because the program is
asked for the alias's model on every call. Before the alias's key is named, it
gets the same check as any other model call: a non-default address needs a
trusted workspace, a key with a list goes only to an origin on it, and an
untrusted workspace calls no real provider. The bridge sends the key only to
the provider file's one origin, never to another host the program names and
never after a redirect, and for an alias it refuses a call for any model but
the alias's, so the key pays only for the model the alias prices. Give the
alias a `price`: without one, its calls are unpriced, as in any other agent,
and a cost limit or budget doesn't count them. The bridge reads only the keys
the workspace's provider files name; a key you saved for anything else never
reaches it. The CLI and Studio do this alike (requirement
`studio.harness-provider-key`); in Studio, the agent host's bridge reaches a
provider's own `baseUrl` through a client that checks the address as a
connector's address is, so the name can't lead the key onto your own network.

## What Studio asks for

Studio shows this check too (`apps/studio`, `src/studio/workspace-trust.ts`,
`src/studio/trust-review.ts`). It checks a folder with the same `TrustService`
and the same fingerprint as the CLI, and its review lists the programs, agents,
addresses and integrations the workspace can start, or what changed since you
trusted it. Its shell's older "Trust this folder?" question, asked before it
opens a folder you didn't pick yourself, names only the folder: don't read that
question as a review of what the workspace can start.

## What trust does not protect against

- **It isn't a sandbox.** After you trust a workspace, its programs run with
  your rights, and can read your files. A stdio connector
  gets only a small base of your environment, such as `PATH` and your proxy,
  plus the variables and secrets its connector names in `env`, `secretEnv` and
  `inheritEnv`. A key it names in `secretEnv`, or a variable it takes with
  `inheritEnv` that holds a password, still reaches it, so read the names the
  trust check lists (see the
  [threat model's known limits](threat-model.md#44-secrets-tokens-and-outbound-calls-b4)).
  Trust only workspaces from people you trust.
- **It covers what the check lists, not what the files say.** Prompts,
  workflows, skills and knowledge aren't in the fingerprint. They can't start a
  program, but they can steer a model. The threat model covers that under
  [model output](threat-model.md#42-model-output-and-content-b2).
- **It doesn't read a program's code.** The fingerprint covers the command, its
  resolved path and its arguments. A pinned program that someone replaces on
  disk keeps its path. An unpinned one is a new download every start, and
  the `!` line is the only warning.
- **A yes is per workspace, not per program.** You can't trust one connector and
  not another.
- **It doesn't confine an agent.** An agent in Claude Code or Codex runs in the
  sandbox, which is a separate check with its own limits.
- **It doesn't say a connector or provider is honest.** A trusted address
  receives whatever the program or provider is given.
- **It guards one computer.** A record made on another computer doesn't count
  here.

## Keeping this page true

A pull request that changes what the trust check lists, where trust is checked
or what Studio asks updates this page, `cli.trust-check` and the
[threat model](threat-model.md#8-limits-of-trust-and-of-the-sandbox) together.
