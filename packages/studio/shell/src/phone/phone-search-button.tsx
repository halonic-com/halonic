import { Button, SearchIcon } from "@halonicjs/studio-kit";
import { useState } from "react";
import { ShellPhoneSearch, type ShellPhoneSearchProps } from "../palette/shell-phone-search.tsx";

/** Props for {@link PhoneSearchButton}: those of the sheet it opens, which it closes itself. */
export type PhoneSearchButtonProps = Omit<ShellPhoneSearchProps, "onClose">;

/**
 * The phone top bar's **Search** (component specs 15.1, VK T2-F11): a 48px icon button named
 * "Search" that opens the Search sheet, `ShellPhoneSearch`, over the page. The sheet is the kit's
 * modal `SheetFrame`, so when it closes, by Close, Android back or a pick, the focus goes back to
 * this button before a picked page takes it. The button takes the focus when pressed, since a
 * tap doesn't focus a button in every browser.
 *
 * The top bar shows it at the top of a place, next to the Assistant once T14 adds one; a page
 * below a place has its own actions there instead.
 *
 * @example
 * <PhoneTopBar
 *   {...places.topBar}
 *   actions={places.topBar.onBack === undefined ? <PhoneSearchButton {...searchProps} onOpenLocation={places.open} /> : undefined}
 * />
 */
export function PhoneSearchButton(props: PhoneSearchButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        variant="ghost"
        size="lg"
        icon={<SearchIcon />}
        label="Search"
        onClick={(event) => {
          // A tap doesn't focus a button in every browser (Safari on iOS), and the sheet gives the
          // focus back to what had it when it opened, so the button takes it first.
          event.currentTarget.focus();
          setOpen(true);
        }}
      />
      {open ? <ShellPhoneSearch {...props} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
