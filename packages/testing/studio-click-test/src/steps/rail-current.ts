import type { Step, StepContext, StepOutcome } from "../runner.ts";
import { buttonNamed } from "../screen.ts";
import { onWorkspaceWithoutSettings } from "./open-demo.ts";
import { inWideWindow } from "./wide-window.ts";

/** The icon rail's `nav` (`icon-rail.tsx`) and the sidebar's (`places-list.tsx`). */
export const railNav = "//nav[@aria-label='Apps']";
export const placesNav = "//nav[@aria-label='Places']";

/**
 * Rail entries the demo always shows: Messenger opens no page yet, Home holds the start page.
 * Their names come from the features' `rail.add` (`messenger`, the shell's Home).
 */
export const messengerEntry = "Messenger";
export const homeEntry = "Home";

/** A rail button picked with no page, and any rail button claiming the shown page. */
export const pickedMessenger = `${railNav}//button[@aria-current='true' and starts-with(@aria-label, '${messengerEntry}')]`;
export const railPages = `${railNav}//*[@aria-current='page']`;

/** How long a click on the rail may take to show as selected. */
const pickWaitMs = 5_000;
const pollMs = 250;

/**
 * The rail in the wide window (`shell.rail-current`, HAL-20944): its `nav` and the sidebar's have
 * different names, and Messenger, picked with no page, is `aria-current="true"` while no rail
 * entry claims to be the page. Home is clicked again after, so the steps after it find the
 * sidebar listing Home's places.
 */
export const railCurrent: Step = {
  id: "rail-current",
  title: "The rail is named Apps, and a picked Messenger isn't the current page",
  requirements: ["shell.rail-current"],
  run: async (context) => {
    const workspace = await onWorkspaceWithoutSettings(context);
    if (!workspace.passed) return workspace;
    return inWideWindow(context, () => checkRail(context));
  },
};

async function checkRail(context: StepContext): Promise<StepOutcome> {
  const { driver } = context;
  const rails = await driver.count(railNav);
  const sidebars = await driver.count(placesNav);
  if (rails !== 1 || sidebars !== 1) {
    const note = `Found ${rails} navigation named "Apps" and ${sidebars} named "Places"; expected one each.`;
    return { passed: false, code: "RAIL_LANDMARKS", note };
  }
  await driver.click(`${railNav}${buttonNamed(messengerEntry)}`);
  const picked = await waitForPick(context);
  await driver.click(`${railNav}${buttonNamed(homeEntry)}`);
  if (picked === undefined) return { passed: true };
  return { passed: false, code: "RAIL_PICK_IS_PAGE", note: picked };
}

/** Waits for the pick to show; returns why not, or undefined once it did. */
async function waitForPick(context: StepContext): Promise<string | undefined> {
  let why = "";
  for (let waited = 0; waited <= pickWaitMs; waited += pollMs) {
    const picked = await context.driver.count(pickedMessenger);
    const pages = await context.driver.count(railPages);
    if (picked === 1 && pages === 0) return undefined;
    why = `After a click on ${messengerEntry}, ${picked} rail button is aria-current="true" for it and ${pages} is aria-current="page".`;
    await context.sleep(pollMs);
  }
  return why;
}
