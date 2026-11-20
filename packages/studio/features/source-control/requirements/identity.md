# source-control.identity

- Status: active
- Since: unreleased
- Source: HAL-1302 (T9); ux-checklists-t8-t9 (HAL-1360) part 2, 2.6; kit T9-F21; microcopy 16 and Sofia's wording on HAL-1566; HAL-10679 (the shell's narrow `config`)

When the person presses Create version and the workspace's history has no name or no email for versions (its own setting, or the person's own on this computer), the source control feature shall first open a dialog "Who should versions be from?" with the sentence "Your name shows next to each version you create, for you and your team.", the fields Name and Email with the hint "Saved with each version. Use a no-reply address if you prefer.", Cancel and Save and continue. Save and continue shall stay pressable. An empty Name shall say "Enter your name." under Name; an empty Email, or one that isn't an address, shall say "Enter an email address, like sam@acme.example." under Email; neither reaches git, and focus goes to the first field that is wrong. A valid pair shall be saved in the workspace's own history settings through the shell's `config user.name` and `config user.email`, close the dialog and open Create version with what the person had chosen. When git refuses, the dialog shall stay open with "Couldn't save this." and the reason, and keep what was typed. Cancel and Escape shall close Create version as well and save nothing. When both are set, Create version shall open at once, with no dialog.

Not covered yet: changing the name later (Settings).

## Examples

- Given a repository whose history has no name or email,
  when the person presses Create version,
  then "Who should versions be from?" opens instead, and Create version follows once they are saved.
- Given a name and email are already set on this computer,
  when the person presses Create version,
  then Create version opens at once.
- Given the person presses Save and continue with Name empty,
  then "Enter your name." shows under Name, focus is in Name and nothing is saved.
- Given the person types `sam` as the email,
  then Email says "Enter an email address, like sam@acme.example."
- Given the person types a name and `sam@acme.example`,
  then both are saved in the workspace's history settings and Create version opens.
- Given the person presses Cancel,
  then both dialogs are gone and nothing is saved.
