// Each line below must stay a compile error in the host preset: the host runs
// unchanged on Node, Workers and in the browser, so it gets neither DOM nor Node.

// @ts-expect-error document is DOM only
document.title;
// @ts-expect-error window is DOM only
window.location;
// @ts-expect-error process is Node only
process.env;
// @ts-expect-error Buffer is Node only
Buffer.from("text");
// @ts-expect-error require is Node only
require("node:fs");
// @ts-expect-error __dirname is Node only
__dirname;
