# inbox.home-next-step

- Status: active
- Since: unreleased
- Source: HAL-19397; first-run walk-through of the 0.2.0 build (HAL-19383, gap G5), decided by the team with the designer

When nothing waits, a served Studio's Needs you shall say under "Nothing is waiting for you." the line "Runs that need your yes show up here." When the computer serves the sample workspace, it shall add "Start one on your computer: Run the Support reply workflow in Studio." The desktop app's Needs you shall keep its one line.

## Examples

- Given a served Studio on a workspace that isn't the sample, with nothing waiting,
  when Home opens,
  then Needs you says "Nothing is waiting for you." and "Runs that need your yes show up here.", and no line on how to start one.
- Given a served Studio on the sample, with nothing waiting,
  when Home opens,
  then Needs you also says "Start one on your computer: Run the Support reply workflow in Studio."
- Given the desktop app with nothing waiting,
  when Home opens,
  then Needs you says only "Nothing is waiting for you."
