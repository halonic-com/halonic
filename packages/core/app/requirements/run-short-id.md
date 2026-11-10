# app.run-short-id

- Status: active
- Since: 0.1.0
- Source: HAL-2821; M1 in the runs check on HAL-2812; cli-output revision 31, section 3.4 (HAL-1981)

The run history shall find a run, real or test, by its full id or by its short id, the last 6 characters of its id, typed in any case. A run's short id shall be those 6 characters as stored, never uppercased. When several runs end in the 6 characters typed, it shall say so rather than pick one. For an id that matches no run, it shall find nothing.

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
