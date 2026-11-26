# Decision: the Build chat gate counts the secrets a connector points at

- Approval: HAL-18400 (filed from Liam's review of #6025 on HAL-18268). Liam approves this note in review of this PR, with Julian's security OK on the same task.
- Kind: internal

The named-only gate of the Build chat counted a permission sheet's secrets
but not the workspace secrets a connector file points at through `secret`,
`integration.secrets` or `stdio.secretEnv`. So the model could write a
connector that hands an MCP server or a local integration a key the person
never brought up. The requirement now says a connector's secrets are those
references, each name once, and counts them as a sheet's: at most one new
per sign-in the person named, no more in all than the file has now or than
those sign-ins, and an edit keeps only what the file on disk points at. It
only refuses more; nothing it allowed for a sheet changes.

## Covers

- assistant.build.named-hosts-secrets
