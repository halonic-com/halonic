import type { PrivateFile } from "./private-file.ts";

/** A {@link PrivateFile} in memory that counts its writes, and can be told to fail them. */
export class MemoryFile implements PrivateFile {
  text: string | undefined;
  writes = 0;
  failing = false;

  constructor(text?: string) {
    this.text = text;
  }

  async read(): Promise<string | undefined> {
    return this.text;
  }

  async write(text: string): Promise<void> {
    if (this.failing) throw new Error("the disk is full");
    this.writes += 1;
    this.text = text;
  }
}
