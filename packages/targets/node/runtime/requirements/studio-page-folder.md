# runtime.studio-page-folder

- Status: active
- Since: 0.1.0
- Source: HAL-9489, decided on HAL-9482

The Node runtime shall give the server the built Studio page from a folder on disk. A read shall answer the file's bytes, and `null` when the file doesn't exist, when the path names a folder, when the whole folder doesn't exist, and when the file's real path, with links resolved, lies outside the folder. It shall read nothing outside the folder, and a failure that isn't a missing file, such as a disk error, shall reach the server as a failure and not as a missing file.

Rationale: the page is built into files by Vite, and the server asks for one file at a time. The server refuses paths that climb out of the folder; a link inside the folder is the one way left to get out, so the real path is checked as well.

## Examples

- Given a folder with `studio.html` and `assets/a.js`, when `assets/a.js` is read, then its bytes come back.
- Given the same folder, when `assets/missing.js` or `assets` is read, then the answer is `null`.
- Given a folder that doesn't exist, when any file is read, then the answer is `null`.
- Given a link in the folder to a file outside it, when the link is read, then the answer is `null`.
