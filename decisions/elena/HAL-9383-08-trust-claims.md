# Decision: the trust check claims only what is true about plugin text and secrets

- Approval: Mara's claims check on HAL-9383 (items 4 to 6), small wording fixes the team decides; Liam signs this note with the pull request
- Kind: user-visible
- Task: HAL-9383

## What changes

`plugins.plugin-trust-check`: two lines change, and one claim gets a test.

- The In Studio line said "Text from the plugin is shown as plain text." A plugin's answer can use basic Markdown (bold, lists, web links), so it now says "Text from the plugin never becomes page code; at most it shows basic formatting and web links, each with its address." Links show the address after them, and nothing a plugin writes becomes markup (`ui/plugin-result.tsx`).
- "its answers are treated as outside text" is now "its answers aren't trusted as instructions", and the change rows say "untrusted answers" instead of "outside text". Both say what the engine does with an untrusted tool result.
- "The plugin's code never sees it." stays. The plugin's code sends a placement by the secret's name, and the kit adds the value; the runner tests now cover header, bearer and form-field placements, and the sign-in's bearer.

## Why

The first two lines promised more, or used words people don't know. The third claim is the strongest one in the dialog, so it needs a test over every way a secret is placed.

## Covers

- plugins.plugin-trust-check
