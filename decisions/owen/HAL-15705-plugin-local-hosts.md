# Decision: Studio's trust check lists a plugin's local-tool hosts, as halonic trust does

- Approval: HAL-15705
- Kind: user-visible
- Signature: ed25519:sha256:H_TEiCBwniz-xuAw0H_8Qyq9EdLD-LQUeUHvFk2fKeM:r2H3qdQiNhfCfYDf+bExPv9iVLaQQH96y9oby+dumKU9tfpTDpfvR823Xft90PP0lwgz+CRjEFUUwSZrdIqNCQ==

`studio.trust-review-plugin-hosts` says a plugin connector's row in the
Studio's workspace trust check lists the hosts the plugin reaches "as
`halonic trust` does", but it listed only the hosts the plugin's backend
lists. Since HAL-15094, `halonic trust` takes the format's `pluginHosts`,
which also adds each local tool's `network` sites. So for the same plugin
the Studio's Reaches line named fewer hosts than the CLI, and none at all
for a plugin with only local tools (flow check C618, HAL-15701, item 1).
This is the screen where a person decides to trust the workspace.

What changes:

- The requirement's text says the hosts are the ones `pluginHosts` gives:
  the backend's hosts, then each local tool's `network` sites not listed
  yet. "its backend lists hosts" becomes "may reach hosts".
- Two examples are added: a plugin with only local tools, and one with a
  backend and a local tool. The existing examples stay as they are.

Nothing is removed and no test is weakened.

## Covers

- studio.trust-review-plugin-hosts
