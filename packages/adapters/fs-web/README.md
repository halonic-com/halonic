# @halonicjs/adapter-fs-web

The `DefinitionStore` over a folder the person opens in the browser, through the File System Access
API (`showDirectoryPicker`). Only Chromium browsers (Chrome, Edge) have it; elsewhere,
`openLocalFolder` says the browser can't open a folder.

- **Layer:** adapters
- **Owner:** priya
- **Runtime:** web
- **Public API:** `@halonicjs/adapter-fs-web`

## Public API

- `openLocalFolder(options?)` shows the browser's folder picker and opens the folder the person
  picks. Call it from a click: the browser shows the picker only then. It gives one of:
  - `{ status: "opened", store }`: a `BrowserFolderDefinitionStore` over the folder.
  - `{ status: "cancelled" }`: the person closed the picker. Nothing to tell them.
  - `{ status: "not-supported" }`: the browser has no `showDirectoryPicker` (Firefox, Safari).
- `BrowserFolderDefinitionStore` implements the port's `DefinitionStore`, with `location`
  `browser:<folder name>`.
  - **Writes** go to the browser's pending copy of the file and land in one step on close. Writes to
    one path run one after another. A write with `expected` checks the file again right before the
    close, so a change another program made meanwhile is not written over: the write gives
    `changed-on-disk` and the watch reports the change. Only a change in the moment between that
    last check and the close is lost; the browser has no file lock.
  - **`watch()`**: the browser has no file events, so the watch looks each time the page gets
    focus again or becomes visible. It compares when each file last changed and its size with what
    it saw before, and reads only the files where one of them differs. The rest is the shared
    digest-compare watch from `@halonicjs/adapter-watch-kit`.
  - **Access:** every call first checks the page may still use the folder, without asking the
    person. After a reload, or when the person takes access back, calls fail with a
    `FolderAccessError` (kind `denied`). Its `state` is `prompt` when `requestAccess()`, called
    from a click, can ask the person again, or `denied` when only the browser's site settings can
    give it back. The store never asks by itself.
- `FolderAccessError` and `isFolderAccessError` (use the function, not `instanceof`).
- `browserFolderPicker(scope?)` and `browserPageReturns` are the browser defaults that
  `openLocalFolder` and the store use; the option types are `OpenFolderOptions`,
  `OpenFolderResult`, `BrowserFolderStoreOptions` and `PageReturns`.
- `FolderHandle`, `FileHandle`, `FileSnapshot`, `PendingWrite`, `FolderPicker`, `AccessState` and
  `AccessRequest` are the parts of the File System Access API the store uses. TypeScript's DOM
  types leave out the permission calls and the picker, which only Chromium has.

The tests run the `definition-store` contract against an in-memory fake of the folder handles.

## Example

```ts
import { isFolderAccessError, openLocalFolder } from "@halonicjs/adapter-fs-web";

openButton.addEventListener("click", async () => {
  const opened = await openLocalFolder();
  if (opened.status !== "opened") {
    return; // `cancelled`: nothing to do; `not-supported`: offer the demo instead.
  }
  const { store } = opened;
  try {
    console.log(await store.read("workspace.yaml"));
  } catch (error) {
    if (isFolderAccessError(error) && error.state === "prompt") {
      // From the next click: `await store.requestAccess()`, then try again.
    }
  }
});
```
