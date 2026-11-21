# studio.workspace-trust-review

- Status: active
- Since: unreleased
- Source: mockup-trust rev 2 (HAL-1018), states-flow-map 2.5 and 2.6 (HAL-5878), the CLI's trust check (cli-output 3.5); HAL-1291, HAL-8559; a local integration's secret picks are HAL-14734, in Mara's words on HAL-14737; picks joined as the CLI joins them, and one row for an integration that reads no address from a setting, are HAL-15261, from flow check 38's C552 finding 3 on HAL-15218, a team decision on the task

The desktop app shall build the trust check from the same check the CLI uses, in the CLI's words. For a workspace nobody has trusted it shall give the title "Trust *name*?", a summary that names what the workspace will start, pass, list and allow (counts of 0 left out), and Programs, Agents and Addresses sections that have rows, each with its count. For a workspace whose record no longer matches it shall give "*name* changed since you trusted it on *date*", a summary of what is new and changed, the New and Changed rows and how many items are unchanged. A connector that runs a local integration shall be listed under Addresses with its folder, `integrations/<folder>`, and a `Gets secrets` line naming the workspace secret each secret of the integration's sheet gets, as `my-notes-key as notes-key` (just the name when both are the same), joined as the CLI joins them, never a value. A local integration shall have a row of its own under Addresses only when its sheet reads an address from a setting, as in the CLI, so an integration that reads none is listed once, by its connector. A program whose version isn't pinned shall carry its warning and be named for the person to confirm. A trusted workspace shall have nothing to review. Saving a person's trust shall save exactly the fingerprint that was shown, check again, and say why when it saved nothing.

## Examples

- Given a workspace with one connector that runs `npx` and nobody has trusted it,
  then the check reads "Trust Acme?", "Will start 1 program.", **Programs (1)**, and its warning "Can download new code from npm when it starts: version not pinned."
- Given the person trusts the fingerprint shown,
  then the workspace is trusted and has nothing to review.
- Given the person trusts a fingerprint that is no longer the workspace's,
  then nothing is saved and the answer says the workspace changed.
- Given a trusted connector's program later resolves to another path,
  then the check reads "Acme changed since you trusted it on 3 Nov" and "1 changed program since you trusted this on 3 Nov."
- Given a connector that runs the local integration in `integrations/notes` and gives the sheet's secret notes-key the workspace secret my-notes-key,
  then its row under Addresses reads `integrations/notes` with the line **Gets secrets** "my-notes-key as notes-key".
- Given that connector also gives the sheet's secret sync-key the workspace secret sync-key, and the integration's sheet reads no address from a setting,
  then the summary says "Will pass 2 secrets and list 1 address.", **Addresses (1)** has only the connector's row, and its line reads **Gets secrets** "my-notes-key as notes-key and sync-key".
