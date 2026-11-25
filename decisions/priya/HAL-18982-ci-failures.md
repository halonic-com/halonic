# Decision: the PR tools test also expects ci_failures

- Approval: Liam reviews the Agent tools plugin's new read tool and signs this note as the CTO
- Kind: internal

Track B of the token plan (HAL-18938) adds the read tool `ci_failures` to
the Agent tools plugin, declared in the manifest right after `pr_status`.
The `paperclip.pr-tools` test compares the whole list of declared tools,
so it now lists `ci_failures` too. Nothing else it checks changes, and the
manifest's capabilities stay as they were: the tool uses the GET-only
GitHub reader and token `pr_status` already uses.

## Covers

- tooling/paperclip/src/plugin/tools.test.ts
