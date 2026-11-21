import { doctorMessages, plainText } from "../src/index.ts";

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
