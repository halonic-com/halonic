// Each line below must stay a compile error in the core preset. If one starts
// to compile, `@ts-expect-error` fails the typecheck of this package.

// No values for the Web types: the host creates them and hands them in.
// @ts-expect-error fetch is a value, host only
await fetch("https://example.com");
// @ts-expect-error Request is only a type in the core
new Request("https://example.com");
// @ts-expect-error Response is only a type in the core
new Response("body");
// @ts-expect-error URL is only a type in the core
new URL("https://example.com");
// @ts-expect-error TextEncoder is only a type in the core
new TextEncoder();
// @ts-expect-error crypto is a value, host only
crypto.randomUUID();

// No timers: time comes in through a port.
// @ts-expect-error setTimeout is host only
setTimeout(() => {}, 1);
// @ts-expect-error setInterval is host only
setInterval(() => {}, 1);
// @ts-expect-error queueMicrotask is host only
queueMicrotask(() => {});

// No browser globals.
// @ts-expect-error document is DOM only
document.title;
// @ts-expect-error window is DOM only
window.location;
// @ts-expect-error localStorage is DOM only
localStorage.getItem("key");

// No Node.
// @ts-expect-error process is Node only
process.env;
// @ts-expect-error Buffer is Node only
Buffer.from("text");
// @ts-expect-error require is Node only
require("node:fs");
