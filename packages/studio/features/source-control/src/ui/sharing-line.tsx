import type { ChangesList } from "../changes-list.ts";
import {
  CouldntCheckStrip,
  NotSharedStrip,
  SharingStrip,
  UpToDateStrip,
} from "./sharing-strip.tsx";

/**
 * The sharing strip's state now: no address, versions the shared copy lacks, the shared copy
 * couldn't be asked, or everything shared and up to date; else none. On the phone only the
 * no-address line shows.
 */
export function SharingLine({
  list,
  phone,
  onAdd,
}: {
  readonly list: ChangesList;
  readonly phone: boolean;
  readonly onAdd: () => void;
}) {
  const { read, hasRemote, merge, unshared, sharing, sharedCheck } = list.state;
  if (read?.kind === "ready" && !hasRemote) return <SharingStrip onAdd={onAdd} phone={phone} />;
  const notShared = unshared > 0 || sharing;
  if (!hasRemote || merge !== undefined || phone) return null;
  if (notShared) return <NotSharedStrip list={list} />;
  if (sharedCheck.kind === "failed")
    return <CouldntCheckStrip list={list} reason={sharedCheck.reason} />;
  if (sharedCheck.kind === "checked" && sharedCheck.waiting === 0) return <UpToDateStrip />;
  return null;
}
