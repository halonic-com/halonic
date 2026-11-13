# workspace.trust-section

- Status: active
- Since: 0.1.0
- Source: states-flow-map 2.7 P4 to P6 and P9 to P11 (HAL-5878), flow-workspace 6 and 6.1, microcopy 4.5; HAL-1291

The workspace page's **Trust** section shall say where the workspace stands. A trusted workspace shall show a tick and "Trusted on *3 Nov 2026*" with the secondary button **Remove trust**. A workspace not trusted yet shall show the dashed ring, "Not trusted yet. Halonic won't start programs or call real models from this workspace." and the primary button **Review**. A workspace that changed since the person trusted it shall show "Changed since you trusted it on *3 Nov*." and **Review changes**. Both buttons shall open the same trust check as the header badge. Before the first check the section shall show no status. **Remove trust** shall open "Remove trust from *Acme*?" with **Cancel** focused and **Remove trust** in danger. Confirming shall delete the person's trust, close the dialog, say "Removed trust from *Acme*" in a toast and put focus on **Review**, where the button was. When removing fails, the dialog shall stay open and say "Couldn't remove trust from *Acme*: *reason*." The first sentence of the dialog about running connectors and routine runs is left out until the Studio can count them.

## Examples

- Given a trusted workspace,
  then the section says "Trusted on 3 Nov 2026" and offers **Remove trust**, not **Review**.
- Given the person confirms **Remove trust** and it works,
  then the toast says "Removed trust from Acme" and **Review** has focus.
- Given removing fails because the disk is full,
  then the dialog stays open and says "Couldn't remove trust from Acme: the disk is full."
