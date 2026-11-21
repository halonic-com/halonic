import type { SheetHosts } from "@halonicjs/format";

/** A run's connectors' `sheetHostsOf` for a test with no plugin or local integration. */
export async function noSheetHosts(): Promise<SheetHosts> {
  return { plugins: new Map(), integrations: new Map() };
}
