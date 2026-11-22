# Decision: C629 words for a stopped plugin, the Dismiss toast and New code's marks

- Task: HAL-15792 (words check C629, HAL-15781)
- Approval: team wording on approved screens (HAL-2282); Sofia wrote the words in C629; Liam signs this note
- Kind: user-visible

## What changes

A plugin the host stopped because its runner's sandbox didn't work (`plugin_stopped`, HAL-15537), C629 rows 21 to 26:

- `plugins.plugin-cards` and `plugins.plugin-commands`: the card and the command dialog say "Halonic stopped
  *name*: the sandbox didn't work when it started, so none of it ran." with **Try again** (and ↻ on the card).
  "Open *name* to check again." goes from both. The page's **Check again** only clears the page's note, while the
  host tries the sandbox again at the next call, so **Try again** is the step that can work. "Didn't work" is the
  plugin page's and the run's word for the same stop. The card's ⋮ › **Open plugin** still reaches the page.
- `plugins.palette-commands`: the sentence about opening the stopped plugin's page from its dialog goes with the
  link. The dialog no longer takes `onOpenPlugin`, and `PluginCommandHost` no longer takes `openPlugin`.
- `agent-host-client.plugins`: the message for `plugin_stopped` is "Halonic stopped this plugin: the sandbox didn't
  work when it started, so none of it ran." It no longer promises a Try again the screen may not have.
- `agent-host.plugin-routes`: the host's own 403 message is "Halonic stopped this plugin: the sandbox didn't work
  when it started, so none of it ran. The next call tries the sandbox again." Studio doesn't show it, but Copy
  details and logs do. What the host does is unchanged.

The others:

- `first-run.setup-item` (row 27): the Dismiss toast's title is "First run dismissed.", with a full stop, because
  the toast has a second sentence (microcopy 1.3).
- The phone's pairing problem screen (row 33): "choose **New code**" is marked in `generic.body`, `used.next` and
  `used.nextTyped`, as **Make a new code** is next to them. No requirement quotes these lines.

C629 row 37 (the line after a partial Take back) isn't in this PR: Sofia OK'd the words for that line on HAL-15796
after C629, and they land with #4879 (HAL-15786).

No test was weakened or skipped. The tests that pressed the plugin's name to open its page now check that no such
button is there.

## Covers

- plugins.plugin-cards
- plugins.plugin-commands
- plugins.palette-commands
- agent-host-client.plugins
- agent-host.plugin-routes
- first-run.setup-item
