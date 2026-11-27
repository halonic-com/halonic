// The app icons the board approved on HAL-20465 (27 Nov 2026): dark, all in Halonic blue. Each app
// is one line of light on ink glass around a point of light in the centre of the square. Ported
// from the designer's `icons-v4.mjs` there (`iconSvg("dark", picked[app] ?? app, pixels, "blue")`),
// keeping only that drawing, so its SVGs come out the same to the byte.
//
// Every size is drawn on its own pixel grid: at 16 to 64 px the line's width, its inset and the
// point's radius are whole pixels, so never scale one size to make another. The glow, the sheen and
// the point's halo start at 32 px; at 16 to 24 px they would only blur the line.

// Halonic blue: the line runs from `a` at the lower left to `b` at the upper right; `glow` lights it.
const blue = { a: "#2f6df3", b: "#22d3ee", glow: "#3b82f6" };

const n = (value) => Number(value.toFixed(3));
const table = (values, pixels, share) => values[pixels] ?? share * pixels;
const even = (value) => Math.round(value / 2) * 2;
// At 16 to 64 px a length snaps to whole pixels; above, it keeps its share.
const snap = (pixels, value) => (pixels <= 64 ? Math.round(value) : value);

// The line of light: its width, and its inset from the surface's edge (the bezel).
const lineWidth = { 16: 2, 20: 2, 24: 2, 32: 3, 40: 3, 48: 4, 64: 5 };
const lineInset = { 16: 0, 20: 0, 24: 0, 32: 0, 40: 1, 48: 2, 64: 3 };
const dotRadius = { 16: 2, 20: 2.5, 24: 3, 32: 4, 40: 5, 48: 5, 64: 6 };

/** The point's radius, snapped at 16 to 64 px so its edges land on whole pixels around its centre. */
function pointRadius(pixels, centre) {
  const base = table(dotRadius, pixels, 0.098);
  if (pixels > 64) {
    return base;
  }
  return Number.isInteger(centre) ? Math.round(base) : Math.round(base - 0.5) + 0.5;
}

/** A chain of glows like CSS drop-shadows: each layer blurs everything before it. */
function glowFilter(id, pixels, layers) {
  let previous = "SourceGraphic";
  const steps = layers.map(([sigma, colour, opacity], index) => {
    const step = `<feGaussianBlur in="${previous}" stdDeviation="${n(sigma)}" result="b${index}"/><feFlood flood-color="${colour}" flood-opacity="${n(opacity)}"/><feComposite in2="b${index}" operator="in" result="g${index}"/><feMerge result="l${index}"><feMergeNode in="g${index}"/><feMergeNode in="${previous}"/></feMerge>`;
    previous = `l${index}`;
    return step;
  });
  return `<filter id="${id}" filterUnits="userSpaceOnUse" x="${-pixels}" y="${-pixels}" width="${3 * pixels}" height="${3 * pixels}" color-interpolation-filters="sRGB">${steps.join("")}</filter>`;
}

const blurFilter = (id, pixels, sigma) =>
  `<filter id="${id}" filterUnits="userSpaceOnUse" x="${-pixels}" y="${-pixels}" width="${3 * pixels}" height="${3 * pixels}" color-interpolation-filters="sRGB"><feGaussianBlur stdDeviation="${n(sigma)}"/></filter>`;

// The teaser's Play glow on a 36 px shape: 3 px white .95, 10 px blue .85, 28 px blue .45 (a CSS
// blur radius is twice the Gaussian's deviation), at three quarters of its strength.
const pointGlow = (size) => [
  [(1.5 / 36) * size, "#ffffff", 0.95 * 0.75],
  [(5 / 36) * size, blue.glow, 0.85 * 0.75],
  [(14 / 36) * size, blue.glow, 0.45 * 0.75],
];

const circle = (cx, cy, r) => (attributes) =>
  `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(r)}" ${attributes}/>`;
const path = (d) => (attributes) => `<path d="${d}" ${attributes}/>`;

/** A surface that follows a path: the path, filled, under a round stroke of the bezel's width. */
const pathSurface = (d, half) => (grow, paint) =>
  path(d)(
    `fill="${paint}" stroke="${paint}" stroke-width="${n(Math.max(2 * (half + grow), 0))}" stroke-linejoin="round" stroke-linecap="round"`,
  );

/** A polygon (or an open polyline) with soft corners: each corner is cut by `cut` and bent through its own point. */
function softPoly(points, cut, closed = true) {
  const toward = (from, to) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const t = Math.min(cut, length / 2) / length;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  };
  const parts = points.map((point, index) => {
    const command = index === 0 ? "M" : "L";
    if (!closed && (index === 0 || index === points.length - 1)) {
      return `${command}${n(point[0])} ${n(point[1])}`;
    }
    const before = toward(point, points[(index - 1 + points.length) % points.length]);
    const after = toward(point, points[(index + 1) % points.length]);
    return `${command}${n(before[0])} ${n(before[1])} Q${n(point[0])} ${n(point[1])} ${n(after[0])} ${n(after[1])}`;
  });
  return `${parts.join(" ")}${closed ? " Z" : ""}`;
}

/** A circle with a speech tail at its lower left, as one closed path. */
function tailedCircle(cx, cy, r, tip) {
  const at = (degrees, radius = r) => [
    cx + radius * Math.cos((degrees * Math.PI) / 180),
    cy + radius * Math.sin((degrees * Math.PI) / 180),
  ];
  const [x1, y1] = at(103);
  const [x2, y2] = at(154);
  const [tx, ty] = at(136, tip);
  const [ax, ay] = at(119, r * 1.07);
  const [bx, by] = at(144, r * 1.03);
  return `M${n(x2)} ${n(y2)} A${n(r)} ${n(r)} 0 1 1 ${n(x1)} ${n(y1)} Q${n(ax)} ${n(ay)} ${n(tx)} ${n(ty)} Q${n(bx)} ${n(by)} ${n(x2)} ${n(y2)} Z`;
}

// Each app's figure as one line inside the square: `line`, the line's own path; `surface(grow,
// paint)`, the ink around it (the line's shape grown by its half width, the inset and `grow`);
// `light`, where the point of light rests; and `reach`, how far its halo spreads.

/** Studio: a ring. */
function studio(pixels, width, half) {
  const centre = pixels / 2;
  const outer = pixels <= 24 ? pixels / 2 : snap(pixels, pixels * 0.46);
  const r = outer - half;
  return {
    line: circle(centre, centre, r),
    surface: (grow, paint) => circle(centre, centre, r + half + grow)(`fill="${paint}"`),
    light: [centre, centre],
    reach: r - width / 2,
  };
}

/** Messenger: a ring with a speech tail at its lower left. */
function messenger(pixels, width, half) {
  const centre = pixels / 2;
  const outer = snap(pixels, pixels * 0.455);
  const r = outer - half;
  const d = tailedCircle(centre, centre, r, outer * 1.4 - half);
  return {
    line: path(d),
    surface: (grow, paint) =>
      path(d)(
        `fill="${paint}" stroke="${paint}" stroke-width="${n(Math.max(2 * (half + grow), 0))}" stroke-linejoin="round"`,
      ),
    light: [centre, centre],
    reach: r - width / 2,
  };
}

/** Inbox: a bell, a dome that swells into a wide foot with round corners, the point inside it. */
function inbox(pixels, width, half) {
  const centre = pixels / 2;
  const bottom = pixels - half - snap(pixels, pixels * 0.07);
  const wide = pixels / 2 - half;
  const body = snap(pixels, pixels * 0.3);
  const dome = half + body;
  const corner = pixels * 0.12;
  const fall = bottom - corner - dome;
  const left = centre - wide;
  const right = centre + wide;
  const d = `M${n(left + corner)} ${n(bottom)} A${n(corner)} ${n(corner)} 0 0 1 ${n(left)} ${n(bottom - corner)} C${n(left)} ${n(bottom - corner - fall * 0.16)} ${n(centre - body)} ${n(dome + fall * 0.8)} ${n(centre - body)} ${n(dome)} A${n(body)} ${n(body)} 0 0 1 ${n(centre + body)} ${n(dome)} C${n(centre + body)} ${n(dome + fall * 0.8)} ${n(right)} ${n(bottom - corner - fall * 0.16)} ${n(right)} ${n(bottom - corner)} A${n(corner)} ${n(corner)} 0 0 1 ${n(right - corner)} ${n(bottom)} Z`;
  return {
    line: path(d),
    surface: pathSurface(d, half),
    light: [centre, centre],
    reach: body - width / 2,
  };
}

/** Workspaces: a soft folder, big corners and a tab that flows into the body. */
function workspaces(pixels, _width, half) {
  const centre = pixels / 2;
  const height = pixels <= 64 ? even(pixels * 0.8) : pixels * 0.8;
  const top = centre - height / 2 + half;
  const bottom = centre + height / 2 - half;
  const tab = pixels <= 64 ? Math.max(Math.round(pixels * 0.13), 2) : pixels * 0.13;
  const d = softPoly(
    [
      [half, top],
      [centre - pixels * 0.04, top],
      [centre + pixels * 0.14, top + tab],
      [pixels - half, top + tab],
      [pixels - half, bottom],
      [half, bottom],
    ],
    pixels * 0.16,
  );
  return {
    line: path(d),
    surface: pathSurface(d, half),
    light: [centre, centre],
    reach: height * 0.3,
  };
}

/** Code: two brackets around the point, on a plate with no line along its top and bottom. */
function code(pixels, _width, half) {
  const centre = pixels / 2;
  const reachY = (pixels <= 64 ? Math.round(pixels * 0.47) : pixels * 0.46) - half;
  const inner = half + reachY * 0.72;
  const bracket = (x, tip) =>
    softPoly(
      [
        [x, centre - reachY],
        [tip, centre],
        [x, centre + reachY],
      ],
      pixels * 0.05,
      false,
    );
  const hull = softPoly(
    [
      [half, centre],
      [inner, centre - reachY],
      [pixels - inner, centre - reachY],
      [pixels - half, centre],
      [pixels - inner, centre + reachY],
      [inner, centre + reachY],
    ],
    pixels * 0.04,
  );
  return {
    line: path(`${bracket(inner, half)} ${bracket(pixels - inner, pixels - half)}`),
    surface: pathSurface(hull, half),
    light: [centre, centre],
    reach: pixels * 0.24,
  };
}

/** Runs: the play shape, the point where its inner circle sits. */
function runs(pixels, width, half) {
  const centre = pixels / 2;
  const span = pixels <= 64 ? even(pixels * 0.88) : pixels * 0.88;
  const top = centre - span / 2;
  const depth = span * 0.84;
  const inner = (span * depth) / (span + 2 * Math.hypot(depth, span / 2));
  const left = centre - inner;
  const d = softPoly(
    [
      [left, top],
      [left + depth, centre],
      [left, pixels - top],
    ],
    pixels * 0.15,
  );
  return {
    line: path(d),
    surface: pathSurface(d, half),
    light: [centre, centre],
    reach: inner - width,
  };
}

/** Ask: a spark, four tips and hollow sides around the point. */
function ask(pixels, _width, half) {
  const centre = pixels / 2;
  const reachOut = pixels / 2 - half;
  const waist = pixels * 0.12;
  const tipOut = reachOut + 0.136 * (reachOut - pixels * 0.12);
  const tips = [
    [centre, centre - tipOut],
    [centre + tipOut, centre],
    [centre, centre + tipOut],
    [centre - tipOut, centre],
  ];
  const bends = [
    [centre + waist, centre - waist],
    [centre + waist, centre + waist],
    [centre - waist, centre + waist],
    [centre - waist, centre - waist],
  ];
  const near = (tip, bend) => [
    tip[0] + (bend[0] - tip[0]) * 0.24,
    tip[1] + (bend[1] - tip[1]) * 0.24,
  ];
  const start = near(tips[0], bends[0]);
  const sides = [1, 2, 3, 0].map((tip, index) => {
    const into = near(tips[tip], bends[index]);
    const out = near(tips[tip], bends[tip]);
    return `Q${n(bends[index][0])} ${n(bends[index][1])} ${n(into[0])} ${n(into[1])} Q${n(tips[tip][0])} ${n(tips[tip][1])} ${n(out[0])} ${n(out[1])}`;
  });
  const d = `M${n(start[0])} ${n(start[1])} ${sides.join(" ")} Z`;
  return {
    line: path(d),
    surface: pathSurface(d, half),
    light: [centre, centre],
    reach: pixels * 0.2,
  };
}

/** Every Halonic app that has an icon (the kit's `appLogoIds`), and how its figure is drawn. */
export const figures = { studio, messenger, inbox, workspaces, code, runs, ask };

const area = (pixels) =>
  `maskUnits="userSpaceOnUse" x="0" y="0" width="${pixels}" height="${pixels}"`;
const joins = 'stroke-linejoin="round" stroke-linecap="round"';

/** The masks every icon shares: the surface itself, and a hairline just inside its edge. */
function masks(pixels, surface) {
  const rimWidth = pixels >= 128 ? pixels / 128 : 1;
  return `<mask id="base" ${area(pixels)}>${surface(0, "#fff")}</mask><mask id="rimMask" ${area(pixels)}>${surface(0, "#fff")}${surface(-rimWidth, "#000")}</mask>`;
}

/** The gradients: the ink glass, the point's halo, the line, its sheen and the rim. */
function gradients(pixels) {
  const at = (share) => n(pixels * share);
  return [
    `<radialGradient id="ink" gradientUnits="userSpaceOnUse" cx="${at(0.5)}" cy="${at(0.2)}" r="${at(0.9)}"><stop offset="0" stop-color="#17285a"/><stop offset="0.5" stop-color="#0a1630"/><stop offset="1" stop-color="#030712"/></radialGradient>`,
    `<radialGradient id="wash" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="${blue.glow}" stop-opacity="0.15"/><stop offset="1" stop-color="${blue.glow}" stop-opacity="0"/></radialGradient>`,
    `<linearGradient id="line" gradientUnits="userSpaceOnUse" x1="${at(0.12)}" y1="${at(0.88)}" x2="${at(0.88)}" y2="${at(0.12)}"><stop offset="0" stop-color="${blue.a}"/><stop offset="1" stop-color="${blue.b}"/></linearGradient>`,
    `<linearGradient id="sheen" gradientUnits="userSpaceOnUse" x1="${at(0.3)}" y1="${at(0.75)}" x2="${at(0.8)}" y2="${at(0.1)}"><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity="0.5"/></linearGradient>`,
    `<linearGradient id="rim" gradientUnits="userSpaceOnUse" x1="0" y1="0" x2="0" y2="${pixels}"><stop offset="0" stop-color="#fff" stop-opacity="0.4"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.08"/><stop offset="1" stop-color="#fff" stop-opacity="0.16"/></linearGradient>`,
  ].join("");
}

/** The line of light: from 32 px a wide and a tight bloom under it and a sheen over it. */
function lineOfLight(line, pixels, width) {
  const core = line(`fill="none" stroke="url(#line)" stroke-width="${n(width)}" ${joins}`);
  if (pixels < 32) {
    return core;
  }
  const wide = `<g filter="url(#bloomWide)" opacity="0.3">${line(`fill="none" stroke="${blue.glow}" stroke-width="${n(width * 1.2)}" ${joins}`)}</g>`;
  const tight = `<g filter="url(#bloomTight)" opacity="0.6">${core}</g>`;
  const sheen = line(`fill="none" stroke="url(#sheen)" stroke-width="${n(width)}" ${joins}`);
  return `${wide}${tight}${core}${sheen}`;
}

/** The point of light: from 32 px in its halo, glowing. */
function pointOfLight(shape, pixels, radius) {
  const [cx, cy] = shape.light;
  const dot = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(radius)}" fill="#fff"/>`;
  if (pixels < 32) {
    return dot;
  }
  const wash = `<circle cx="${n(cx)}" cy="${n(cy)}" r="${n(shape.reach)}" fill="url(#wash)"/>`;
  return `${wash}<g filter="url(#pol)">${dot}</g>`;
}

/**
 * One app's icon at `pixels`, dark and in Halonic blue, as an SVG string. With a `title`, the SVG
 * names itself, as a file in the repo must; without one it is the designer's string to the byte.
 */
export function darkBlueIconSvg(app, pixels, title) {
  const width = table(lineWidth, pixels, 0.066);
  // Code's plate has no line along its top and bottom, so its bezel never shrinks to nothing.
  const inset = Math.max(table(lineInset, pixels, 0.045), app === "code" ? 1 : 0);
  const shape = figures[app](pixels, width, inset + width / 2);
  const radius = pointRadius(pixels, shape.light[0]);
  const defs = [
    gradients(pixels),
    blurFilter("bloomWide", pixels, Math.max(width * 1.9, 2)),
    blurFilter("bloomTight", pixels, Math.max(width * 0.55, 0.8)),
    masks(pixels, shape.surface),
    glowFilter("pol", pixels, pointGlow(radius * 3.2)),
  ].join("");
  const rim =
    pixels >= 40
      ? `<rect width="${pixels}" height="${pixels}" fill="url(#rim)" mask="url(#rimMask)"/>`
      : "";
  const body = `${shape.surface(0, "url(#ink)")}${rim}<g mask="url(#base)">${lineOfLight(shape.line, pixels, width)}${pointOfLight(shape, pixels, radius)}</g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${pixels}" height="${pixels}" viewBox="0 0 ${pixels} ${pixels}"`;
  const content = `<defs>${defs}</defs>${body}</svg>`;
  if (title === undefined) {
    return `${svg}>${content}`;
  }
  return `${svg} role="img"><title>${title}</title>${content}`;
}
