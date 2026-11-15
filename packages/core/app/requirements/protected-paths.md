# app.protected-paths

- Status: active
- Since: 0.1.0
- Source: HAL-5397 (security condition N1b)

The app shall keep one list of the files and folders in a working folder that other tools read as instructions or hooks, stored as path segments. sandbox-runtime shall deny writing exactly the entries of `writeFencedPaths`, and the ask policy shall ask before an edit of those entries, of all of `.claude/`, and of anything with a `.git` segment at any depth. Matching ignores letter case where the file system does.

## Examples

- Given `.npmrc`, then it is write-fenced and protected.
- Given `.claude/notes.md`, then it is protected but not write-fenced.
- Given `vendor/lib/.git/config`, then it is protected.
- Given `.GIT/config` with case ignored, then it is protected.
- Given `src/index.ts`, then it is not protected.
