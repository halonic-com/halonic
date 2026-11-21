# library.connector-secrets

- Status: active
- Since: unreleased
- Source: HAL-14995 (Liam's decision, option 1, building on the plugin secret fields in Settings)

Where Studio is given a store for connectors' secrets (the desktop app, which gives the keychain the agent host's connector reads them from, through `workspaceSecretWriter`), the Library feature shall show, on the page of a connector that starts a program and declares secrets, a **Secrets** section with one field per secret, labelled with its name. Each field shall show "Set", "Not set" (amber) or "Can't check" when the store can't say, the line "Stored in your secrets on this computer. Only the program <connector> starts gets it.", and a password entry that is empty and never shows what is stored. Leaving the entry with text in it shall save that text under the secret's name, empty the entry and show "Set"; once one is set the entry shall say "Type a new value to replace it" and **Remove** shall delete it. The page shall learn only whether a secret is set, never its value. When saving or removing fails, the field shall say "Couldn't save the secret." or "Couldn't remove the secret." with the reason, which never holds the value, and, for a secret that was set, "The one you saved before is still in use." With the section on the page, the line for a secret that isn't set or that the server refused shall end "Set it under Secrets, then try again." ("Set the right one" when the connector has several), and **Try again** shall list the tools with the saved secret, with no restart. Without a store (in a browser or `serve`), and on a phone, the page shall show no Secrets section and the line shall keep "Studio can't set a connector's secrets yet."

## Examples

- Given the connector Notes, whose program needs the secret NOTES_TOKEN, which isn't set,
  when its page opens in the desktop app,
  then the line says "Couldn't list the tools: Notes needs the secret NOTES_TOKEN, which isn't set for Studio. Set it under Secrets, then try again." and the Secrets section shows NOTES_TOKEN as "Not set".
- Given that page,
  when you type a value for NOTES_TOKEN, leave the entry and press **Try again**,
  then NOTES_TOKEN shows "Set", the entry is empty, and the page says how many of Notes's tools are waiting.
- Given NOTES_TOKEN is set,
  when you press **Remove**,
  then it is deleted and shows "Not set".
- Given the keychain is locked,
  when you save NOTES_TOKEN,
  then the field says "Couldn't save the secret. The keychain is locked." and the value is nowhere on the page.
- Given the same connector in a browser,
  when its page opens,
  then there is no Secrets section and the line ends "Studio can't set a connector's secrets yet."
