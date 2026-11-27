# inbox.project-line

- Status: active
- Since: unreleased
- Source: the board's approval of the HAL-19192 sketches (question 4, projects that fit; sketches A and C), task HAL-19492

The Inbox's project filter shall take one line: "All", then as many projects as fit, each with its dot and its name cut with "…", most waiting items first, then "+N" for the N choices that don't fit. "+N" shall open a menu of every choice, "All projects", each project and "No project", with how many items wait in each and a check on the picked one. While a project or "No project" is picked, it shall stand alone after "All", pressed and with a ×, the other choices shall move to "+N", and pressing it again shall show all projects.

## Examples

- Given items waiting in Studio app (2), Engine (1), Halonic marketing website (1) and none (1), and room for one project,
  when the Inbox shows its filter,
  then the line reads "All 5", "Studio app" and "+3".
- Given that filter,
  when the person opens "+3",
  then it lists All projects 5, Studio app 2, Engine 1, Halonic marketing website 1 and No project 1, with the check on All projects.
- Given that filter,
  when the person picks Halonic marketing website from the menu,
  then the line reads "All", "Halonic marketing website" pressed with a ×, and "+3", and only its item is listed.
- Given Studio app picked,
  when the person presses it again,
  then all five items are listed and "All 5" is pressed.
