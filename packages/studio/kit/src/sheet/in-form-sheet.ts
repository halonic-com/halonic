import { createContext, useContext } from "react";

/**
 * True inside a form sheet, a `form` Dialog on a phone. A long field there stays a real textarea
 * instead of folding into a text sheet, so a sheet of typing never opens over another (component
 * specs 3 and 15.3, "Over a form sheet").
 */
export const InFormSheetContext = createContext(false);

/** Whether this part is inside a form sheet. */
export function useInFormSheet(): boolean {
  return useContext(InFormSheetContext);
}
