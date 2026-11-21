# workflows.page.menu

- Status: draft
- Since: unreleased
- Source: HAL-12216 (T7b, ⋮ and Delete); UX checklist 10.2 Delete and 10.3 (the header's ⋮); flow-workflows 2.3; microcopy 2 (open tab whose item was deleted), 9.1 Delete and revision 106 L3 (an item-page delete shows only the strip); save model 4.3

Where the host can delete the workflow, the workflows feature shall give the workflow's page a ⋮ button named "More actions for *name*" in its header, or in the phone's top bar where the page is under one, whose menu holds **Delete**. Delete shall move the workflow to the trash at once, with no dialog and no toast, and replace the page with the kit's trash strip that says "This workflow was deleted" and has **Undo** with the focus; when routines or other workflows' steps run the workflow, the strip shall say so in a second line, naming only the parts that apply ("1 routine and 2 workflow steps now show an error until you pick another workflow."), and its first line shall end with a full stop. Undo, or the workspace's own undo, shall bring the page back with its name focused; Undo shall say "Couldn't put *name* back" with the reason in a toast when it can't. A failed delete shall say "Couldn't delete *name*: *reason*." in a toast that stays, with **Try again**. Where the host can't delete, the page shall have no ⋮.

## Examples

- Given "Support reply" is open, then the header has "More actions for Support reply" with Delete.
- Given Delete is chosen, then the page shows "This workflow was deleted" and **Undo**, which has the focus, and no toast.
- Given a routine and two steps of another workflow run it, then the strip says "This workflow was deleted." and "1 routine and 2 workflow steps now show an error until you pick another workflow.".
- Given only one routine runs it, then the second line is "1 routine now shows an error until you pick another workflow.".
- Given **Undo** is pressed, then the page is back and its name has the focus.
- Given the workflow comes back by the workspace's undo instead, then the page is back without the strip.
- Given Undo can't put it back, then a toast says "Couldn't put Support reply back" with the reason.
- Given the delete fails because the file is read-only, then a toast that stays says "Couldn't delete Support reply: The file is read-only." with **Try again**.
- Given the host can't delete, then the header has no ⋮.
