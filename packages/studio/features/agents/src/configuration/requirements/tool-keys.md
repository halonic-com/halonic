# agents.configuration.tool-keys

- Status: draft
- Since: unreleased
- Source: HAL-18932 (T6 gap 7, HAL-17270); flow-agents 5.2 (Tools: "The secret shows by its name"; "Change *Acme mail token*? Every agent that uses it switches to the new key right away." · **Change key** · **Cancel**); save model 8.2; microcopy "Changing a key that's set"; the line's words are a team decision under HAL-2282 (HAL-18932)

Where an agent uses a connector whose file names a secret, the Tools page shall show under the Connectors list the line "*Acme mail* uses the key *acme-mail-token*." with the secret's name and never its value, and, where keys can be changed here and the key store doesn't say there is no key under that name, **Change key**, described by its line. **Change key** shall ask "Change *acme-mail-token*?" with "Every agent that uses it switches to the new key right away.", a masked **API key** field, **Change key** and **Cancel**, and store the typed key under the secret's name only when **Change key** in the question is pressed with a key typed; it shall then say "Saved key for *Acme mail*". An empty field shall show "Paste the key first." and store nothing, and a failed store shall keep the question open with "Couldn't save the key: *reason*. Your old key is still in use.", without the key in it.

## Examples

- Given the agent uses the connector "Acme mail", whose file names the secret `acme-mail-token`, and a key is stored under it, then Connectors says "Acme mail uses the key acme-mail-token. Change key", and nothing on the page holds the key.
- Given that line, when the person presses **Change key**, then the question "Change acme-mail-token?" says "Every agent that uses it switches to the new key right away." and nothing is stored yet; when they type `acme-test-key-2` and press **Change key**, then the store holds `acme-test-key-2` under `acme-mail-token` and the page says "Saved key for Acme mail".
- Given the question, when the person presses **Cancel**, then the old key stays.
- Given the store refuses with "The keychain is locked.", then the question stays open with "Couldn't save the key: The keychain is locked. Your old key is still in use."
- Given no key is stored under `acme-mail-token`, or the app can't change keys, then the line has no **Change key**.
