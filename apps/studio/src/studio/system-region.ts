import type { TauriIpc } from "@halonicjs/studio-shell";

/** The region and language the computer is set to, as a BCP 47 tag, or `undefined` when it names none or can't be read. */
export async function systemRegion(ipc: TauriIpc): Promise<string | undefined> {
  try {
    const region = await ipc.invoke("system_region");
    return typeof region === "string" ? region : undefined;
  } catch {
    return undefined;
  }
}

/** Reads the region once and hands it to `apply`, unless the window has been stopped meanwhile. Returns the stop. */
export function followSystemRegion(ipc: TauriIpc, apply: (region: string) => void): () => void {
  let stopped = false;
  void systemRegion(ipc).then((region) => {
    if (region !== undefined && !stopped) apply(region);
  });
  return () => {
    stopped = true;
  };
}
