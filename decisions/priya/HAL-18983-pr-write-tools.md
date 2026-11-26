# Decision: the PR tools test also expects write_pr

- Approval: Liam reviews the Agent tools plugin's new PR write tool and signs this note as the CTO
- Kind: internal
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:S7kPCBPvqO9ALnVEnuLYOZB9ZX+Z6GTS2jcphQSU5jwp0I4o19IUDZ25ETVD+p8ml3RChdwqNf5TD9dq1T5JAQ==

Track B of the token plan (HAL-18938) adds the tool `write_pr` to the
Agent tools plugin, declared in the manifest right after `rebase_pr`. The
`paperclip.pr-tools` test compares the whole list of declared tools, so it
now lists `write_pr` too. Nothing else it checks changes. The manifest's
capabilities stay as they were; the one new thing the install needs is the
PR write credential the board approved on 26 Nov (`pull_requests: write` on
halonic-com/halonic only), set in the new `prWriteToken` setting. The
`paperclip.pr-watcher-plugin` test lists every secret setting, so it now
lists `prWriteToken` too.

## Covers

- tooling/paperclip/src/plugin/tools.test.ts
- tooling/paperclip/src/plugin/worker.test.ts
