# studio.installer-licence-page

- Status: active
- Since: unreleased
- Source: HAL-12506 (board decision on HAL-8157, option A: Microsoft's "Distributable Code" terms for the `vcruntime140.dll` the installer ships)

When the Windows installer runs with its pages for a first install, or to install a newer version over an older one, it shall show the licence terms in `windows/licence.txt` before its install page, and shall install only after the person presses **I Agree**. The terms shall cover the Microsoft Visual C++ runtime the installer ships. Running the same version again, and passive, update and silent installs, shall not show the page.

## Examples

- Given the Windows installer config,
  when the bundler reads it,
  then `bundle.licenseFile` is `windows/licence.txt`, and that file names `vcruntime140.dll` and Microsoft's terms.
- Given the installer template,
  when it is built without a licence file,
  then the build stops with an error instead of an installer without the page.
- Given the installer template,
  when it lists its pages,
  then the licence page comes after the reinstall page and before the install page, and its skip function stops it for run again, passive and update installs.
- Given the installer job in CI,
  when it walks the installer's pages,
  then it waits for **I Agree**, saves a picture of the page and presses it before **Install**.
