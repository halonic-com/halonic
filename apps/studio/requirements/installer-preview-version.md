# studio.installer-preview-version

- Status: active
- Since: unreleased
- Source: HAL-18308

When the Studio preview workflow builds the Windows installer, it shall give the build the version after the release version's patch, as a pre-release numbered by the workflow's run (`<major>.<minor>.<patch + 1>-preview.<run>`), so that by semver order a later preview is newer than an earlier one and than the release version, and older than the next patch release. The workflow shall install an installer with the release version first, update it silently with the preview's installer, and fail unless Installed apps then shows the preview's version and Halonic starts. A release build keeps the version in `tauri.conf.json`.

## Examples

- Given the release version 0.1.0,
  when the preview workflow's run 41 and then its run 42 build the installer,
  then they are 0.1.1-preview.41 and 0.1.1-preview.42, and each is newer than 0.1.0 and older than 0.1.1.
- Given the release version 0.1.0 and the run number 0 or `abc`, or the release version 0.1.0-beta.1,
  when the version is chosen,
  then it fails and names the value it refused.
- Given a Windows runner with the release version's installer installed,
  when the preview's installer runs silently,
  then Installed apps shows the preview's version, not the release version.
