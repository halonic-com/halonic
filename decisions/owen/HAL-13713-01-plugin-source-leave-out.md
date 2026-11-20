# Decision: a plugin's copy leaves out the private home folders the sandbox denies

- Approval: Paperclip task HAL-13713; Liam approves this note in review
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:BHANEdzPOo99J6foXr8tHu3gjsdu073mjwLq+Hv3a0GMdBlZs2obnhT1XmSWMZbS/tXiF4uh14/mKiiA748tCA==

Adding a plugin copied every file in its folder except the private workspace names (`.git`, `.studio`, `.env*`). The sandbox keeps a longer list of private paths away from agents and plugins, and a copy should not hand them back.

- The paths the sandbox denies in a home folder are one list in `@halonicjs/ports` (`ports.denied-home-paths`). The sandbox's profile and `plugin add` both use it, so they can't drift.
- `plugin add` leaves those paths out of what it reads, checks and places, at any depth and for every system's list, because a folder can be copied between systems. They are left out, not refused, as `.env` is.
- The added plugin names what was left out, and the CLI prints one line about it ahead of the trust check. Private workspace names stay unnamed, as before.

## Covers

- app.plugin-add
- cli.commands.plugin.add
