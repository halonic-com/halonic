# @halonicjs/words

The sentences the CLI and Studio share. A sentence is a `Phrase`: text, bold and dim text, and
marks such as ✓ and · by name, so a terminal draws it with its colours and ASCII stand-ins and a
page with its icons, and both read the same words. `defineMessages` gives each sentence a key made
of its area and its name, such as `doctor.diskFree`.

- **Layer:** core
- **Owner:** liam
- **Public API:** `@halonicjs/words`

## What is here

- **The phrase builder:** `phrase`, `bold`, `dim`, `markPart`, `joinedFacts`, `lineOfFacts`, and
  `plainText`, the words with the Unicode marks and no styling, as `--json` and a page use them.
  Drawing a phrase for a terminal (`renderPhrase`, `fitPhrase`) stays in the CLI.
- **The catalogue:** `defineMessages`, and the count and size helpers sentences use
  (`counted`, `listInWords`, `groupedDigits`, `shownSize`).
- **`halonic doctor`'s sentences:** `doctorMessages`, so Studio's Check this computer says what
  the CLI says (first-run-progress 4.2, HAL-13406). A sentence that names a command takes the
  finished command, such as `halonic trust --dir ./acme`, because quoting a folder depends on the
  person's shell, which only the face knows.
- **The doctor's lines:** `doctorLineWords(line, face)` gives a line's label and its items in the
  order `halonic doctor` prints them: sentences, fixes (`Fix: …`) and docs links, which the CLI
  prints as `More:` and Studio shows as a link. The face passes what only it knows: the trust and
  validate commands and the shell a harness's sign-in is typed into. The Sandbox line isn't here,
  because its reason and fix differ between the CLI and Studio on purpose; `timedOutWords` words
  any check that ran over its limit, the Sandbox's included.
- **Outside text:** `printable` shows control and bidi characters as their codes, and
  `withoutUnsafe` takes them out, for text Halonic didn't write.

The package names no facts of its own and runs nothing: it has no Node or browser APIs, so the CLI,
Studio and the agent host can all use it. The facts it words come from `@halonicjs/app`.

## Example: word a doctor line

The code lives in [`examples/word-a-doctor-line.ts`](examples/word-a-doctor-line.ts), where it is
typechecked and run by `src/example.test.ts`; keep this copy in step with it. The file imports
`../src/index.ts`, because a package may not import itself by name; outside this package, import
`@halonicjs/words` as below.

```ts
import { doctorMessages, plainText } from "@halonicjs/words";

/** Words two Disk lines of `halonic doctor`, as the CLI prints them and Studio shows them. */
export function runExample(): { key: string; free: string; low: string } {
  // Sizes come in as the faces write them: the CLI's `shownSize` gives "48 GB".
  const free = doctorMessages.diskFree("48 GB", { total: "1.4 GB", runLogs: "1.1 GB" });
  const low = doctorMessages.lowOnDisk("0.8 GB");
  return {
    key: free.key, // "doctor.diskFree"
    free: plainText(free.phrase), // "48 GB free · Halonic uses 1.4 GB (run logs 1.1 GB)"
    low: plainText(low.phrase), // "Low on disk space: 0.8 GB free"
  };
}
```
