# Accept or reject what a run proposes

An agent that runs in Claude Code or Codex, in the sandbox, doesn't write in
your workspace. It works in a copy, and when its run ends with changes, they
wait for you as the run's *proposal*. Nothing in your files changes until you
accept.

`halonic run` says so on its last line, with the command to see them:

```text
Run 01jd8q proposes changes to 2 files. Nothing in your files changed yet: see them with halonic proposals show 01jd8q.
```

## See what's waiting

```sh
halonic proposals
```

lists every proposal waiting for you, newest first: the run's short id, how
many files it changes (and how many are left to decide) and when the run
finished.

```text
01jd8q   2 files   5 minutes ago

See one with halonic proposals show <run-id>.
```

With nothing waiting it says "No run in Acme has changes waiting for you."
It changes nothing and needs no engine, so it works while
`halonic routines watch` runs.

## Look at one

```sh
halonic proposals show 01jd8q
```

shows each file the run added, modified or deleted, with a diff from your
file as it is now to the run's text. A short id or the full one works.

- "This file changed since the run, so accept won't write it." means the
  file changed after the run started. The diff is from your file now.
- "Your file already has these changes." means there's nothing to write.
- A file under `.git` or `.halonic`, or in Halonic's own data folder, is
  marked "can't be written". Halonic never writes there.
- A file you already decided is marked "(accepted)" or "(rejected)".

## Accept or reject

| Command | What it does |
| --- | --- |
| `halonic proposals accept <run-id>` | writes the run's changes to your files and names the files it wrote |
| `halonic proposals accept <run-id> <file>` | writes only that file |
| `halonic proposals reject <run-id>` | rejects the run's changes; your files stay as they are |
| `halonic proposals reject <run-id> <file>` | rejects only that file's changes |

Reject says, for example, "Rejected the changes to 2 files. Your files stay
as they are."

Accept writes a file only while it is still as the run found it. A file that
changed since is left alone, and the command says "notes/today.md changed
since the run, so it wasn't written. To keep it as it is now, reject it." and
exits 5. Copy what you want from `halonic proposals show` by hand, then reject
that file.

After you decide part of a proposal, the command says how many files are
still to decide. Once none is left, it says "Run 01jd8q's proposal is done."
and the proposal leaves the list. The command has no Undo, so check the diff
before you accept.

If a proposal's changes were deleted outside Halonic, `show` and `accept`
say so, and `halonic proposals reject <run-id>` removes the proposal.

All four take `--dir <folder>` for a workspace other than the current
folder. `halonic proposals` and `halonic proposals show` also take `--json`
for scripts.

## In Studio

In the desktop app, each proposal waiting for you is an item in the Inbox,
under **Needs you**: "Run 01JD8Q proposes 3 changes to Support triage". Open it
to see each file the run added, changed or deleted, with **Accept** and
**Reject** for each, or **Accept all** and **Reject all**. After each decision,
**Undo** shows for a moment, until its message goes.

Studio doesn't show the diff yet. A file that changed after the run started
says "This file changed after run 01JD8Q started, so it wasn't accepted. To
keep it as it is now, reject it." and has only **Reject**: use
`halonic proposals show` to see the run's text, copy what you want by hand,
then reject the file. The served Studio and the
phone list no proposals; see them with `halonic proposals` on the computer.
