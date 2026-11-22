# app.run-short-id

- Status: active
- Since: 0.1.0
- Source: HAL-2821; M1 in the runs check on HAL-2812; cli-output revision 31, section 3.4 (HAL-1981); a child run's short id by Sofia, a team decision under HAL-2282 (HAL-15744, option 2)

The short id of a run shall be the last 6 characters of its id when the id has no `.`. When it has one, as a child run's id has (its parent's id, then `.` and the step, then `.` and the item for a for-each step), the short id shall be the last 6 characters of the part before the first `.`, followed by everything from that `.` on, so it starts with the short id of the top-level run that started it and is never cut. A short id shall be as stored, never uppercased. The run history shall find a run, real or test, by its full id, typed in any case. It shall also find a run by a short id, typed in any case: 6 characters, matching each run whose id ends in them, or text with a `.` whose part before the first `.` has 6 characters, matching each run whose id ends in exactly that text. When several runs match, it shall say so rather than pick one. For an id that matches no run, it shall find nothing.

## Examples

- Given a run `run_mfx3k2a1_a1b2c3d4`,
  when `b2c3d4`, `B2C3D4` or `RUN_MFX3K2A1_A1B2C3D4` is looked up,
  then that run is found.
- Given runs `run_aaaa_01b2c3d4` and `run_bbbb_99b2c3d4`,
  when `B2C3D4` is looked up,
  then several runs are found, neither is picked, and the short id given back is `b2c3d4`, as stored.
- Given the same two runs,
  when `run_aaaa_01b2c3d4` is looked up,
  then that run is found.
- Given a run `run_mfx3k2a1_a1b2c3d4`,
  when `a1b2c3d4`, the last 8 characters, is looked up,
  then nothing is found: a short id has 6 characters.
- Given runs `run_mfx3k2a1_a17k2m9p`, `run_mfx3k2a1_a17k2m9p.3.1`, `run_mfx3k2a1_a17k2m9p.4` and `run_mfx3k2a1_a17k2m9p.3.1.2.0`,
  when their short ids are worked out,
  then they are `7k2m9p`, `7k2m9p.3.1`, `7k2m9p.4` and `7k2m9p.3.1.2.0`.
- Given the same runs,
  when `7K2M9P.3.1` is looked up,
  then `run_mfx3k2a1_a17k2m9p.3.1` is found, and `7k2m9p.3` finds nothing.
- Given the same runs,
  when `9p.3.1`, the 6-character short id the child had before, is looked up,
  then `run_mfx3k2a1_a17k2m9p.3.1` is still found.
