# Check your setup with `halonic doctor`

When something doesn't start, or before you run a workspace for the first
time, run `halonic doctor`. It checks this computer and, inside a workspace,
the workspace too. It prints one line per check, with what to do under each
line that isn't right.

`doctor` never calls a model provider over the internet. It only asks the
model servers on this computer, such as Ollama, which models they have loaded.

## Run it

1. Open a terminal in your workspace folder, the one with `workspace.yaml`.
2. Run:

   ```sh
   halonic doctor
   ```

   To check a workspace in another folder, add `--dir <folder>`. Outside a
   workspace, without `--dir`, `doctor` checks only this computer.

3. Fix each line marked ✕ or !, top to bottom, using the sections below.
4. Run `halonic doctor` again until it says there are no problems.

## Read the report

The first line names your Halonic version and system. Then comes one line per
check. Each starts with a mark and the name of the check:

| Mark | Status in `--json` | Means |
| --- | --- | --- |
| ✓ | `ok` | This check is fine. |
| ! | `warning` | Some things won't run until you fix it, such as one agent or one model alias. Halonic itself works. |
| ✕ | `failed` | A problem. Everything that needs this check stops until you fix it. |

A check that doesn't apply has no line. For example, there are no
**Workspace** and **Models** lines outside a workspace.

Under the lines, a summary counts the problems (✕ lines) and the warnings
(! lines), and says what a sandbox that can't start or a model server that
isn't answering stops.

### Exit codes

| Code | When |
| --- | --- |
| `0` | No line is ✕. Warnings still exit with `0`, so a CI job can run `doctor` and pass with warnings. |
| `1` | At least one line is ✕. |
| `4` | `--dir` names a folder without a `workspace.yaml`. |

### JSON output

`halonic doctor --json` writes the same report for scripts. `checks` lists
every line in order, each with its `check` (such as `sandbox`) and `status`
(`ok`, `warning` or `failed`), plus what that check found. `problems` and
`warnings` hold the counts.

## The checks

### Workspace

**Checks:** whether the workspace's files load without errors, and whether
you have trusted the workspace on this computer. Shown only inside a
workspace.

| You see | Means | Fix |
| --- | --- | --- |
| ✓ "trusted on this computer" | You trusted the workspace as it is now. | Nothing. |
| ✓ "test model only, no trust needed" | Every run here can only reach the built-in test model, so it needs no trust. `examples/acme` shows this. | Nothing. |
| ! "not trusted yet" | You haven't trusted this workspace on this computer yet, or Halonic couldn't read its trust record. Runs won't start. | Run `halonic trust` (the line shows the command with your `--dir`). |
| ! "changed since you trusted it" | A file that trust covers changed since you trusted it. | Run `halonic trust` and confirm the change. |
| ! "can't be trusted" | A file names something that can't be trusted. | Run `halonic trust`: it says which file and why. |
| ! "more than 50,000 files" | The folder has too many files for Studio to watch, so Studio won't show changes made outside Halonic as they happen. Runs and Studio still work. | Open a smaller folder, or move files the workspace doesn't use out of this one. |
| ✕ "problems in its files" | Some of the workspace's files have errors. Halonic leaves those files out, and no run starts here. | Run `halonic validate`, fix each error it lists, then run `doctor` again. |

**On Windows, inside WSL:** if the workspace is on a Windows drive (under
`/mnt/`), the line is ! even when it's trusted, because runs there are slower.
If Studio on Windows opens this folder, keep it there. If you use it only from
the command line, move it into your Linux home folder (`~`).

### Models

**Checks:** that the workspace has the default model its agents need, and the
model providers that your workspace's model aliases use, then any provider an
agent names directly (such as `claude/claude-sonnet-5-5`). For a model server
on this computer, `doctor` asks whether it answers and which models it has
loaded. For a cloud provider, it checks that the provider's API key is stored.
It never reads or shows the key itself. Shown inside a workspace that uses
such a provider, or whose agents need a default model it doesn't have. The
built-in test model needs nothing, so it isn't listed.

| You see | Means | Fix |
| --- | --- | --- |
| ✓ "answering at" an address | The model server on this computer answers, and the line lists the models it has loaded. | Nothing. |
| ✓ "API key stored" | The key for this cloud provider is stored. | Nothing. |
| ! an alias "needs an API key" | The aliases named on the line use a provider whose key isn't stored. Agents that use them won't run. For a provider an agent names directly, the line names that model instead, such as `claude/claude-sonnet-5-5 needs an API key for claude.` | Store the key with `halonic secret set <name>`, where `<name>` is the `secret` in the provider's file. |
| ! "couldn't read" a key "from the secret store" | Halonic couldn't read this provider's key from the secrets file, for example because the file is damaged or other users can read it. The key may still be there. | Run `halonic secret list`: it says what's wrong with the file and how to fix it, such as `chmod 600 <file>`. Then run `halonic doctor` again. Don't set the key again until `doctor` says it isn't set. |
| ✕ "no model alias default" | The workspace has no model alias `default`, and agents that don't name a model of their own need it. They won't run until it's added. `doctor` exits 1. When a workflow runs those agents, `halonic validate` fails with `unknown-default-model`, and `doctor` shows ✕ "problems in its files" on the Workspace line instead, with no Models line: the Models check waits until the files have no errors. | Copy `models.yaml` and `providers/mock.yaml` from Acme (`examples/acme`), or add your own alias `default`. |
| ✕ "isn't answering" at an address | The model server on this computer doesn't answer. Every alias that uses it fails, and Halonic doesn't fall back to another model by itself. | Start the server (for example, open Ollama or LM Studio). Check that the address matches `baseUrl` in the provider's file. |

Until you trust a workspace, `doctor` only asks servers on this computer. A
server at any other address shows as not answering until you run
`halonic trust`.

### Sandbox

**Checks:** whether the sandbox that agents run in can start on this computer.
On Linux it uses bubblewrap, on macOS Seatbelt. Always shown.

| You see | Means | Fix |
| --- | --- | --- |
| ✓ "ready" | The sandbox can start. The line names its kind. | Nothing. |
| ✕ "can't start on this computer" | Agents set to run in a sandbox won't start. The lines under it give the reason, the fix and a `More:` link to the sandbox page. | Follow the `Fix:` line. |

Common reasons and their fixes:

| Reason | Fix |
| --- | --- |
| Halonic runs inside a container, such as a dev container or a CI runner | Run Halonic on the computer itself. `halonic validate` and `halonic test` work in a container, so this ✕ is expected there. |
| bubblewrap isn't installed (Linux) | Install it, for example with `sudo apt install bubblewrap` on Ubuntu or Debian. |
| socat or ripgrep isn't installed (Linux) | Install both, for example with `sudo apt install socat ripgrep`. |
| ripgrep isn't installed (macOS) | Install it, for example with `brew install ripgrep`. |
| Ubuntu 24.04 blocks user namespaces | Allow them for bubblewrap with an AppArmor rule. The sandbox page has the commands. |
| The distro runs on WSL 1 | Switch it to WSL 2. The fix line gives the PowerShell command with your distro's name. |
| Windows, outside WSL | Use Halonic inside WSL 2. |

For every reason, see
[the sandbox page](https://docs.halonic.dev/security/sandbox/), which is the
page the `More:` link opens.

### Harnesses

**Checks:** the agent harnesses Halonic can start besides its own, Claude Code
and Codex: whether each is installed, which version, and whether each agent
that uses one is signed in. Shown when a harness is ready for you (installed
in a version Halonic supports, and you're signed in to it on your own account),
or when one of the problems below applies. A harness you aren't signed in to
yourself isn't listed. So with Claude Code or Codex installed, nobody signed in
to it on their own account, and every agent that uses it covered by a provider
key or its own sign-in, there's no Harnesses line at all.

A harness that no agent uses is never a warning. Each line here is at most a
warning, because only the agents that use that harness are stopped.

| You see | Means | Fix |
| --- | --- | --- |
| ✓ a harness and its version | The harness is installed, Halonic supports this version, and you're signed in to it yourself. | Nothing. |
| ! an agent uses a harness "and it isn't installed" | That agent can't start. | Install the harness, then run `doctor` again. |
| ! a version "isn't supported" | The installed harness is older than Halonic needs. The line says which version it needs. | Update the harness, then run `doctor` again. |
| ! "couldn't ask its version" | Halonic found the harness, but asking its version failed. The line gives the harness's own error. | Check that the harness runs on its own in a terminal. |
| ! a harness "isn't signed in for" an agent | Each agent signs in to its harness on its own, in its own settings folder, not with your personal sign-in. An agent whose runs in the sandbox get a provider key instead, the workspace's `anthropic` or `openai` key as `halonic run` gives it, isn't asked about, because its runs don't use its own sign-in. | Run the sign-in command on the `Fix:` line in your own terminal. It signs in for that agent only. |
| ! an agent's model "searches the web by itself" | The agent's model alias points at a model its provider file lists in `searchesWeb`. That model searches the web at the provider, outside Halonic's tools and approvals. | Nothing, if you chose that model on purpose. Otherwise point the alias in `models.yaml` at a model that doesn't search by itself. |

The search warning only covers the model ids a provider file lists in
`searchesWeb`, matched exactly. A suffix that turns search on for any model,
such as OpenRouter's `:online`, isn't detected yet.

### Node.js

**Checks:** whether the Node.js and pnpm that run Halonic fit where they run.
Shown only on Windows with WSL, and only when something is wrong. It's always a
warning: Halonic starts, but it runs in the wrong place.

| You see | Fix |
| --- | --- |
| ! Windows' Node.js is running in a WSL folder | Install Node.js inside WSL, then run `doctor` again from a WSL terminal. |
| ! The `pnpm` on the `PATH` is Windows' one, under `/mnt/` | Install pnpm inside WSL, for example with `npm install -g pnpm`, then run `doctor` again. |

### Disk

**Checks:** the free space on the drive where Halonic keeps its data, and how
much of it Halonic's own data takes, run logs included. Always shown. It's
never ✕: Halonic still runs on a nearly full disk until it can't write a run
log.

| You see | Means | Fix |
| --- | --- | --- |
| ✓ the free space | Enough room. The line also says how much Halonic uses, and how much of that is run logs. | Nothing. |
| ! "Low on disk space" | Less than 1 GB is free. | Free up space on that drive. |
| ! "free space unknown" | Halonic couldn't read the free space on this drive. | Nothing to fix in Halonic. Check the drive's free space yourself. |

## If `doctor` itself fails

If `doctor` stops with "Couldn't check" and exits with `4`, the folder you
gave with `--dir` has no `workspace.yaml`. Run it inside a workspace, create
one with `halonic init`, or copy the example with `halonic init --example acme`.

For anything else, run the command again with `--debug` and open an
[Install problem](https://github.com/halonic-com/halonic/issues/new?template=install-problem.yml)
issue with the output. Remove keys, tokens and private folder or user names
first.
