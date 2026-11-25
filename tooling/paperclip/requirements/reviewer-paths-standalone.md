# paperclip.reviewer-paths-standalone

- Status: active
- Since: unreleased
- Source: HAL-18285; the live Merger's loader kept by Liam's decision on HAL-18282 (25 Nov), after its copy broke on HAL-18251

The reviewer path list shall load on its own the way the live Merger loads it: starting at `tooling/paperclip/src/reviewer-paths.ts`, every runtime import (not `import type` or `export type`), followed recursively, shall be a relative `.ts` file inside `tooling/paperclip/src/`, and that set of files, copied into an empty folder without `node_modules`, shall run with plain Node type stripping and route pull requests as `reviewerFor` does, and a check shall fail naming the file, the import and the Merger's loader rule otherwise.

## Examples

- Given `reviewer-paths.ts` and the `routing.ts` it imports, copied into an empty folder,
  when Node imports `reviewer-paths.ts` there with type stripping only,
  then `reviewerFor` sends a change to `packages/studio/features/inbox/src/view.tsx` to Julian and one to `pnpm-lock.yaml` to Liam.
- Given `reviewer-paths.ts` with a runtime import of `@halonicjs/format`,
  when the check runs,
  then it fails naming `reviewer-paths.ts`, `@halonicjs/format` and the Merger's loader rule.
- Given `reviewer-paths.ts` with an `enum`, which type stripping can't remove,
  when the check runs,
  then it fails with Node's error and the Merger's loader rule.
