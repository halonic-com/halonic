# workflows.page.step-arrows

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b, arrow editing); UX checklist 10.8 (Arrows in), 10.9 (the section, Move up and Move down); flow-workflows 4.3, 5.3; microcopy 9.4, 19.7; a11y 7.2

When a step that isn't an end has its docked card and the host can change arrows, the workflows feature shall show the section "Arrows (first match wins)": the step's arrows numbered in the file's order, each as "<n> → <step>" then "on <event>" (or "after <time>" for a timer) and "if <condition>" when it has one, with the run's data named without its braces and without `context.`; each row shall have a ⋮ named "More actions for arrow <n>" with **Move up** (unavailable on the first) and **Move down** (unavailable on the last); under them **Go to…**, a picker of the workflow's steps, and **Add**. Move up and Move down shall move the arrow one place as one change, naming where the arrow goes so an out-of-date card can't move another one, and do nothing while a move is still being written; they shall keep focus on the moved arrow's ⋮ in its new place and announce "Arrow <n> is now <place>." Add shall add an arrow on done to the step picked, after the others, as one change, announce "Arrow added: <step> to <target>." and clear the picker; with no step picked it shall put focus on **Go to…** and add nothing. When the host can't change the arrows, a danger toast shall say "Couldn't change step <id>" and why, and nothing is announced. Every step's card shall list **Arrows in**, "From <step>" once for each other step with an arrow to it, each opening that step's card with focus on its title.

## Examples

- Given `sort`, then its rows read "1 → approve on done if category = refund" and "2 → write on done"; `approve` reads "1 → write on approved" and "2 → done after 2d".
- Given the end step `done`, or a host that can't change arrows, then the card has no arrows section.
- Given `sort`, when the user picks ⋮ › Move up on arrow 2, then `write` is first, "Arrow 2 is now first." is announced and focus is on "More actions for arrow 1".
- Given `sort`, then arrow 1's ⋮ offers Move up unavailable and Move down, and arrow 2's Move up and Move down unavailable.
- Given Move up on arrow 2 is picked twice before the first move is written, then the arrow moves once.
- Given `sort`, when the user picks `done` in Go to… and presses Add, then "3 → done on done" is added and "Arrow added: sort to done." is announced; pressing Add with nothing picked puts focus on Go to….
- Given a host that can't change the file, then Add shows the toast "Couldn't change step sort" and the rows stay.
- Given `write`, then Arrows in lists "From sort" and "From approve"; pressing "From approve" opens "approve" with focus on its title.
- Given `sort` has two arrows to `write` and `write` one to itself, then Arrows in on `write` still lists "From sort" once and not "From write".
