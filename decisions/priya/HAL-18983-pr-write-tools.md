# Decision: the PR tools test also expects write_pr

- Approval: Liam reviews the Agent tools plugin's new PR write tool and signs this note as the CTO
- Kind: internal

Track B of the token plan (HAL-18938) adds the tool `write_pr` to the
Agent tools plugin, declared in the manifest right after `rebase_pr`. The
`paperclip.pr-tools` test compares the whole list of declared tools, so it
now lists `write_pr` too. Nothing else it checks changes. The manifest's
capabilities stay as they were; the one new thing the install needs is the
PR write credential the board approved on 26 Nov (`pull_requests: write` on
halonic-com/halonic only), set in the new `prWriteToken` setting.

## Covers

- tooling/paperclip/src/plugin/tools.test.ts
