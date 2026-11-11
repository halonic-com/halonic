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
  asks a second question.
- **Agents:** every agent that runs in Claude Code or Codex, with its allowed
  sites and its working folder when it isn't the default. Agents in Halonic's
  own harness aren't listed.
- **Addresses:** HTTP connectors, local integrations that read an address from
  a setting, and every model provider other than the test model, with its
  `baseUrl` (or its type when the file names none) and the secret it gets.
  Secrets are shown by name, never by value.
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

## What Studio asks for

Studio doesn't show this check. Its shell asks "Trust this folder?" before it
opens a folder you didn't pick yourself, and then names only the folder. It
doesn't list programs, agents, addresses or the fingerprint. Don't read that
question as a review of what the workspace can start (HAL-5519).

## What trust does not protect against

- **It isn't a sandbox.** After you trust a workspace, its programs run with
  your rights. Trust only workspaces from people you trust.
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
