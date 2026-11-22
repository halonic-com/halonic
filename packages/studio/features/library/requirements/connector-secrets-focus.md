# library.connector-secrets-focus

- Status: active
- Since: unreleased
- Source: HAL-15245 (design check C551, points S2, S3 and S6, within Liam's option 1 of HAL-14995)

The **Secrets** section on a connector's page (`library.connector-secrets`) shall show nothing, no state and no entry, until the store has said for each of its secrets whether it is set, so a stored secret never shows "Not set" first. When **Remove** deletes a secret, focus shall move to that secret's entry, which then says "Not set"; when removing fails, focus shall stay on **Remove** with the reason under the field. When **Try again** on the "Couldn't list the tools" line lists the tools again, the line and its **Try again** shall stay, the button busy (a spinner and `aria-busy`), until the listing answers; then focus shall move to the line that replaces it ("N tools are waiting for your approval", from which Tab goes on to **Review tools**), or to the new "Couldn't list the tools" line when the listing fails again.

## Examples

- Given NOTES_TOKEN is stored and the keychain takes a while to answer,
  when the connector's page opens,
  then the Secrets section shows nothing until the keychain answers, then shows NOTES_TOKEN as "Set", never "Not set" first.
- Given NOTES_TOKEN is set,
  when you press **Remove** and it is deleted,
  then focus is on NOTES_TOKEN's entry and the field says "Not set".
- Given the keychain is locked,
  when you press **Remove**,
  then focus stays on **Remove** and the field says why.
- Given the line "Couldn't list the tools: Notes needs the secret NOTES_TOKEN…" and NOTES_TOKEN now set,
  when you press **Try again**,
  then the button stays, busy, while the tools are listed, and then focus is on "1 tool is waiting for your approval".
