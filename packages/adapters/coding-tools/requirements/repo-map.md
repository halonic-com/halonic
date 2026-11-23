# coding-tools.repo-map

- Status: active
- Since: unreleased
- Source: HAL-16752 (plan HAL-16737, section 5)

The `repo_map` tool shall list the packages in the working folder, or in a folder of it: each folder with a `package.json`, with the package's name and up to 12 of its source files under `src/` that aren't tests, for up to 200 packages. It shall find them with the same walk as `search`. For a folder with no package, it shall list its folders, each with how many files it holds, and its own files. It shall refuse a path that is a file.

## Examples

- Given packages `packages/a` (named `@acme/a`, with `src/index.ts` and `src/index.test.ts`) and `packages/b`,
  when the model maps the working folder,
  then it gets both folders, `@acme/a` and `src/index.ts`, but not the test file.
- Given a folder with only `docs/guide.md` and `notes.txt`,
  when the model maps it,
  then it gets `docs/` with 1 file, and `notes.txt`.
