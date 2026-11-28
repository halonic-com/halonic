// The click test's entry point on the Windows runner (HAL-18317). The
// studio-preview workflow starts msedgedriver and the throwaway Paperclip, and
// sets WebView2's registry policy that opens Halonic's DevTools port, then
// runs: node packages/testing/studio-click-test/src/main.ts
//
// HALONIC_SHORTCUTS  the Start menu folder that holds Halonic's shortcuts
// HALONIC_DEVTOOLS   the DevTools address the policy opens, such as 127.0.0.1:9222
// PAPERCLIP_URL      the throwaway Paperclip, on loopback
// CLICK_TEST_OUT     where results.json, results.md and screenshots/ go
// CLICK_TEST_BUILD   the build's name for the table, such as the commit
// EDGE_DRIVER_URL    msedgedriver's address (http://127.0.0.1:9515 by default)
// CLICK_TEST_CHANGED a file listing, one per line, the paths the build changed
//                    since CLICK_TEST_SINCE; then only the short check and the
//                    steps those touched run (HAL-18863). Unset: every step.
import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { chooseSteps } from "./affected.ts";
import { findMainWindow } from "./main-window.ts";
import { startPaperclipBoard } from "./paperclip-board.ts";
import { requirementFiles } from "./requirement-files.ts";
import { allPassed, type LeftOut, resultsMarkdown } from "./results.ts";
import { runSteps, type StepContext } from "./runner.ts";
import { clickTestSteps } from "./steps.ts";
import { seedPaperclip, testPaperclip } from "./test-paperclip.ts";
import {
  type KeyboardFocus,
  keyboardFocusScript,
  parseKeyboardFocus,
  parseTopLevelWindows,
  topLevelWindowsScript,
} from "./top-level-windows.ts";
import { type Driver, openSession } from "./webdriver.ts";

const environment = process.env;
const out = required("CLICK_TEST_OUT");
const screenshots = join(out, "screenshots");
await mkdir(screenshots, { recursive: true });

const changed = await changedPaths();
const repo = fileURLToPath(new URL("../../../../", import.meta.url));
const requirementIds = clickTestSteps.flatMap((step) => step.requirements);
const choice = chooseSteps(clickTestSteps, changed, await requirementFiles(repo, requirementIds));
const leftOut: LeftOut | undefined =
  changed === undefined
    ? undefined
    : { since: (environment["CLICK_TEST_SINCE"] ?? "").slice(0, 7), steps: choice.notAffected };

const paperclipUrl = required("PAPERCLIP_URL");
const board = await startPaperclipBoard(paperclipUrl);
const paperclip = testPaperclip(
  paperclipUrl,
  await seedPaperclip(paperclipUrl, join(out, "paperclip-cards.json")),
  board.studioKey,
);
const sleep = (milliseconds: number) => delay(milliseconds);
const devTools = required("HALONIC_DEVTOOLS");
let driver = await startApp();
try {
  const results = await runSteps(
    choice.run,
    await contextFor(driver),
    (fileName, png) => writeFile(join(screenshots, fileName), png),
    async () => {
      await stopApp(driver);
      driver = await startApp();
      return contextFor(driver);
    },
  );
  await writeFile(join(out, "results.json"), `${JSON.stringify(results, null, 2)}\n`);
  await writeFile(
    join(out, "results.md"),
    resultsMarkdown(results, environment["CLICK_TEST_BUILD"] ?? "unnamed build", leftOut),
  );
  process.exitCode = allPassed(results) ? 0 : 1;
} finally {
  await driver
    .close()
    .catch((error: unknown) => console.error("Closing the session failed:", error));
  await board.close();
}

/** Starts Halonic the way a user does, from the Start menu's shortcut, and attaches to it. */
async function startApp(): Promise<Driver> {
  await openShortcut("Halonic");
  await waitForDevTools(devTools, true);
  return openSession(environment["EDGE_DRIVER_URL"] ?? "http://127.0.0.1:9515", devTools);
}

/**
 * Ends the session and every Halonic process, after a failing step, so the
 * next step starts on a fresh app (the board, HAL-18353).
 */
async function stopApp(current: Driver): Promise<void> {
  await current
    .close()
    .catch((error: unknown) => console.error("Closing the session failed:", error));
  await powershell(
    "Get-Process | Where-Object { $_.ProcessName -like 'halonic*' } | Stop-Process -Force",
  );
  await waitForDevTools(devTools, false);
}

async function contextFor(current: Driver): Promise<StepContext> {
  const mainWindow = await findMainWindow(current, sleep);
  return {
    driver: current,
    paperclipUrl: board.address,
    sleep,
    shellLog,
    openShortcut,
    topLevelWindows,
    keyboardFocus,
    mainWindow,
    approveSignIn: () => board.approveSignIn(30_000, sleep),
    paperclip,
  };
}

/** The paths CLICK_TEST_CHANGED's file lists, or undefined when it isn't set: every step runs. */
async function changedPaths(): Promise<string[] | undefined> {
  const file = environment["CLICK_TEST_CHANGED"];
  if (file === undefined || file === "") return undefined;
  const text = await readFile(file, "utf8");
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "");
}

function required(name: string): string {
  const value = environment[name];
  if (value === undefined || value === "") throw new Error(`${name} isn't set`);
  return value;
}

/**
 * Waits up to 2 minutes for the app's WebView2 to answer on its DevTools port,
 * or, with `up` false, to stop answering once the app is gone.
 */
async function waitForDevTools(address: string, up: boolean): Promise<void> {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    const answered = await fetch(`http://${address}/json/version`).then(
      (response) => response.ok,
      () => false,
    );
    if (answered === up) return;
    await sleep(1000);
  }
  const state = up ? "never answered" : "still answers after the app was stopped";
  throw new Error(`Halonic's WebView2 ${state} on ${address}`);
}

/**
 * The last 40 `engine` and `agent host` lines of the shell log in Halonic's
 * profile folder; its last 15 lines when none match, and why when it can't be read.
 */
async function shellLog(): Promise<string> {
  const file = join(required("LOCALAPPDATA"), "halonic", "studio", "shell.log");
  let text: string;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    return `(no shell.log: ${String(error)})`;
  }
  const all = text.split(/\r?\n/).filter((line) => line.trim() !== "");
  const lines = all.filter((line) => /\bengine\b|agent host/i.test(line));
  if (lines.length > 0) return lines.slice(-40).join("\n");
  return [`(no engine lines; last ${Math.min(15, all.length)} lines)`, ...all.slice(-15)].join(
    "\n",
  );
}

/**
 * Opens a Start menu shortcut with Start-Process, as a double-click would. With `args`, it starts
 * the program the shortcut points at with them, as a second start from a terminal would.
 */
async function openShortcut(name: string, args: readonly string[] = []): Promise<void> {
  const shortcut = join(required("HALONIC_SHORTCUTS"), `${name}.lnk`);
  if (args.length === 0) {
    await powershell("Start-Process -FilePath $env:CLICK_TEST_SHORTCUT", {
      CLICK_TEST_SHORTCUT: shortcut,
    });
    return;
  }
  await powershell(
    "$target = (New-Object -ComObject WScript.Shell).CreateShortcut($env:CLICK_TEST_SHORTCUT).TargetPath; Start-Process -FilePath $target -ArgumentList $env:CLICK_TEST_ARGS",
    { CLICK_TEST_SHORTCUT: shortcut, CLICK_TEST_ARGS: args.join(" ") },
  );
}

/** The process images of the visible top-level windows whose image is named `exe`. */
async function topLevelWindows(exe: string): Promise<string[]> {
  return parseTopLevelWindows(await powershell(topLevelWindowsScript, { CLICK_TEST_EXE: exe }));
}

/** Where typing goes now: the foreground window's image and whether its page has the focus. */
async function keyboardFocus(): Promise<KeyboardFocus> {
  return parseKeyboardFocus(await powershell(keyboardFocusScript));
}

/**
 * Runs one PowerShell command and gives back what it printed. The values it needs go in the
 * environment, not the command line, and the command goes encoded, so Windows PowerShell keeps
 * its quotes and line breaks.
 */
async function powershell(command: string, values: Record<string, string> = {}): Promise<string> {
  const encoded = Buffer.from(command, "utf16le").toString("base64");
  return new Promise<string>((resolve, reject) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-EncodedCommand", encoded], {
      env: { ...environment, ...values },
      stdio: ["ignore", "pipe", "inherit"],
      windowsHide: true,
    });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      output += chunk;
    });
    child.on("error", reject);
    // "close", not "exit": only then has all it printed arrived.
    child.on("close", (code) =>
      code === 0 ? resolve(output) : reject(new Error(`${command} exited ${code}`)),
    );
  });
}
