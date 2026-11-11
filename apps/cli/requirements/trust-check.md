# cli.trust-check

- Status: active
- Since: 0.1.0
- Source: HAL-3468, item 4b of the HAL-188 build plan (items 10b and 10c's output); cli-output 3.5 at revision 40 (HAL-3443) and microcopy 4.3 and L70 to L75, revision 85; the Addresses section after Agents is the team's call on HAL-3468, as Studio's Addresses section; local integrations' setting addresses in it are the team's call on HAL-3498; model providers in it are the team's call on HAL-5200

When the workspace isn't trusted, the `halonic` command shall show its trust check as these lines: the heading, the intro and the summary of what it will start, pass, list and allow, leaving out counts of 0; then Programs, Agents and Addresses, each only when it has a row; then `Fingerprint` and the full fingerprint, never shortened. A program whose version isn't pinned shall have the `!` line under it, naming npm or PyPI. An agent's row shall show its id and its harness, then every allowed site, one per line, and its working folder when it isn't `files/agents/<id>`. A local integration that reads an address from a setting shall have a row under Addresses with each setting and its address, one per line, `not set` when it is empty and why when it can't be used; every such setting counts as an address in the summary. A model provider other than the test model shall have a row under Addresses with its `baseUrl`, or its type when the file names none, and the secret it gets; it counts as an address, and its secret as a secret, in the summary. When the workspace changed since it was trusted, the check shall instead start with the changed heading and the summary of what changed, and show only the New and Changed rows, with one Changed row per field of a changed agent and a changed local integration or model provider counted as one changed address; when nothing is new or changed, the summary shall be left out. When the workspace is trusted, it shall show only the ✓ line with the date it was trusted. When the list of trusted workspaces can't be read, the check shall start with its `!` line.

## Examples

- Given Acme with `npx @acme/mail-mcp 2.3.1` getting the secret GMAIL_TOKEN, `uvx notes-server`, and the agent coder in Claude Code allowing pypi.org and registry.npmjs.org with the working folder src/app,
  when its check is made,
  then it reads as cli-output 3.5's example, from "Trust check for Acme (./acme)" to the full fingerprint under `Fingerprint`.
- Given Acme trusted on 3 Nov, with notes-mcp added, mail-mcp changed, and coder moved to Codex, allowing registry.npmjs.org instead of pypi.org, in src/app,
  when its check is made,
  then it starts "What changed in Acme since you trusted it on 3 Nov" and "1 new program, 1 changed program and 1 changed agent.", and coder has three Changed rows.
- Given Acme trusted on 3 Nov and unchanged,
  when its check is made,
  then it is the one line "✓ Acme is already trusted on this computer. Nothing changed since 3 Nov.".
- Given Acme trusted on 3 Nov, with only the local integration my-crm's CRM_URL now holding https://crm.example.com/,
  when its check is made,
  then it starts "What changed in Acme since you trusted it on 3 Nov" and "1 changed address since you trusted this on 3 Nov.", and my-crm's row under Addresses is tagged Changed.
- Given Acme with the provider claude of type anthropic getting the secret ANTHROPIC_KEY and no `baseUrl`, and the provider ollama at http://localhost:11434/v1,
  when its check is made,
  then it says "Will pass 1 secret and list 2 addresses." and lists both under Addresses: claude as `anthropic · gets the secret ANTHROPIC_KEY`, ollama with its address.
- Given Acme trusted on 3 Nov, with only the provider claude's `baseUrl` changed,
  when its check is made,
  then it says "1 changed address since you trusted this on 3 Nov.", and claude's row under Addresses shows the new address and is tagged Changed.
