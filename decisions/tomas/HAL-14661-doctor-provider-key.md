# Decision: doctor matches run's provider key, and checks a provider an agent names directly

- Task: HAL-14661
- Approval: Liam decided on HAL-14661 (https://paperclip.halonic.com/HAL/issues/HAL-14661) that all three findings from Maya's runs (C443 L1–L3 on HAL-14653) get fixed in one pull request. A team decision with no board card (HAL-2282 rule): no new wording.
- Kind: user-visible

## What changes

`halonic doctor`'s Harnesses line no longer asks about the own sign-in of a harness agent whose
runs get a provider key Halonic keeps. Doctor decides it with `run`'s own key services
(`ProviderKeyServices.accessFor`, the decision `servicesFor` makes, now one method), with the
person's placement choice in each hub the agent can run in, the workspace's trust and the keys'
allowed addresses. When doctor can't tell, the line stays as before.

The Models line now also checks the key of a provider an agent names directly, such as
`claude/claude-sonnet-5-5`, when no alias uses that provider, in today's words.

The requirements `app.doctor-agent-sign-in`, `cli.doctor-report` and `cli.doctor-workspace` say
this, with one example each. No test was weakened or skipped.

## Why

Maya's real runs on HAL-14653: doctor told a sandboxed agent to sign in that `run` gives a key,
and said nothing about the missing key of a provider named directly.

## Covers

- app.doctor-agent-sign-in
- cli.doctor-report
- cli.doctor-workspace
