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

/**
 * What a refused call said. DevTools only gives `exception.value` for a
 * thrown string or number; for an Error or an object the text is the bare
 * "Uncaught" (HAL-8916), so the description, class and preview are kept too.
 */
function describe({ text, exception }) {
  const value = exception?.value;
  if (value !== undefined) {
    return JSON.stringify(value);
  }
  const parts = [exception?.className, exception?.description, text];
  if (exception?.preview) {
    parts.push(JSON.stringify(exception.preview));
  }
  return parts.filter(Boolean).join(" | ") || JSON.stringify(exception);
}

/**
 * Calls `command` in the page; `closed` when the page went away first. DevTools
 * answers `{id, error}` when it can't evaluate yet, as while the page loads or
 * navigates (HAL-9104): with `waiting` that counts as `closed`, else it rejects.
 */
async function invoke(command, { waiting = false } = {}) {
  const address = await studioPage();
  // The page is listed before Tauri has put its bridge into it (HAL-8916:
  // "reading 'invoke'" of undefined), so the call waits in the page for it.
  const expression = `(async () => {
    const until = Date.now() + 30000;
    while (!window.__TAURI_INTERNALS__?.invoke && Date.now() < until) {
      await new Promise((done) => setTimeout(done, 250));
    }
    return window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command)});
  })()`;
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(address);
    let answered = false;
    socket.onopen = () => {
      const params = {
        expression,
        awaitPromise: true,
        returnByValue: true,
        generatePreview: true,
      };
      socket.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params }));
    };
    socket.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.id !== 1) {
        return;
      }
      answered = true;
      socket.close();
      if (message.error) {
        if (waiting) {
          resolve("closed");
        } else {
          reject(new Error(`${command} failed: ${message.error.message}`));
        }
        return;
      }
      const { result, exceptionDetails } = message.result;
      if (exceptionDetails) {
        reject(new Error(`${command} failed: ${describe(exceptionDetails)}`));
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
  // `closed` means no check ran. Polling then could read the last run's state
  // as this run's result, so ask again until the check has really started.
  while ((await invoke("update_check", { waiting: true })) === "closed") {
    if (Date.now() >= deadline) {
      throw new Error(`update_check didn't run within ${seconds} s`);
    }
    await sleep(2000);
  }
  let last = "";
  while (Date.now() < deadline) {
    const status = await invoke("update_status", { waiting: true });
    if (status === "closed") {
      // Not ready yet, or Halonic is restarting: try again.
      await sleep(2000);
      continue;
    }
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
