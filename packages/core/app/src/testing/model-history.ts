import type { WorkspaceFiles } from "../workspace-files.ts";

// A model for the random test of `WorkspaceFiles`: undo and redo over whole
// file views, with no store and no saves, so it can't share a bug with them.

export const modelPaths = ["a.yaml", "b.yaml", "c.yaml"];

/** A small seeded generator, so a failing random test repeats. */
export function seededRandom(seed: number): (n: number) => number {
  let state = seed;
  return (n) => {
    state = (state * 48_271) % 2_147_483_647;
    return state % n;
  };
}

export type View = Record<string, string | null>;

/** What each file should read as, with undo and redo over whole views: no store, no saves. */
export class ModelHistory {
  view: View;
  private readonly undos: View[] = [];
  private redos: View[] = [];

  constructor(view: View) {
    this.view = view;
  }

  change(path: string, text: string | null): void {
    this.undos.push(this.view);
    this.redos = [];
    this.view = { ...this.view, [path]: text };
  }

  undo(): void {
    this.redos.push(this.view);
    this.view = this.undos.pop() ?? this.view;
  }

  redo(): void {
    this.undos.push(this.view);
    this.view = this.redos.pop() ?? this.view;
  }
}

/** One random edit, save, undo or redo, done on both the files and the model. */
export async function randomStep(
  files: WorkspaceFiles,
  model: ModelHistory,
  random: (n: number) => number,
): Promise<void> {
  const op = random(4);
  if (op === 0) {
    const path = modelPaths[random(modelPaths.length)] ?? "a.yaml";
    const text = random(4) === 0 ? null : `t${random(5)}`;
    files.change("Edited", { [path]: text });
    model.change(path, text);
  } else if (op === 1) {
    await files.save();
  } else if (op === 2 && files.undo()) {
    model.undo();
  } else if (op === 3 && files.redo()) {
    model.redo();
  }
}
