# Turn Local only on or off

Local only is a workspace setting. While it is on, nothing leaves your
computer: agents may use only local models, such as Ollama, and connectors
that run on this computer. A run that would reach a cloud model or service is
refused before it sends anything. A new workspace starts with Local only on.

## Turn it on or off

The setting is `privacy.localOnly` in the workspace's `workspace.yaml`:

```yaml
privacy:
  localOnly: false
```

Set it to `true` to turn Local only back on. In Studio, choosing a cloud model
when you set up a workspace turns it off for you, and says so before it does.

In a workspace with history, runs start from the live version, but turning
Local only on counts as soon as you save it, in Studio and on the command
line. Turning it off counts only once you make the change live.

## While a run is going

A run that is already going keeps the setting it started with. What happens
next depends on where the workspace runs.

**In Studio**, until that run ends, starting another run or sending an answer
in the workspace is refused with, for example, "Local only was turned on in
Acme while a run was going." and "Try again once that run ends." Nothing was
started or sent. Once the run ends, press **Try again**. A run that waits for
you or for a timer isn't going: it goes on with the new setting.

A routine that was due in that time doesn't start, and says "Local only was
turned on in Acme." with "It starts at its next time." You don't need to do
anything: it starts at its next time, with the new setting.

**On the command line**, each `halonic run` reads the setting when it starts,
so the change counts from the next one. A `halonic routines watch` that is
already running keeps the setting it started with: a routine whose files turn
Local only on or off doesn't start, and `--debug` says why. Saving Local only
on stops its routines the same way, and a run that is already going can't
start any more connectors. Stop the watch
with Ctrl C and start it again to run with the new setting.
