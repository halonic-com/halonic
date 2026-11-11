# harness-kit.run-folders

- Status: active
- Since: 0.1.0
- Source: HAL-5675, from the security review of HAL-4790 (HAL-5590)

When the engine asks for a harness call's sandbox profile, the harness kit shall keep the run's own folders in Halonic's data folder apart, so that a host mistake opens no more of the data folder than the run's own: the temp folder and the settings folder shall each be below a top-level folder of the data folder, never one of those folders itself, and the temp folder, the settings folder and the run's proposal folder shall neither be, hold nor be inside one another. The builder shall refuse a profile that breaks this, and say which folders are at fault.

## Examples

- Given a temp folder that is a top-level folder of the data folder, such as `tmp`,
  when a profile is built,
  then it is refused.
- Given a settings folder that is the temp folder,
  when a profile is built,
  then it is refused.
- Given a temp folder that holds the run's proposal folder,
  when a profile is built,
  then it is refused.
