# Decision: the bubblewrap fence job allows user namespaces with an AppArmor profile, not the sysctl

- Task: HAL-6030
- Approval: the task asks for a checked AppArmor profile for the sandbox guide; Liam reviews the pull request and signs this note
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:xBb8SiRqKj/7fGY72HikDSMSjIDJsy2qucUN4WKbhy/skSUJOMit4pxbSJMEGemSlJkosa+w4UdOsSw8QBQvAw==

## What changes

The "Sandbox fence (bubblewrap)" job in `.github/workflows/ci.yml` no longer turns off
`kernel.apparmor_restrict_unprivileged_userns`. The new step "Allow user namespaces for
bubblewrap (AppArmor profile)" first checks that the restriction is on (`= 1`), writes
`/etc/apparmor.d/bwrap` with a profile for `/usr/bin/bwrap` that adds `userns,`, loads it with
`apparmor_parser --replace` and checks that `bwrap --unshare-user` starts. The fence tests then run
with the restriction still on.

## Why

On Ubuntu 24.04, `doctor` and the sandbox guide point users to an AppArmor rule for bubblewrap,
and the guide is getting the exact profile (HAL-6007, HAL-5959 finding 5). We tell users not to
use the sysctl on a computer they keep, so CI should prove the fence with the same profile we
give them. On run 43082385899 the job confirmed the restriction was on, loaded the profile, and
all 39 fence tests passed.

## Tests

No test was skipped or changed. The job fails early if the runner image stops restricting user
namespaces (the check would then prove nothing) or if `bwrap` can't create a user namespace with
the profile.

## Covers

- .github/
