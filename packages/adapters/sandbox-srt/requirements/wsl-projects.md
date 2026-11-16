# sandbox-srt.wsl-projects

- Status: active
- Since: 0.1.0
- Source: HAL-5402 (project location in Halonic's WSL distro, design in HAL-3779 section 5.1)

The sandbox-srt adapter shall give a project in Halonic's WSL distro the Linux path its `projects` folder in the `halonic` user's home when it lives in the distro and `/mnt/halonic/<name>` when it's on the Windows drive, and shall give each Linux path in the distro its Windows path on the distro's WSL share, for "Open in Explorer" and "Open in VS Code". It shall refuse a project name that isn't one plain folder name, so a name can't reach out of `projects` or `/mnt/halonic`.

## Examples

- Given the project `acme` in the distro,
  when its folder is asked for,
  then it is `acme` in that `projects` folder, and its Windows path is the same folder on the distro's WSL share (`halonic`, then `home`, `halonic`, `projects`, `acme`).
- Given the project `acme` on the Windows drive,
  when its folder is asked for,
  then it is `/mnt/halonic/acme`.
- Given the name `../x`, `a/b`, `..`, an empty name or a name starting with `-`,
  when a folder is asked for,
  then it throws.
