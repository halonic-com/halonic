# @halonicjs/studio-code-editor

The code editor for Files: a thin wrapper around CodeMirror 6, coloured from the kit's variables, with our own undo history. Only this package imports CodeMirror; everyone else uses the API below.

- **Layer:** studio
- **Owner:** elena
- **Public API:** `@halonicjs/studio-code-editor`

What it does:

- YAML and Markdown colouring in four kit colours (keys, strings, numbers and words that mean something, comments), chosen from the file name with `languageFor`.
- Its own undo history (Ctrl Z, Ctrl Shift Z, Ctrl Y). Typing within half a second is one step.
- Tab indents with two spaces. Esc then Tab, or Ctrl M, lets Tab leave the editor; `onTabFocusChange` tells the owner so it can show "Tab moves focus".
- A read-only mode, and a screen-reader name for the text area.
- CodeMirror loads only when a file is first opened (`openCodeEditor` uses a dynamic import).

## Example

```ts
import { languageFor, openCodeEditor } from "@halonicjs/studio-code-editor";

const editor = await openCodeEditor({
  parent: document.getElementById("editor") as HTMLElement,
  text: "name: Studio\n",
  language: languageFor("workspace.yaml"),
  label: "workspace.yaml",
  onChange: (text) => save(text),
});
editor.focus();
```

Gutter marks, squiggles and the Problems list come with the file tab (HAL-10534, PR 4).
