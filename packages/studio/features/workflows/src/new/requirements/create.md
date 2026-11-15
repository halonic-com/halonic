# workflows.new.create

- Status: draft
- Since: 0.1.0
- Source: HAL-9747 (T7 PR 2); flow-workflows 2.2; microcopy 9.2; G5 parts 11 and 12; kit T7-F19 to F21

When the user chooses **New workflow**, the workflows feature shall ask for a name, and for a hub when there is more than one, in a "New workflow" dialog that shows the file the workflow will be written to, create the workflow through the host, close the dialog and open the workflow in its tab, and, while the name is empty, not create anything and say "Give it a name." under the field. When the app gives the dialog a way to start the Assistant (it doesn't until the Assistant has landed), the dialog shall also show **Describe it to the Assistant instead ›**, which hands the name typed so far to that way; otherwise it shall show no such link.

## Examples

- Given one hub "acme", then the dialog has **Name**, focused, and no Hub field, the line "Folder: hubs/acme/workflows/", and the note "It starts with a step “start” that leads to “done”.".
- Given the hubs "acme" and "beta", then a **Hub** field lists both, and picking "beta" changes the line to "Folder: hubs/beta/workflows/".
- Given the name "Invoice intake", then the line reads "File: hubs/acme/workflows/invoice-intake.workflow.yaml".
- Given acme already has a workflow `invoice-intake`, then the line reads "File: hubs/acme/workflows/invoice-intake-2.workflow.yaml".
- Given the user presses **Create** with the name "Invoice intake", then the host creates it in the picked hub and its tab opens.
- Given the name is empty, then **Create** shows "Give it a name.", focuses Name and creates nothing.
- Given the host can't write the file because "the disk is full", then the dialog says "Couldn't create the workflow: the disk is full." and **Create** tries again.
- Given the app gives no way to start the Assistant, then the dialog has no **Describe it to the Assistant instead ›**; given it does and the name "Invoice intake" is typed, then pressing it hands over "Invoice intake".
