# sandbox-mxc.sdk-download

- Status: active
- Since: 0.2.0
- Source: HAL-7607, HAL-188, HAL-7606 (board: "yes, on demand"), HAL-7603

The sandbox-mxc adapter shall not carry MXC's SDK as a dependency. It shall download the SDK (`@microsoft/mxc-sdk`) and the two packages it loads at once (`koffi`, `semver`) and the compiled part of koffi for the computer's processor from the npm registry into a folder under Halonic's data folder, each at one exact pinned version. It shall check every tarball against the integrity pinned in the repository before unpacking anything, and refuse the whole download when one doesn't match, when one can't be fetched, or when an archive holds a file outside its package folder. A download shall replace the SDK folder only when every package is in, and shall do nothing when that folder already holds exactly the pinned list. The loader shall import the SDK from that folder only when the download is finished, and otherwise fail closed with a sentence saying the SDK needs to be downloaded.

## Examples

- Given a registry that serves the three pinned tarballs,
  when the download runs,
  then the three packages are unpacked into the SDK folder, and a second run fetches nothing.
- Given a tarball whose bytes don't match its pinned integrity,
  when the download runs,
  then it is refused and no SDK folder is left behind.
- Given no network,
  when the download runs,
  then it fails, and an SDK folder from an earlier download is untouched.
- Given an archive with a file named `../outside`,
  when it is unpacked,
  then the download is refused.
- Given a SDK folder that was never downloaded,
  when the loader imports the SDK,
  then it refuses and says the SDK needs to be downloaded.
- Given a SDK folder inside a skill's `scripts` folder,
  when the loader imports the SDK,
  then it refuses: Halonic never runs a file under a skill's scripts folder.
