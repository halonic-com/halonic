// Draws Studio's and the focused apps' native icons (HAL-18693) from the kit's app glyphs, the one
// source the Studio's `AppLogo` draws too, as Noah's masters on HAL-17379 draw the approved set:
// the slate tile, the brand ring and the app's glyph in white, grown under 48 px, glowing from 48 px.
// Chromium turns each SVG into pixels, so it needs no image library, in three steps:
//
//   pnpm exec node apps/studio/src-tauri/icons/draw-app-icons.mjs page > page.html
//   chrome-headless-shell --headless --no-sandbox --virtual-time-budget=20000 --dump-dom file://$PWD/page.html > drawn.html
//   pnpm exec node apps/studio/src-tauri/icons/draw-app-icons.mjs write drawn.html
//
// The page is the script's own, with no network, so Chromium's sandbox (which containers often can't
// start) guards nothing. The last step writes, next to this script: icon.svg, icon.png (512) and
// icon.ico (Studio's, which the exe and the installer carry), and for each focused app apps/<app>.svg,
// apps/<app>.ico (its Start menu shortcut) and apps/<app>.rgba (its window, 64 by 64 raw RGBA like
// the tray's, so the shell needs no image decoder).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { appGlyphScale, appGlyphs } from "@halonicjs/studio-kit/app-glyphs";

const here = import.meta.dirname;
const focusedApps = ["inbox", "messenger"];
const icoSizes = [16, 24, 32, 48, 64, 256];
const windowIconSize = 64;

const blue = "#3175f2";
const cyan = "#1bc6c8";
const slate950 = "#020617";

const shapeMarkup = (shape) => {
  if (shape.kind === "dot") {
    return `<circle cx="${shape.cx}" cy="${shape.cy}" r="${shape.r}" fill="#fff"/>`;
  }
  if (shape.kind === "solid") {
    return `<path d="${shape.d}" fill="#fff" stroke="#fff" stroke-width="4.5" stroke-linejoin="round"/>`;
  }
  return `<path d="${shape.d}" fill="none" stroke="#fff" stroke-width="${shape.width}" stroke-linecap="round" stroke-linejoin="round"/>`;
};

// The masters' glow (icons.mjs on HAL-17379): white around the ring, white and teal around the glyph.
const glow = (id, layers) => {
  let previous = "SourceGraphic";
  const steps = layers.map(([sigma, colour, opacity], index) => {
    const step = `<feGaussianBlur in="${previous}" stdDeviation="${sigma}" result="b${index}"/><feFlood flood-color="${colour}" flood-opacity="${opacity}"/><feComposite in2="b${index}" operator="in" result="g${index}"/><feMerge result="l${index}"><feMergeNode in="g${index}"/><feMergeNode in="${previous}"/></feMerge>`;
    previous = `l${index}`;
    return step;
  });
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="-50" y="-50" width="200" height="200" color-interpolation-filters="sRGB">${steps.join("")}</filter>`;
};

/** How much of the tile the ring fills: more at small sizes, as in the masters. */
function ringShare(pixels) {
  if (pixels <= 16) {
    return 0.84;
  }
  return pixels <= 32 ? 0.76 : 0.6;
}

const names = { studio: "Halonic", inbox: "Halonic Inbox", messenger: "Halonic Messenger" };

/** The app's icon at `pixels`: Windows' rounded tile, the ring at the masters' share of it. */
function appIconSvg(app, pixels) {
  const glows = pixels >= 48;
  const scale = appGlyphScale(pixels);
  const share = ringShare(pixels);
  const ringSize = 100 * share;
  const at = 50 - ringSize / 2;
  const glyph = appGlyphs[app].map(shapeMarkup).join("");
  const filters = glows
    ? glow("r", [
        [3.5, "#ffffff", 0.45],
        [11, "#ffffff", 0.18],
      ]) +
      glow("c", [
        [2, "#ffffff", 0.9],
        [6, "#7fe3e4", 0.5],
      ])
    : "";
  const ring = `<circle cx="50" cy="50" r="42" fill="none" stroke="url(#ring)" stroke-width="16"/>`;
  const centre = `<g transform="translate(50 50) scale(${scale}) translate(-50 -50)">${glyph}</g>`;
  const edge = glows
    ? `<rect x="0.25" y="0.25" width="99.5" height="99.5" rx="22" fill="none" stroke="#ffffff" stroke-opacity="0.1" stroke-width="0.5"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 100 100" role="img" data-app="${app}"><title>${names[app]}</title><defs><linearGradient id="ring" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="${blue}"/><stop offset="1" stop-color="${cyan}"/></linearGradient>${filters}</defs><rect width="100" height="100" rx="22" fill="${slate950}"/>${edge}<g transform="translate(${at} ${at}) scale(${share})">${glows ? `<g filter="url(#r)">${ring}</g><g filter="url(#c)">${centre}</g>` : ring + centre}</g></svg>`;
}

/** An .ico of PNG images, as Studio's icon.ico has always been. */
function ico(pngs) {
  const header = Buffer.alloc(6 + 16 * pngs.length);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  let offset = header.length;
  pngs.forEach(({ pixels, png }, index) => {
    const entry = 6 + 16 * index;
    header.writeUInt8(pixels >= 256 ? 0 : pixels, entry);
    header.writeUInt8(pixels >= 256 ? 0 : pixels, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(png.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += png.length;
  });
  return Buffer.concat([header, ...pngs.map(({ png }) => png)]);
}

/** The page that draws every picture the icons need, once Chromium has run its script. */
function page(jobs) {
  return `<!doctype html><pre id="out"></pre><script>
const jobs = ${JSON.stringify(jobs)};
Promise.all(jobs.map(async ({ key, pixels, svg }) => {
  const image = new Image();
  image.src = "data:image/svg+xml;base64," + btoa(svg);
  await image.decode();
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = pixels;
  const context = canvas.getContext("2d");
  context.drawImage(image, 0, 0, pixels, pixels);
  const bytes = context.getImageData(0, 0, pixels, pixels).data;
  let rgba = "";
  for (let i = 0; i < bytes.length; i += 8192) rgba += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return [key, { png: canvas.toDataURL("image/png").split(",")[1], rgba: btoa(rgba) }];
})).then((done) => { document.getElementById("out").textContent = JSON.stringify(Object.fromEntries(done)); });
</script>`;
}

/** What Chromium drew, from the page it dumped: `{ "<app> <pixels>": { png, rgba } }`. */
function drawnFrom(dom) {
  const json = /<pre id="out">([^<]*)<\/pre>/.exec(dom)?.[1];
  if (json === undefined || json === "") {
    throw new Error("Chromium drew nothing: give it more --virtual-time-budget.");
  }
  const drawn = JSON.parse(json.replaceAll("&quot;", '"').replaceAll("&amp;", "&"));
  return Object.fromEntries(
    Object.entries(drawn).map(([key, { png, rgba }]) => [
      key,
      { png: Buffer.from(png, "base64"), rgba: Buffer.from(rgba, "base64") },
    ]),
  );
}

function write(drawn) {
  const icoOf = (app) =>
    ico(icoSizes.map((pixels) => ({ pixels, png: drawn[`${app} ${pixels}`].png })));
  writeFileSync(join(here, "icon.svg"), `${appIconSvg("studio", 512)}\n`);
  writeFileSync(join(here, "icon.png"), drawn["studio 512"].png);
  writeFileSync(join(here, "icon.ico"), icoOf("studio"));
  mkdirSync(join(here, "apps"), { recursive: true });
  for (const app of focusedApps) {
    writeFileSync(join(here, "apps", `${app}.svg`), `${appIconSvg(app, 512)}\n`);
    writeFileSync(join(here, "apps", `${app}.ico`), icoOf(app));
    writeFileSync(join(here, "apps", `${app}.rgba`), drawn[`${app} ${windowIconSize}`].rgba);
  }
}

const [step, drawnPage] = process.argv.slice(2);
if (step === "page") {
  const sizes = [...new Set([...icoSizes, windowIconSize, 512])];
  const jobs = ["studio", ...focusedApps].flatMap((app) =>
    sizes.map((pixels) => ({ key: `${app} ${pixels}`, pixels, svg: appIconSvg(app, pixels) })),
  );
  process.stdout.write(page(jobs));
} else if (step === "write" && drawnPage !== undefined) {
  write(drawnFrom(readFileSync(drawnPage, "utf8")));
} else {
  throw new Error("Run it with `page`, then with `write <the page Chromium dumped>`.");
}
