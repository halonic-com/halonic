# runs.run-notification-prefs

- Status: active
- Since: unreleased
- Source: HAL-18846 (follow-up from the review of halonic#6181), design revision 3 on HAL-18594 (Runs: Notifications), approved by the board on 25 Nov 14:48 UTC

The Studio shall keep the three switches of `runs.run-notifications`, "When a run fails", "When a run I started finishes" and "When any run finishes", as host settings for every workspace on the computer, never in a workspace. A switch never saved, or saved as something that isn't on or off, shall read as its default: on, on and off.

## Examples

- Given nothing is saved, when the switches are read,
  then "When a run fails" and "When a run I started finishes" are on and "When any run finishes" is off.
- Given "When any run finishes" is saved as "yes", when the switches are read,
  then it reads off.
