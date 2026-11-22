# workflows.canvas.drag-to-connect

- Status: active
- Since: unreleased
- Source: HAL-12216 (T7b, arrow editing), HAL-15572 (C595 row 32), HAL-15581 (the port's colour); flow-workflows 4.3 (U66), 4.4; UX checklist 10.9; states C3

When the host can change arrows, the workflows feature shall draw an output port, a ring with a dot, at the middle of the bottom edge of every step card that isn't an end, with the tooltip "Drag to another step to connect". At rest the port is drawn muted; it takes the accent colour under the pointer and while dragging from it. While the person drags from a port, the canvas shall draw a dashed line from the port to the pointer, give every other step a light outline and the step under the pointer a stronger one; the canvas shall not pan. Dropping on another step shall ask the host to add an arrow on done to it, after the step's other arrows, as one change, and announce "Arrow added: <step> to <target>." as the step card's **Add** does: the steps named as their cards name them, followed by "Arrow <n> is never taken: arrow <m> always matches first." when an earlier arrow on done always matches first (C595); dropping on empty canvas, on the step itself, or a cancelled drag shall add nothing. When the host can't change the arrows, a danger toast shall say "Couldn't change step <id>" and why. Where the host can't change arrows, and on a phone, there are no ports. Without a mouse, the step card's **Go to…** and **Add** do the same (`workflows.page.step-arrows`).

## Examples

- Given Support reply, then `start` and `write` have a port and the end step `done` has none.
- Given Support reply, then every port is muted and turns the accent colour under the pointer; while the person drags from `start`'s port, that port is in the accent colour and `write`'s stays muted.
- Given `start`, when the person drags from its port and drops on `done`, then the host adds an arrow from `start` to `done` and "Arrow added: start to done. Arrow 2 is never taken: arrow 1 always matches first." is announced, since `start` already goes to `write` on done without a condition.
- Given Support reply with the titles Start, Write and Done and `start`'s only arrow on a condition, when the person drags from `start`'s port and drops on `done`, then "Arrow added: Start to Done." is announced.
- Given the same titles and `start` with an arrow on a condition and one without, when the person drops from `start` on `done`, then "Arrow added: Start to Done. Arrow 3 is never taken: arrow 2 always matches first." is announced.
- Given a drag from `start`'s port with the pointer over `done`, then `done` has the strong outline, `write` the light one and `start` none, and the dashed line runs to the pointer.
- Given a drag from `start`'s port, when it is dropped on empty canvas or on `start`, then nothing is added and the outlines go.
- Given the canvas at 50 % zoom panned to (100, 40), then a drop at screen point (200, 140) lands on the canvas point (200, 200).
- Given a host that can't change the file, then a drop shows the toast "Couldn't change step start".
- Given a host that can't change arrows, or a phone, then no card has a port.

## Notes

The port is for a pointer only and is hidden from screen readers: the step card's **Go to…** and **Add** are the way to add an arrow with the keyboard. The new arrow shows once the host has written it, like every other change on the canvas, and problems are checked then, never during the drag (flow-workflows 4.4).
