# shell.palette-groups

- Status: active
- Since: 0.1.0
- Source: HAL-1290 (T2); design-search 2 and 5 (HAL-176); component specs 24.3 (HAL-175); UX checklist part 1, 1.7 (HAL-1323); C3 (HAL-991); `search.files.plain-text-is-literal` (req-search, HAL-110)

While nothing is typed in Ctrl K, the palette shall show Open tabs, the places the window's tabs show in strip order, then Recent, the places opened lately that no tab shows, latest first. When words are typed, the palette shall show "Agents, workflows and more", the open and recent places and the items from every search provider whose name contains the words, then Actions, the commands whose title contains them. The palette shall read the words as plain text, never as a pattern, and ignore case. In each group, the whole name shall come first, then names that start with the words, then names with a word that starts with them, then names that only contain them; among equal matches, the more recently opened place shall come first. Each group shall show at most 5 rows and a place or item at most once, and a row that a window tab shows shall say so. When words are typed and no place or item matches, the palette shall say that nothing matches. A source that isn't built yet shall add no group, never an error or a stand-in. A search provider that fails shall not hide what the other providers found.

## Examples

- Given tabs on Home and "Support reply", and "Refund policy" opened lately,
  when the user opens Ctrl K,
  then Open tabs lists Home and "Support reply", each saying "Switch to tab", and Recent lists "Refund policy".
- Given providers find "Late refunds", "Refund checker" and "Refund",
  when the user types `refund`,
  then the order is "Refund", "Refund checker", "Late refunds".
- Given agent "Billing (EU)",
  when the user types `(EU)`,
  then "Billing (EU)" is listed, and typing `workspace.yaml` doesn't find "workspaceXyaml".
- Given only the shell is built,
  when the user types `refnud`,
  then the palette says that nothing matches and shows no other group.
- Given the agents provider fails and the workflows provider finds "Support reply",
  when the user types `sup`,
  then "Support reply" is listed.
