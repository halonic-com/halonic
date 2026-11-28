# studio-click-test.quick-ask-look

- Status: active
- Since: unreleased
- Source: Nora's review of #6888 (HAL-20826): `quick-ask.box-look` is something a user sees, so a click step checks it in the running app

When the Start menu shortcuts have opened their windows, the click test shall start Halonic again with `--app ask` and switch to the window labelled `ask`, failing as `NO_WINDOW` when none shows. In it, the step shall wait up to 30 s for the agent chip, which is a skeleton until the agents arrive, then fail as `NO_QUICK_ASK_PART`, naming the part, when the box, its kit message box (`rounded-composer`), the agent chip straight in that box's row, or Ask inside it isn't on screen; and as `QUICK_ASK_LOOK`, naming each value that differs, when the box doesn't have 8px corners and the dialogs' shadow (`shadow-3`'s `0px 24px 48px -12px` layer in its `box-shadow`, which the dark ring alone doesn't give), or its message box doesn't have 26px corners. It shall then press Esc, so the box hides, and go back to Studio's window.

## Examples

- Given the box with 8px corners and the dialogs' shadow, and a message box with 26px corners holding the chip and Ask,
  then the step passes, having started `Halonic --app ask` and pressed Esc.
- Given a box with 0px corners and no shadow,
  then the step fails as `QUICK_ASK_LOOK`, naming `box border-top-left-radius 0px, not 8px; box has no dialog shadow`.
- Given a box whose `box-shadow` is only the dark ring,
  then the step fails as `QUICK_ASK_LOOK`, saying the box has no dialog shadow.
- Given a message box with 8px corners,
  then the step fails as `QUICK_ASK_LOOK`, naming `messageBox border-top-left-radius 8px, not 26px`.
- Given the chip's skeleton when the box first shows, and the chip during the first wait,
  then the step passes.
- Given the chip outside the message box,
  then the step fails as `NO_QUICK_ASK_PART`, saying the box has no chip.
- Given no window labelled `ask`,
  then the step fails as `NO_WINDOW`.
