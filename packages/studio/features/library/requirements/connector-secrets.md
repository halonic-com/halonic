# library.connector-secrets

- Status: active
- Since: unreleased
- Source: HAL-14995 (Liam's decision, option 1, building on the plugin secret fields in Settings); HAL-19445 (local integrations)

Where Studio is given a store for connectors' secrets (the desktop app, which gives the keychain the agent host's connector reads them from, through `workspaceSecretWriter`), the Library feature shall show, on the page of a connector that starts a program and declares secrets, or of a local integration's connector whose file names workspace secrets (its own `secret` and the ones it picks for its sheet), a **Secrets** section with one field per secret, labelled with its name. Each field shall show "Set", "Not set" (amber) or "Can't check" when the store can't say, the line "Kept in your system keychain, never in files. <connector> gives it to the program it starts. Studio uses this one; halonic secret set keeps a separate one for the command line.", and a password entry that is empty and never shows what is stored. Leaving the entry with text in it shall save that text under the secret's name, empty the entry and show "Set"; once one is set the entry shall say "Type a new value to replace it" and **Remove** shall delete it. The page shall learn only whether a secret is set, never its value, and shall list each secret once: the "How it connects" section shall then show no "Secrets" row. When saving or removing fails, the field shall say "Couldn't save the secret: <reason>." or "Couldn't remove the secret: <reason>.", with the reason after the colon in lower case unless it starts with a name, which never holds the value, and, for a secret that was set, "The one you saved before is still in use.", and the entry shall be empty. When the connector's file names a secret that belongs to Halonic or to a plugin, saving it shall ask no store, empty the entry and say "Couldn't save the secret: a workspace can't pick a secret that belongs to Halonic. Give it another name in the connector's file." ("…to a plugin." for a plugin's). With the section on the page, the line for a secret that isn't set or that the server refused shall end "Set it under Secrets, then try again." ("Set the right one" when the connector has several), and **Try again** shall list the tools with the saved secret, with no restart. Without a store (in a browser or `serve`), and on a phone, the page shall show no Secrets section and the line shall keep "Studio can't set a connector's secrets yet."

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
  then the field says "Couldn't save the secret: the keychain is locked.", the entry is empty and the value is nowhere on the page.
- Given a connector whose file names the secret serve-password, which belongs to Halonic,
  when you type a value for it and leave the entry,
  then nothing is saved, the entry is empty and the field says "Couldn't save the secret: a workspace can't pick a secret that belongs to Halonic. Give it another name in the connector's file."
- Given the same connector in a browser,
  when its page opens,
  then there is no Secrets section and the line ends "Studio can't set a connector's secrets yet."
