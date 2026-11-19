# Decision: "No connection was made." shows for srt runs, and the phone lines name the agent's file

- Approval: Elena decided this on HAL-12658, the follow-up to the studio-claims check (C52, claim 4.8) on HAL-12648; it makes the words match the code, a team decision with no board card (HAL-2282 rule, Chief on HAL-12643)
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:yjrqmPYSDRh3PU0BjhKWNpf9M6hPrKvF1LzK9zNG32FcRkICfGaQWynjvGP2EfSq9YLrACvZCWwZqiZHoc1xBA==
- Task: HAL-12658

## What changes

- The Blocked sites hint and the failed banner say "No connection was made." for a step whose every `sandbox.opened` names an `os` sandbox. Today that is srt, and srt's blocked-site suites prove no connection is made on Linux, macOS and Windows (HAL-6219). A `vm` or `remote` sandbox, an unreadable event, a step without the sandbox and an old run still leave it out.
- The phone lines say "Fix this on your computer, in *Writer*'s file." and "Change this on your computer, in *Writer*'s file." instead of naming "*Writer* › Harness › Allowed sites" and "*Writer* › Harness".
- Both requirements say the desktop actions, "Open *Writer*'s allowed sites" and "Change in *Writer*'s settings", aren't here yet.

## Why

The sentence was never shown, because the run page always passed `false`. The requirement already allowed it where proven, and since HAL-6219 it is proven for srt on every system. The run log names only the sandbox's strength, not srt or MXC. MXC is `os` too, but nothing turns it on (HAL-2546), so for now `os` means srt. The MXC README now says what has to happen before MXC is turned on.

The phone lines named places that don't exist: the agent's Harness page only picks the program, and has no Allowed sites field and no sandbox setting. `allowedSites` and `workingFolder` are in the agent's file, which the agent page's Open as file opens.

The desktop actions stay unwired rather than deleted: wiring them to the Harness page would open a page without the allowed sites, a new wrong claim, and deleting them takes part of an approved screen out, which is the board's call. Whether to build an Allowed sites field on the Harness page goes to the board through Chief. The components keep the callbacks, tested, for when it exists.

## Covers

- runs.run-view.blocked-sites
- runs.run-view.sandbox-panel
