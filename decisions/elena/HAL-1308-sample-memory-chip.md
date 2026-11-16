# Decision: the Acme sample is remembered, tagged in Recent, and gets a header chip and Fresh copy

- Approval: the Sample tag, header chip and Fresh copy are in the board-approved first-run flow (flow-first-run rev 15, HAL-663, sections 2.1 and 3.1–3.2); Liam approved the T15 plan that builds them on HAL-10917 and approves this note on HAL-10964
- Kind: user-visible

The window remembers on this device which Recent entries were created as the sample. Try the Acme sample then reopens
the existing copy and writes nothing. A Recent row of a sample ends in a **Sample** tag. A trusted sample shows the
header chip "Sample · test model" with a menu: the cost line, **New workspace…** and **Fresh copy of the sample**.
The edits to both requirements match the approved plan.

## Covers

- workspace.try-sample
- shell.welcome-sample
