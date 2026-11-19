# sandbox-srt.wsl-start-checks

- Status: active
- Since: unreleased
- Source: HAL-12445 (W6 of the HAL-5407 review, finding F3 of HAL-12434)

When the sandbox-srt adapter runs in Halonic's WSL distro (it was given shared folders), every check that passes shall report the residual `docker-desktop-visible` when Docker's socket (`/var/run/docker.sock`) or an entry whose name starts with `docker-desktop` in `/mnt/wsl` is there. It shall look with the file system only, follow no link and start no program. A missing `/mnt/wsl` shall count as no Docker Desktop; a `/mnt/wsl` that can't be read otherwise, or a machine that fails to answer, shall count as Docker Desktop, because the answer errs on reporting a limit. Outside the distro it shall not look. The residual is a warning and shall never make the check fail.

## Examples

- Given the sandbox in the distro and Docker Desktop started after the setup, with a `docker-desktop` folder in `/mnt/wsl`,
  when it is checked,
  then it can start, with the residual `docker-desktop-visible`.
- Given the sandbox in the distro with `/var/run/docker.sock` there, also as a link to nowhere,
  when it is checked,
  then the residual is `docker-desktop-visible`.
- Given the sandbox in the distro with neither the socket nor a `docker-desktop*` entry,
  when it is checked,
  then it can start with no residuals.
- Given the sandbox on Linux outside the distro (no shared folders) with Docker's socket there,
  when it is checked,
  then there is no `docker-desktop-visible`, because only the distro is meant to be cut off from Docker.
- Given the sandbox in the distro whose machine can't say,
  when it is checked,
  then the residual is `docker-desktop-visible`.
