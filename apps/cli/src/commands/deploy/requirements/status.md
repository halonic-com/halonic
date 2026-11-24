# cli.commands.deploy.status

- Status: active
- Since: unreleased
- Source: HAL-6702; deploy flow revision 5 on HAL-6687 (5.1, 3.7, 3.8), approved by the board on HAL-6814; `app.deploy-account`

The `halonic deploy status <deployment>` command shall show what's live on a deployment from `deployments.yaml` through the deploy app service's `status`, and change nothing on the host, with exit 0. It shall print a heading with the deployment, its host and its account's name, then one row each, lined up, for the address, the live version with its commit and since when, the live Halonic against this computer's, the health with the last routine tick, the runs counted by state, and the version a rollback goes back to with the command that does it; it shall leave out a row the host can't fill. When the host can't count the runs, the runs row shall point at the address. When nothing is live it shall say so with the command that deploys it, and show no rows about a version. When a deploy holds the lock, it shall add a `!` line with who started it, when, and the time its lock runs out; with no lock, when the last deploy stopped without finishing, it shall add a `!` line with the step it stopped in. With `--json` it shall add what the host said and this computer's Halonic as `thisHalonic`. Without a deployment's name it shall be wrong usage, and a `local` deployment shall be refused with the `halonic serve` pointer. A deploy target reached through it shall reach only Cloudflare's API and workers.dev addresses, over https, and the token shall come from `HALONIC_CLOUDFLARE_API_TOKEN`.

## Examples

- Given `web` live as version 2 from commit 8d1a04b, with version 1 before it,
  when `halonic deploy status web` runs,
  then it prints "web · Cloudflare · sam@example.com's Account", the Address, Live, Halonic, Health, Runs and Before rows, and "Before    version 1 · commit 3f9c2e1   halonic deploy rollback web".
- Given a host that can't count the runs,
  when `halonic deploy status web` runs,
  then the runs row is "open the address to see them".
- Given a live Halonic older than this computer's,
  when `halonic deploy status web` runs,
  then the Halonic row ends "Update web: halonic deploy web".
- Given a deploy of `web` by sam@example.com that started 2 minutes ago and holds the lock until 14:42,
  when `halonic deploy status web` runs,
  then it adds "! A deploy of web by sam@example.com started 2 min ago and hasn't finished. If it was stopped, deploy again after 14:42, when its lock runs out." and no line about an unfinished deploy.
- Given no lock and a last deploy that stopped while creating what it needs,
  when `halonic deploy status web` runs,
  then it adds "! The last deploy of web stopped while creating the Worker, the database and the bucket. The next deploy finishes it: halonic deploy web".
- Given a `local` deployment `home`,
  when `halonic deploy status home` runs,
  then it fails with "home runs on your own machine, not on Cloudflare." and exit 2.
