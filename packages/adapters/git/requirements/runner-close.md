# git.runner-close

- Status: active
- Since: 0.1.0
- Source: HAL-2669 (review of #765), HAL-4428 (review of #1395)

When the git adapter's runner is closed, it shall remove the empty hooks folder it made for itself, keep a hooks folder its caller gave it, and refuse every later call with an error that says to create a new runner. Closing it again shall do nothing more. When creating a runner fails after it made its own hooks folder, it shall remove that folder before it reports the failure.

## Examples

- Given a runner that made its own hooks folder,
  when it is closed,
  then the folder is gone and a later call rejects.
- Given a runner that was given a hooks folder,
  when it is closed,
  then the folder is still there.
- Given a git program that creating a runner refuses,
  when the runner made its own hooks folder,
  then that folder is gone once creating it has failed.
