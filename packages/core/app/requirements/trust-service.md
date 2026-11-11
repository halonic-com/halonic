# app.trust-service

- Status: active
- Since: 0.1.0
- Source: HAL-188 build items 6, 7, 9a and 10c (HAL-65 decisions 1 and 9, HAL-571: only a person adds to a trust record, HAL-1921 review note 2, HAL-2038: a second question for programs that aren't pinned; HAL-5421: content that can't be trusted)

The app shall decide whether a workspace is trusted by building its trust content, always with the absolute path each program command resolves to, the workspace's agents, its local integrations with their settings and its model providers, and comparing its fingerprint with the trust record for the workspace's location. It shall hand out a trust grant only when the record's fingerprint matches the current one. Without a record the workspace is new; with a record whose fingerprint differs it has changed, and the app shall give what changed and when it was trusted. When the change only removes whole connectors, harness agents, local integrations or model providers and the record's own content still gives its fingerprint, the app shall shrink the record to the current content without asking, keeping the date it was granted, and shall give the ids of the connectors, agents, integrations and providers it removed. When the record can't be read, the workspace isn't trusted and the app shall give the store's error. When the trust content refuses something, such as a connector whose URL has user info or a provider whose `baseUrl` does, the workspace shall be refused whatever its record says, with the id and reason of each refused entry and without a fingerprint, a grant or the refused address. A record whose content lists refused entries shall never be shrunk.

The app shall save a record only when a person trusts the workspace and the fingerprint they were shown is exactly the current one, never a part of it, and shall otherwise save nothing and give the current fingerprint. It has no way to update a record without that fingerprint, so saving a workspace in the Studio never trusts it.

With every check, the app shall list the connectors whose program is a package runner, found as `app.package-runner-launch` finds them, as not pinned, so the prompt can ask a second question for them. The list isn't part of the trust content or the fingerprint.

## Examples

- Given no trust record for `/workspaces/acme`,
  when it is checked,
  then it is new, with its content and fingerprint, and there is no grant.
- Given a person trusted `/workspaces/acme` with the fingerprint they were shown,
  when it is checked,
  then it is trusted, with a grant for that location and fingerprint.
- Given a trusted workspace whose connector gains `NODE_OPTIONS`,
  when it is checked,
  then it has changed, lists the connector as changed and gives the date it was trusted, and there is no grant.
- Given a trusted workspace with the connectors `files` and `mail`, when `mail` is deleted,
  then it is trusted without asking, the record now holds only `files` and keeps its grant date, and `mail` is given as removed.
- Given a trusted workspace with the connector `files` and the Claude Code agent `coder`, when `coder` is deleted,
  then it is trusted without asking, the record no longer holds `coder` and keeps its grant date, and `coder` is given as a removed agent.
- Given a trust record whose content was edited by hand so it no longer gives its fingerprint, when a connector is deleted,
  then it has changed, and the record isn't shrunk.
- Given a store whose `get` throws,
  when the workspace is checked,
  then it is unreadable, with the store's error, and there is no grant.
- Given the shown fingerprint is the first 12 characters of the current one, or one from before a connector changed,
  when a person trusts the workspace,
  then nothing is saved and the current fingerprint is given back.
- Given the same connector and two machines where its command resolves to different paths,
  when each is checked,
  then the fingerprints differ.
- Given the connectors `mail` started with `npx -y @acme/mail-mcp`, `crm` started with `cmd /c uvx crm-mcp`, and `files` started with `node files.js`,
  when the workspace is checked,
  then `crm` and `mail` are listed as not pinned, `files` isn't, and the trust content doesn't mention it.
- Given a connector whose URL is `https://ops:pw@mail.example.com/mcp`, with or without a trust record,
  when the workspace is checked,
  then it is refused, with the connector's id and "the URL has user info", and there is no fingerprint, no grant and no password.
