# studio.workspace-trust-review

- Status: active
- Since: 0.1.0
- Source: mockup-trust rev 2 (HAL-1018), states-flow-map 2.5 and 2.6 (HAL-5878), the CLI's trust check (cli-output 3.5); HAL-1291, HAL-8559

The desktop app shall build the trust check from the same check the CLI uses, in the CLI's words. For a workspace nobody has trusted it shall give the title "Trust *name*?", a summary that names what the workspace will start, pass, list and allow (counts of 0 left out), and Programs, Agents and Addresses sections that have rows, each with its count. For a workspace whose record no longer matches it shall give "*name* changed since you trusted it on *date*", a summary of what is new and changed, the New and Changed rows and how many items are unchanged. A program whose version isn't pinned shall carry its warning and be named for the person to confirm. A trusted workspace shall have nothing to review. Saving a person's trust shall save exactly the fingerprint that was shown, check again, and say why when it saved nothing.

## Examples

- Given a workspace with one connector that runs `npx` and nobody has trusted it,
  then the check reads "Trust Acme?", "Will start 1 program.", **Programs (1)**, and its warning "Can download new code from npm when it starts: version not pinned."
- Given the person trusts the fingerprint shown,
  then the workspace is trusted and has nothing to review.
- Given the person trusts a fingerprint that is no longer the workspace's,
  then nothing is saved and the answer says the workspace changed.
- Given a trusted connector's program later resolves to another path,
  then the check reads "Acme changed since you trusted it on 3 Nov" and "1 changed program since you trusted this on 3 Nov."
