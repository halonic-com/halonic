# runs.run-view.blocked-sites

- Status: active
- Since: unreleased
- Source: HAL-1708 (board, HAL-1601 proposal 2); sandbox-screens (HAL-1747) 2; microcopy 23.2; ux-checklists-sandbox (HAL-1833) Part 2; Julian's conditions (HAL-1673) and the hint's wording (HAL-6208); `events.blocked-sites`, `std.site-name`

The run view shall name each site a step's sandbox refused once, with its tries, from the step's `blockedSites`:

- under the step's meta line, a row in warning tone, never danger: "Blocked 3 sites", "Blocked 1 site" for one;
- in the step's open entry, a Blocked sites panel: one row per site, most tries first, then A to Z, with "1 try", "12 tries" or, over 999, "999+ tries" at the right; at most 5 rows, then "and 7 more sites", which isn't a link; a hint that says why, how to allow a site and that the agent can then send that site anything it can read; and one action, "Open *Writer*'s allowed sites", which opens the agent's allowed sites and never adds a site itself, and shows only where the page can open them. On a phone the action is the line "Fix this on your computer, in *Writer*'s file.", with no link;
- in the run log view, "Blocked: registry.npmjs.org (12 tries)" once per site per step, at most 20, then "and 3 more sites";
- under the step's meta line, the "Blocked 3 sites" line is a child row in the timeline with the warning icon, which opens the step's entry;
- in the failed banner of a run stopped by blocked sites (a failure with no specific reason, in a step the sandbox refused sites in), the several-sites sentence with the site with the most tries as its example, or for one site "The sandbox stopped Reporter from reaching api.example.net, which isn't in its allowed sites.", and **See the step**, which opens the failed step's entry.

A site's name shall be plain text, never a link, with the part before its registrable domain in `fg-muted` and the domain in `fg` weight 500, capped and escaped by `siteName`.

The hint and the banner shall say "No connection was made." only where that has been proven: for a step whose every `sandbox.opened` event is readable and names an `os` sandbox, which today is srt, whose blocked-site suites prove it on Linux, macOS and Windows (HAL-6219). Not for a step that ran in a `vm` or `remote` sandbox, without the sandbox, or with no `sandbox.opened`. They shall never say that nothing reached the site.

Every sentence shall come from the blocked sites words table by key. The words are placeholders until the board approves the sandbox screens (HAL-1784).

Limits, for the docs: only traffic through the sandbox's proxy has a site name, and a block without a name gets no row in 0.1 (P8). MXC is an `os` sandbox with no blocked-site suite yet; nothing turns it on (HAL-2546), and before something does, the log has to tell it apart from srt or MXC has to pass the suite.

Not here yet: the desktop action, because the agent page has no Allowed sites field to open (HAL-12658). Until it has, the panel has no action on the desktop, and the hint says where to add a site.

## Examples

- Given step Install of agent Writer was refused registry.npmjs.org 12 times and objects.githubusercontent.com once,
  when the person opens the run,
  then the step shows "Blocked 2 sites", and its entry lists registry.**npmjs.org** "12 tries" above objects.**githubusercontent.com** "1 try".
- Given a step refused 8 sites,
  when the person opens its entry,
  then it lists 5 sites and "and 3 more sites", which isn't a link.
- Given the run log of that step,
  when the person shows the run log,
  then it reads "Blocked: registry.npmjs.org (12 tries)" once, however often the step retried.
- Given a site `registry.npmjs.org.evil.example`,
  when it is listed,
  then only `evil.example` is bold, and the name is not a link.
- Given step Install ran in an `os` sandbox and was refused registry.npmjs.org,
  when its entry is open,
  then the hint says "No connection was made."
- Given step Install ran in a `vm` sandbox, or its log has no `sandbox.opened`,
  when its entry is open,
  then the hint doesn't say "No connection was made."
