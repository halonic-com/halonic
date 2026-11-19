# Decision: the Tools page says what the hub can use

- Task: HAL-12870
- Approval: https://paperclip.halonic.com/HAL/issues/HAL-12870 (found in Mara's claims check C88, HAL-12844; small wording of an approved screen, team decision, HAL-2282 rule; Sofia took Mara's wording on the task; Liam's code review)
- Kind: user-visible

## What changes

On the agent's Configuration › Tools page (microcopy 8.5):

- In place of the Add button, when the hub can use none of the kind: "No skills this hub can use yet.",
  "No knowledge this hub can use yet.", "No connectors this hub can use yet." They used to read "No skills yet."
  and so on.
- Under a list, for an item the agent's file names that the hub can't use: "This hub can't use a skill called *id*."
  (or "knowledge source", "connector"). It used to read "There's no skill called *id*."

**Open Library ›** after the empty line is unchanged, and no state, chip or button changes. The requirement's
rule and two examples change to match, and say the missing-item line also covers items the hub's `uses`
leaves out. The tests' expected text changes with it. No test was weakened or skipped.

## Why

The Add picker lists only what the hub may use: its own Library items and the shared ones its `uses` allows.
So "There's no skill called refunds." was false for a shared skill that exists but `uses` leaves out, and
"No skills yet." sat right above **Open Library ›**, which then listed shared skills. The new lines are true in
both cases, stay short and need no new state. The knowledge line keeps the page's noun "knowledge", so the
three lines stay parallel with their list headings.

## Covers

- agents.configuration.tools
