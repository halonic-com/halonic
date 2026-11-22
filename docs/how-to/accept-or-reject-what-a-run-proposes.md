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
  file changed after the run started. The diff is from your file now. To keep
  it as it is now, reject it with `halonic proposals reject <run> <file>`.
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
| `halonic proposals reject <run-id>`, for a run whose changes were deleted outside Halonic | removes the run from the list, as **Remove from Inbox** does in Studio; your files stay as they are. If the changes are back by then, it rejects them, so check with `show` first |

Reject says, for example, "Rejected the changes to 2 files. Your files stay
as they are."

Accept writes a file only while it is still as the run found it. A file that
changed since is left alone, and the command says "notes/today.md changed
since the run, so it wasn't written. To keep it as it is now, reject it with
halonic proposals reject 01jd8q notes/today.md." and exits 5. Copy what you
want from `halonic proposals show` by hand, then reject that file.

After you decide part of a proposal, the command says how many files are
still to decide. Once none is left, it says "Run 01jd8q's proposal is done."
and the proposal leaves the list. The command has no Undo, so check the diff
before you accept.

If a proposal's changes were deleted outside Halonic, `show` and `accept`
say so and exit 5: "Run 01jd8q's changes were deleted outside Halonic, so
they can't be shown or accepted. Remove run 01jd8q from the list with
halonic proposals reject 01jd8q. If its changes are back by then, that
rejects them, so check first with halonic proposals show 01jd8q." Run that
command: it says "Removed run 01jd8q from the list: its changes were deleted
outside Halonic." and changes nothing in your files. In Studio, the same
run's page has **Remove from Inbox**.

If the run's changes came back in the meantime, for example because you
restored the deleted folder, `reject` doesn't remove the run: it rejects
those changes, as for any proposal. So run `show` first, then accept or
reject what it shows. In Studio, **Remove from Inbox** shows the changes
again in that case, with **Accept** and **Reject**.

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
says "This file changed after run 01JD8Q started. Accept opens Compare." Its
**Accept** opens Compare under it, with your text and the run's side by side:
**Keep mine** rejects the run's change, **Use the run's** writes the run's
text, and **Combine both** keeps both edits when they don't touch the same
lines. **Cancel** leaves the file undecided. The served Studio and the
phone list no proposals; see them with `halonic proposals` on the computer.
