/** A text a step reads on screen, and the file that holds it, which `steps/places-open.test.ts` checks. */
export interface TextInFile {
  readonly text: string;
  readonly file: string;
}

/** One sidebar place step 16 opens: its name, the text its page shows, and its load failure. */
export interface PlacePage {
  /** The place's name in the Places list. */
  readonly place: TextInFile;
  /** The page shows one of these once it has loaded. */
  readonly shows: readonly TextInFile[];
  /** The line the page shows when its first load fails, and the code the results table gives it. */
  readonly failed?: TextInFile & { readonly code: string };
  /**
   * A text the page must also show in a wide window, where it has room for a second pane; the
   * installed app's 800 × 600 window shows one pane, so the step widens it to look.
   */
  readonly wide?: TextInFile;
}

const placeNames = "packages/studio/shell/src/points/frame.ts";
const changesWords = "packages/studio/features/source-control/src/changes-words.ts";

/** The Inbox's New request, which opens its request form; step 33 clicks it too. */
export const newRequestText: TextInFile = {
  text: "New request",
  file: "packages/studio/features/inbox/src/ui/use-request-pane.tsx",
};

/** The desktop Runs place's name in the Places list; step 32 opens it with the keyboard. */
export const runsPlaceText: TextInFile = { text: "Runs", file: placeNames };

/**
 * The places step 16 opens, in its order, with the text that tells their pages apart. No words
 * entry point exports these, so `places-open.test.ts` checks each is still in its file.
 */
export const placePages: readonly PlacePage[] = [
  {
    // The demo has a workflow with a `start:` block, so the Inbox offers its request form.
    place: { text: "Inbox", file: placeNames },
    shows: [newRequestText],
    failed: {
      code: "INBOX_LOAD_FAILED",
      text: "Couldn't load the Inbox",
      file: "packages/studio/features/inbox/src/ui/load-lines.tsx",
    },
  },
  {
    // The desktop Runs place is the Runs app (HAL-18725). A fresh install's demo has no run yet,
    // so its summary line says so (run 45705698354). A Paperclip account still connected from an
    // earlier step lists its runs, so the line counts them instead (HAL-20945); `summaryWords`
    // builds that line from pieces, so its test holds the prefix whole. In a wide window, its
    // content pane shows the runs table beside the list (`runs.runs-table`).
    place: runsPlaceText,
    shows: [
      { text: "No runs yet today.", file: "packages/studio/features/runs/src/app/app-run.ts" },
      { text: "Today: ", file: "packages/studio/features/runs/src/app/app-run.test.ts" },
    ],
    wide: { text: "All runs", file: "packages/studio/features/runs/src/ui/runs-table.tsx" },
  },
  {
    // The Library opens on Skills the first time. Its load failure is built from the tab's name,
    // so no file holds the whole line; a failure shows as the sentence missing.
    place: { text: "Library", file: placeNames },
    shows: [
      {
        text: "Instructions your agents can pick up when a task calls for them.",
        file: "packages/studio/features/library/src/library-words.ts",
      },
    ],
  },
  {
    // Whether the demo's folder keeps a history depends on the install, so each state passes.
    place: { text: "Changes", file: placeNames },
    shows: [
      { text: "Since your last version", file: changesWords },
      { text: "Nothing has changed since your last version.", file: changesWords },
      { text: "Keep a history of your work", file: changesWords },
      { text: "Halonic needs git to keep versions.", file: changesWords },
    ],
    failed: { code: "CHANGES_LOAD_FAILED", text: "Couldn't load changes", file: changesWords },
  },
];
