# sandbox-mxc.sdk-install

- Status: active
- Since: 0.1.0
- Source: HAL-7607, HAL-7606 (board: the SDK is downloaded on demand, not listed as a dependency), HAL-7603

The sandbox-mxc adapter shall be able to fetch MXC's SDK (`@microsoft/mxc-sdk`) and the two packages it needs on Windows (`koffi`, `semver`, and the native koffi build for this processor) from the npm registry, each pinned to an exact version and tarball hash kept in our repo. It shall fetch only over https from `registry.npmjs.org` and follow no redirect. It shall check every tarball's SHA-512 before it unpacks any byte, and refuse a tarball whose entries have an absolute path, a `..` part, a link or any kind other than file or folder. It shall unpack into a temporary folder, move that folder into place in one step and write its verified marker last, so a half-finished install never counts as installed. It shall fetch nothing when the verified files are already there. It shall say `offline` when the registry can't be reached and `rejected` when the bytes aren't the pinned ones or aren't safe.

## Examples

- Given a registry that answers every pinned tarball,
  when the SDK is installed twice,
  then the first run downloads and the second run downloads nothing.
- Given a tarball whose bytes differ from the pinned hash,
  when the SDK is installed,
  then it is rejected and nothing is on the disk.
- Given a download that is cut off,
  when the SDK is installed,
  then it is rejected and nothing is on the disk.
- Given no network,
  when the SDK is installed,
  then the answer is `offline` and nothing is on the disk.
- Given a tarball with an entry that climbs out of its folder, and the matching hash,
  when the SDK is installed,
  then it is rejected and nothing is on the disk.
