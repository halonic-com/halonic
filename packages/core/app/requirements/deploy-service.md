# app.deploy-service

- Status: active
- Since: unreleased
- Source: the `halonic deploy` build plan on HAL-6702, approved by Liam on HAL-13512; deploy flow revision 4 on HAL-6687 (2.1, 3.7, 4, C1, C4), approved by the board on HAL-6814

The deploy app service shall hold the rules of `halonic deploy` between the command and the deploy target, and get the target only through an injected loader, never by importing a target package. With no deployment named, it shall choose the workspace's one Cloudflare deployment, report none when there is none, and refuse several as wrong usage; a named `local` deployment shall be refused with the `halonic serve` pointer. It shall check the deploy lock before it asks anything, and stop with `conflict`, who holds it, since when and the local time its lock runs out. Without a terminal it shall ask nothing and list every missing answer, with the flag that gives it, in one `invalid_input` error. It shall ask `Deploy? [y/N]`, unless `--yes` answers it, only when something is new against what's live: the first deploy, something to create, a change that deletes data, a new address or a secret sent to another address; never for a new commit alone. It shall not require the workspace to be trusted.

## Examples

- Given deployments `home` (local) and `web` (Cloudflare),
  when none is named,
  then `web` is chosen.
- Given two Cloudflare deployments, `web` and `staging`,
  when none is named,
  then it fails with "Acme has 2 deployments on Cloudflare: web, staging. Say which one.".
- Given a `local` deployment `home`,
  when `halonic deploy home` runs,
  then it fails with "home runs on your own machine, not on Cloudflare." and the fix "Start it with halonic serve home.".
- Given a deploy of `web` by sam@example.com that started at 14:32 and whose lock runs out at 14:42,
  when another deploy starts at 14:34 in a terminal,
  then it fails with `conflict`, "started 2 min ago" and "run again after 14:42", and asks nothing.
- Given a first deploy without a terminal, without `--yes` and without the secret `anthropic-key`,
  when it runs,
  then it fails with "2 answers are missing" and the fix "Pass them: --yes for the deploy question, and anthropic-key on --secrets-stdin.".
- Given a live version that reaches the same addresses with the same secrets and nothing to create,
  when a new commit is deployed,
  then `Deploy? [y/N]` isn't asked.
- Given a live version,
  when the workspace now reaches a new address, or sends a secret to another address,
  then `Deploy? [y/N]` is asked.
- Given a workspace nobody trusted,
  when it is deployed,
  then the deploy goes ahead without asking for trust.
