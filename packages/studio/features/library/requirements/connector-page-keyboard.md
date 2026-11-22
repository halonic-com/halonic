# library.connector-page-keyboard

- Status: active
- Since: unreleased
- Source: HAL-15641 (flow check C605, points 5 and 6a, HAL-15625)

When the person presses **Review** on the "Couldn't list the tools: this workspace isn't trusted yet, so nothing was started." line (`library.listed-tools-waiting`) of a connector's page, the page shall open the workspace's trust check over itself, as the Run card's **Review** does, and not the workspace page. Once the person trusts the workspace there, the page shall list the tools again as **Try again** does, and focus shall move to the line that replaces it (`library.connector-secrets-focus`); on **Not now** the line shall stay as it was and nothing shall be listed. In the page's **Secrets** section (`library.connector-secrets`), Enter in a secret's entry shall save what was typed, as leaving the entry does, and focus shall stay in the entry, which then says "Set". When Tab leaves an entry that said "Not set" and the value is saved, focus shall move to that secret's **Remove**, which only shows once the value is saved; Shift+Tab, and leaving an entry that was already "Set", shall leave focus where it went.

## Examples

- Given a workspace that isn't trusted yet and a connector with one tool to review,
  when you press **Review** on the connector's page and trust the workspace in the trust check,
  then the tools are listed again and focus is on "1 tool is off until you review it".
- Given the same page,
  when you press **Review** and then **Not now**,
  then the line still says the workspace isn't trusted yet.
- Given NOTES_TOKEN is "Not set",
  when you type its value and press Enter,
  then it is saved, the field says "Set" and focus is still in NOTES_TOKEN's entry.
- Given NOTES_TOKEN is "Not set",
  when you type its value and press Tab,
  then it is saved and focus is on NOTES_TOKEN's **Remove**.
