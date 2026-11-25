# cli.commands.deploy.run

- Status: active
- Since: unreleased
- Source: HAL-18019 (PR 17 of the HAL-6702 build plan); deploy flow revision 5 on HAL-6687 (2.1, 2.7 to 2.10, 3.6, 3.7 and 4), approved by the board on HAL-6814; words check C787 on HAL-17198

The `halonic deploy <deployment>` command shall deploy the workspace's last commit to the deployment through the deploy app service, or to the workspace's one Cloudflare deployment when none is named, taking the files from that commit only. It shall work out where the deployment lives through `app.deploy-account` before it deploys, and its deploy target shall reach only Cloudflare's API and that deployment's own workers.dev address. When the service asks `Deploy? [y/N]`, it shall first show the summary of deploy flow 2.7 with the rows it can fill (Account, Address when the host gives it, Files with the commit and its subject, and Creates when something is created), and an answer of no shall change nothing, say "Nothing changed on Cloudflare." and exit 1; `--yes` shall answer that question and nothing else. Without a terminal it shall ask nothing and pass on the service's one error that names every missing answer. A workspace outside a git repository, or one with no commit, shall be refused with "<workspace> isn't in a git repository, and a deploy takes its files from a commit." and the commands that make one, with exit 2. A deploy that went live shall end with the lines of `cli.deploy-output`; a self-test that failed shall say "version <n> failed its self-test." with which version still serves, or that nothing is live yet on a first deploy, and exit 1. A stop by Ctrl C, SIGTERM or a closed terminal shall print the lines of deploy flow 3.7 in place of the ✕ failure, never "interrupted" or "job", and exit 130, 143 or 129.

## Examples

- Given `web` live as version 1, and a deploy that uploads version 2 and makes it live,
  when `halonic deploy web` runs,
  then it prints "✓ Uploaded version 2.", "✓ Self-test of version 2 passed.", "✓ Acme is live on web: https://acme.sam-example.workers.dev" and exits 0.
- Given a first deploy in a terminal,
  when `halonic deploy web` runs,
  then it shows "Deploy Acme to Cloudflare?", the Account, Address, Files and Creates rows, and asks "Deploy? [y/N]".
- Given a first deploy without a terminal and without `--yes`,
  when `halonic deploy web` runs,
  then it fails with "1 answer is missing, and there's no terminal to ask you." and "Pass it: --yes for the deploy question.", and deploys nothing.
- Given a workspace that isn't in a git repository,
  when `halonic deploy web` runs,
  then it fails with "✕ Couldn't deploy web: Acme isn't in a git repository, and a deploy takes its files from a commit." and exit 2.
- Given a deploy uploading version 2 while version 1 is live,
  when Ctrl C stops it,
  then it prints "Stopped after uploading version 2. Version 1 is still live." and "  Run halonic deploy web again to finish. It picks up what's already there.", and exits 130 (143 for SIGTERM, 129 for a closed terminal).
