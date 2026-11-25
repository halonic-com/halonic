# cli.commands.deploy.plan

- Status: active
- Since: unreleased
- Source: HAL-18016; deploy flow revision 5 on HAL-6687 (2.7, 2.11), approved by the board on HAL-6814; words check on HAL-18036

The `halonic deploy <deployment> --plan` command shall run the same gate as `cli.commands.deploy.run` on the workspace's last commit, then show the summary of deploy flow 2.7, every file the deploy would upload, and "Nothing changed on Cloudflare. Run without --plan to deploy.". It shall change nothing on the host and ask nothing. With `--exit-code` it shall exit 1 when the deploy would change something and 0 when it wouldn't; `--exit-code` without `--plan` shall be wrong usage. `halonic deploy --help` shall list `--plan` and `--exit-code` in the deploy's usage, next to the `status` subcommand.

## Examples

- Given `web` on Cloudflare, nothing live yet, and a workspace whose provider `claude` sends `anthropic-key` to Anthropic,
  when `halonic deploy web --plan` runs,
  then it prints "Deploy Acme to Cloudflare?", the rows "Account     sam@example.com's Account", "Creates     the Worker acme, the D1 database acme-data, the R2 bucket acme-blobs" and "Reaches     api.anthropic.com, with anthropic-key", each file, and "Nothing changed on Cloudflare. Run without --plan to deploy.", and the target's `deploy` isn't called.
- Given the same with `--exit-code`,
  when it runs,
  then it exits 1.
- Given `halonic deploy web --exit-code` without `--plan`,
  when it runs,
  then it fails with "--exit-code works only with --plan." and exit 2.
