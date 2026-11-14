# Decision: the Assistant's key line names the secret and shows no dead links; Model hides until a provider is set

- Task: HAL-9385 (design check B14 and B18)
- Approval: Sofia's design check on HAL-9316 and the wording of microcopy revision 99; a small wording and UI detail on an approved screen, decided by the team (board, HAL-2282)
- Kind: user-visible
- Signature: pending

## What changes

`settings.ai-agent-key-line` and `settings.ai-agent-section` change:

- The Key line names the secret in code style: "Add a provider that uses `anthropic-api-key` to Acme ›". The dots ● and ○ are hidden from screen readers.
- The links "Replace it on the provider page ›", "Add it on the provider page ›" and "Add a provider…" opened the workspace page's Models section, which has no provider page or key field. The window no longer passes those two targets, so the links are hidden until the provider pages exist. The line then reads "● Key set", "○ No key" and, with no provider using the name, "○ No key. Add a provider that uses `anthropic-api-key` to Acme."
- With the provider Not set up, Model is hidden (the spec hides Model, Key and Disclosures).
- When the host settings can't be read, **Try again** reads them again and, if that fails too, the line adds the reason.

Tests changed: `assistant-key-line.test.tsx` expects the secret name where it expected "the secret name" (one assertion), and the new tests cover the hidden dots, the code style, the missing links and the hidden Model. `assistant-section.test.tsx` gains the reason and Model assertions. No test was weakened or skipped.

## Why

Design check B14 and B18: the links led to a page that has no key field, the line didn't name the secret, and a screen reader read the dots out.

## Covers

- settings.ai-agent-key-line
- settings.ai-agent-section
