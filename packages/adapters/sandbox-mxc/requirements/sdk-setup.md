# sandbox-mxc.sdk-setup

- Status: active
- Since: 0.1.0
- Source: HAL-7607, HAL-7606 (board: the SDK is downloaded on demand), HAL-7603

The sandbox-mxc adapter shall load MXC's SDK from the folder of its verified download, and from nowhere else. While the verified download isn't on the disk, MXC shall be offered on Windows 11 client editions with `check()` saying `other` and `open()` refusing, and the adapter shall say that a download is needed. It shall download only when the host calls `download()`, which the host does only when the person picks MXC; checking, offering and loading never download. One download shall run at a time: a second call waits for the first and gets its answer. `download()` shall never throw: a registry that can't be reached, bytes that aren't the pinned ones and a disk that can't be written each end as `done: false` with a sentence, and MXC stays unavailable. After a download, the next check shall find the SDK without a restart.

## Examples

- Given Windows 11 and no download,
  when MXC is checked,
  then it is offered, the reason is `other`, a download is needed, and nothing was fetched.
- Given Windows 11 and no download,
  when the host calls `download()` and MXC is checked again,
  then the SDK is loaded from the download folder, and no restart was needed.
- Given two `download()` calls at the same time,
  when the registry answers,
  then every pinned package is fetched once and both calls say `done: true`.
- Given no network,
  when the host calls `download()`,
  then the answer is `done: false`, and a download is still needed.
- Given a disk that can't be written,
  when the host calls `download()`,
  then the answer is `done: false` and nothing throws.
