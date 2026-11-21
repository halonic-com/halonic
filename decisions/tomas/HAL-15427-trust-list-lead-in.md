# Decision: trust --list and --remove say what they were doing when they fail

- Approval: HAL-15427 (Nina's C572 check on HAL-15420, assigned to Tomas to fix; small wording decided by the team under HAL-2282)
- Kind: user-visible
- Task: HAL-15427

`halonic trust --list` and `halonic trust --remove` led every error with "Couldn't trust this
folder", though neither trusts anything. Every other command names its own action, such as
"Couldn't list the plugins". The first example of `cli.profile-home` wrote that line down, so it
now says the new lead-in, and a second example covers `--remove` and plain `trust`. The reason and
the fix after the colon don't change, and nothing a run may do changes.

## Covers

- cli.profile-home

## What changes

- `cli.profile-home`: `trust --list` with `HALONIC_HOME="~/.halonic"` says "✕ Couldn't list
  what's trusted on this computer:" before the same reason. A new example: `trust --dir acme
  --remove` says "✕ Couldn't remove the trust for acme:", and `trust --dir acme` still says
  "✕ Couldn't trust acme:".
