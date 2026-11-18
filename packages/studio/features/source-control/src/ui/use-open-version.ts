import { useEffect, useState } from "react";
import type { Version } from "../api.ts";

/** What {@link useOpenVersion} gives the page. */
export interface OpenVersion {
  /** The version whose page is open; `undefined` shows the Changes page. */
  readonly open: Version | undefined;
  /** The version History puts focus on when it is drawn again after its page; `undefined` leaves focus alone. */
  readonly returnTo: string | undefined;
  /** Says History has put focus where `returnTo` asked, so a later redraw leaves focus alone. */
  readonly focusPlaced: () => void;
  readonly show: (id: string) => void;
  readonly back: () => void;
}

/**
 * Which version's page is open on a phone (checklist part 2, 2.14). Back goes to History, to the
 * row the page was opened from. When a later read no longer has the version, the Changes page
 * shows again, and stays when a still later read has the version back.
 */
export function useOpenVersion(versions: readonly Version[]): OpenVersion {
  const [openId, setOpenId] = useState<string>();
  const [returnTo, setReturnTo] = useState<string>();
  const open = versions.find((version) => version.id === openId);
  const gone = openId !== undefined && open === undefined;
  // Forget a version that is gone, so it doesn't open again by itself if it comes back.
  useEffect(() => {
    if (gone) setOpenId(undefined);
  }, [gone]);
  return {
    open,
    returnTo,
    focusPlaced: () => setReturnTo(undefined),
    show: (id) => {
      setReturnTo(undefined);
      setOpenId(id);
    },
    back: () => {
      if (openId === undefined) return;
      setReturnTo(openId);
      setOpenId(undefined);
    },
  };
}
