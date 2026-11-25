# @halonicjs/plugin-build

Builds a Paperclip plugin's bytes from a workspace's snapshot, for `halonic build paperclip-plugin`
(HAL-17950). This first step holds the uncompressed ustar writer; the plugin archive with its four
fixed files, its sha-256, the release file, the change list and the reader for a previous build
follow (HAL-18002).

- **Layer:** core
- **Owner:** noah
- **Public API:** `@halonicjs/plugin-build`

The package has no files, git or network of its own: bytes in, bytes out.

## What it gives you

| Export | What it does |
| --- | --- |
| `writeTar(files)` | One uncompressed ustar archive: names sorted, mtime 0, mode 0644, uid and gid 0, empty owner names, so the same files always give the same bytes. Uncompressed, because gzip's bytes depend on the zlib version. |
| `tarNameProblem(name)`, `TarNameError` | Why a name may not go into an archive: empty, over 100 bytes, not visible ASCII, absolute, holds `..`, or (in `writeTar`) comes twice. |
