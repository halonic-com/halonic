# studio.src-tauri.crates.keep-awake.keep-awake

- Status: draft
- Since: unreleased
- Source: HAL-17641 (phase 2 G5); section 2.4 of the HAL-17511 architecture note; the board's ★P4 on HAL-17544

The keep-awake rules shall hold the system's "don't sleep" lock only while the setting "Keep this computer awake while it's plugged in" is on, remote is on and the computer runs on mains power. They shall release it when the computer runs on battery or the power source is unknown, and when either switch turns off. Both switches shall start off, so a fresh install holds nothing. If the lock can't be held, they shall say so and try again on the next check. The lock shall stop sleep only (a logind inhibitor on Linux, an `IOPMAssertion` through `caffeinate` on macOS, `SetThreadExecutionState` on Windows), and shall end with Halonic, even when Halonic doesn't quit cleanly.

## Examples

- Given a fresh install,
  when the rules check,
  then no lock is held.
- Given the setting and remote on and the computer plugged in,
  when it is unplugged,
  then the lock is released, and held again when it is plugged back in.
- Given the lock held,
  when remote is turned off,
  then the lock is released.
