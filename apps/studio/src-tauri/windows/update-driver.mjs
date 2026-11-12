// Drives the installed Studio's updater through WebView2's DevTools port, as
// About Halonic will (HAL-1206): it calls the shell's update_* commands from
// the Studio page, so the update test takes the path a person takes and the
// app carries no test-only code.
//
//   node update-driver.mjs <port> wait <kind> [seconds]  checks now, then
//     waits until the updater's state is <kind>; fails early on another
//     final state
//   node update-driver.mjs <port> call <command>         calls a command and
//     prints its answer; a Halonic that closes on the call counts as done
//
// Halonic must run with WebView2 given
// --remote-debugging-port=<port> (test-update.ps1 sets the registry policy).

const [port, action, argument, seconds = "180"] = process.argv.slice(2);

/** The states the updater stays in until something changes it. */
const FINAL = new Set([
  "up-to-date",
  "cant-check",
  "available",
  "download-failed",
  "signature-mismatch",
  "ready",
]);

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** The DevTools address of the Studio page, once WebView2 lists it. */
async function studioPage() {
  const deadline = Date.now() + 60_000;
  let seen = "nothing listened";
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      const pages = await response.json();
      seen = JSON.stringify(pages.map((entry) => [entry.type, entry.url]));
      const page = pages.find(
        (entry) => entry.type === "page" && entry.url.includes("studio.html"),
      );
      if (page) {
        return page.webSocketDebuggerUrl;
      }
    } catch (error) {
      // Not listening yet: Halonic is still starting.
      seen = String(error);
    }
    await sleep(1000);
  }
  throw new Error(`no Studio page on DevTools port ${port} (last seen: ${seen})`);
}

/** Calls `command` in the page; `closed` when the page went away first. */
async function invoke(command) {
  const address = await studioPage();
  const expression = `window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)})`;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(address);
    let answered = false;
    socket.onopen = () => {
      const params = { expression, awaitPromise: true, returnByValue: true };
      socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params }));
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) {
        return;
      }
      answered = true;
      socket.close();
      const { result, exceptionDetails } = message.result;
      if (exceptionDetails) {
        const refusal = exceptionDetails.exception?.value ?? exceptionDetails.text;
        reject(new Error(`${command} failed: ${JSON.stringify(refusal)}`));
      } else {
        resolve(result.value);
      }
    };
    socket.onclose = () => {
      if (!answered) {
        resolve("closed");
      }
    };
  });
}

/**
 * Checks now, as Check now does, then waits. The state at start comes from
 * the last run's record, so only a state after this check counts. A check
 * already running answers at once with `checking`, and the wait lets it end.
 */
async function waitFor(kind) {
  const deadline = Date.now() + Number(seconds) * 1000;
  await invoke("update_check");
  let last = "";
  while (Date.now() < deadline) {
    const status = await invoke("update_status");
    const now = status.state.kind;
    if (now !== last) {
      console.log(`${new Date().toISOString()} ${JSON.stringify(status)}`);
      last = now;
    }
    if (now === kind) {
      return;
    }
    if (FINAL.has(now) && !status.checking && now !== "available") {
      throw new Error(`the updater stopped at ${now}, not ${kind}`);
    }
    await sleep(2000);
  }
  throw new Error(`the updater didn't reach ${kind} within ${seconds} s`);
}

if (action === "wait") {
  await waitFor(argument);
} else if (action === "call") {
  console.log(JSON.stringify(await invoke(argument)));
} else {
  throw new Error("usage: update-driver.mjs <port> wait <kind> [seconds] | call <command>");
}
