# workspace.trust-connector-files

- Status: active
- Since: unreleased
- Source: HAL-16908

When a stdio connector's start names a file in the workspace, the trust content shall hold, in that connector's `settings`, a `files` map from each such file's workspace-relative path, with `/` separators, to `sha256:` and the SHA-256 of its bytes, sorted by path. A file named is the program, every path an argument or an `env` value names, and every argument and `python -m` module with each ending Node and Python add (`.js`, `.mjs`, `.cjs`, `.ts`, `.json`, `.node`, `.py`), read the way the working folder guard reads a start (`format.working-folder-start`), from the connector's `cwd`, itself read from the workspace root. Each path shall be normalised before it is looked at, so `./tools/x.js`, `tools/x.js` and the same file as an absolute path under the workspace's location give one entry. A path that leaves the workspace, a folder, a private path (such as `.env` or `.git/…`, as `isPrivateWorkspacePath` defines it) and a file that isn't there shall be left out. A path the folder reader refuses to read, such as a link anywhere on it or a special file, shall get the fixed hash `‹unreadable›` instead. When a connector's start names no file in the workspace, its content and the workspace's fingerprint shall be the same as before this requirement.

## Examples

- Given a connector that starts `node ./tools/server.js` and that file changes,
  then the workspace's fingerprint changes, and `trustChanges` lists the connector as changed in `settings`.
- Given a connector that starts `node ./tools/server.js --port 8080` and no such file in the workspace,
  then the fingerprint is `hfp1:2afdcc4d298c7c47ce4f5687d20df64e72e48be7c91ce872d97b9af4db5e7713`, the one it had before.
- Given `node tools/server` and a file `tools/server.js`,
  then `tools/server.js` is in `files`.
- Given `node ../outside.js`, `node /etc/hosts` or `node --env-file=.env server.js`,
  then `../outside.js`, `/etc/hosts` and `.env` are not in `files`.
- Given `node tools/server.js` where `tools` is a link,
  then `tools/server.js` is in `files` with `‹unreadable›`.
- Given `node ./tools/server.js` with `cwd: tools/..`, and another with the file's absolute path under the workspace,
  then both have the one entry `tools/server.js`.

## Limits

- Files a script loads by itself, such as `./lib.js` imported by `server.js`, a package in
  `node_modules`, a folder a start names (`node .`) and inline code (`node -e`) are not hashed.
- The files are read and hashed at each trust check, including the one right before a start, as
  `commandPaths` are; a file that changes between that check and the start isn't seen.
- An absolute path is compared with the workspace's real location as the folder reader gives it,
  with case kept, so the same file written through a link or in another case is left out.
- The files are read from the workspace folder, also when a run starts from a version in the
  history, because the programs run the files in the folder.
