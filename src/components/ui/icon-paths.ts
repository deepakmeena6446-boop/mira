/**
 * Mira's line-icon set as plain data (24 px grid, round caps), so the same glyphs render in React
 * (<Icon>) and in DOM-only places such as MapLibre pins (iconSvg). System UI uses these, never emoji.
 */
type El = ["path", string] | ["circle", number, number, number] | ["rect", number, number, number, number, number];

export const ICONS: Record<string, El[]> = {
  home: [["path", "M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"]],
  know: [["circle", 11, 11, 7], ["path", "m20 20-3.5-3.5"]],
  search: [["circle", 11, 11, 7], ["path", "m20 20-3.5-3.5"]],
  accompany: [["circle", 12, 12, 9], ["path", "M12 7v5l3 2"]],
  report: [["path", "M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-5 4z"], ["path", "M8 8h8M8 12h5"]],
  pin: [["path", "M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12z"], ["circle", 12, 9, 2.5]],
  arrow: [["path", "M5 12h14M13 6l6 6-6 6"]],
  // Shared local knowledge: three distinct voices converging on one useful signal.
  community: [["circle", 5, 9, 2], ["circle", 19, 9, 2], ["circle", 12, 5, 2], ["path", "M2.5 18c.2-3 1.8-4.5 4-4.5M21.5 18c-.2-3-1.8-4.5-4-4.5M6.5 20c.3-4 2.2-6 5.5-6s5.2 2 5.5 6"]],
  contribute: [["circle", 5, 9, 2], ["circle", 19, 9, 2], ["circle", 12, 5, 2], ["path", "M2.5 18c.2-3 1.8-4.5 4-4.5M21.5 18c-.2-3-1.8-4.5-4-4.5M6.5 20c.3-4 2.2-6 5.5-6s5.2 2 5.5 6"]],
  info: [["circle", 12, 12, 9], ["path", "M12 11v5M12 8h.01"]],
  check: [["path", "m5 12.5 4.5 4.5L19 7.5"]],
  "check-circle": [["circle", 12, 12, 9], ["path", "m8 12.5 3 3 5-6"]],
  route: [["circle", 6, 18, 2.5], ["circle", 18, 6, 2.5], ["path", "M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"]],
  locate: [["circle", 12, 12, 3], ["path", "M12 2v3M12 19v3M2 12h3M19 12h3"], ["circle", 12, 12, 7]],
  close: [["path", "M6 6l12 12M18 6 6 18"]],
  user: [["circle", 12, 8, 4], ["path", "M4 21a8 8 0 0 1 16 0"]],
  sparkle: [["path", "M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z"]],
  share: [["path", "M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7"], ["path", "m16 6-4-4-4 4M12 2v14"]],
  send: [["path", "M4 12 20 4l-6 16-3-7-7-1Z"]],
  plus: [["path", "M12 5v14M5 12h14"]],
  flag: [["path", "M5 21V4"], ["path", "M5 4h11l-2 4 2 4H5"]],
  bell: [["path", "M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8"], ["path", "M10 20a2 2 0 0 0 4 0"]],
  lock: [["rect", 5, 11, 14, 10, 2], ["path", "M8 11V8a4 4 0 0 1 8 0v3"]],
  shield: [["path", "M12 3 4 6v6c0 5 3.5 8 8 9 4.5-1 8-4 8-9V6l-8-3Z"]],
  trash: [["path", "M4 7h16M10 11v6M14 11v6"], ["path", "M6 7l1 13h10l1-13M9 7V4h6v3"]],
  chevron: [["path", "m9 6 6 6-6 6"]],
  back: [["path", "m15 6-6 6 6 6"]],
  walk: [["circle", 13, 4, 2], ["path", "m9 21 2-6 3 3v3M7 12l3-4 4 1 3 3M11 15l-1-5"]],
  clock: [["circle", 12, 12, 9], ["path", "M12 7v5l3 2"]],
  timer: [["circle", 12, 13, 8], ["path", "M12 9v4l2.5 1.5M9 2h6"]],
  heart: [["path", "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"]],
  phone: [["path", "M5 4h3l2 5-2.5 1.5a11 11 0 0 0 6 6L15 14l5 2v3a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"]],
  signout: [["path", "M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10"]],
  eye: [["path", "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"], ["circle", 12, 12, 3]],
  "wifi-off": [["path", "M3 3l18 18M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5-2.7M19 13a10 10 0 0 0-2.3-1.7M12 20h.01"]],
  // Help Point classes
  hospital: [["rect", 4, 4, 16, 16, 3], ["path", "M12 8v8M8 12h8"]],
  police: [["path", "M4 21V10l8-5 8 5v11"], ["path", "M9 21v-6h6v6M12 5V2l3 1-3 1"]],
  transit: [["rect", 6, 3, 12, 14, 3], ["path", "M6 11h12M9 20l-1.5 1.5M15 20l1.5 1.5M9 14h.01M15 14h.01"]],
  airport: [["path", "M10.5 19 12 21l1.5-2-.5-5 7 3v-2l-7-5V5a1 1 0 0 0-2 0v5l-7 5v2l7-3z"]],
  hotel: [["path", "M3 18V7M3 14h18v4M21 14v-2a3 3 0 0 0-3-3h-7v5"], ["circle", 7, 11, 1.5]],
  pharmacy: [["rect", 3, 8, 18, 8, 4], ["path", "M12 8v8"]],
  fuel: [["path", "M4 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16M3 21h12M4 10h10"], ["path", "M14 8h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V9l-3-3"]],
  store: [["path", "M5 8h14l-1 12H6z"], ["path", "M9 8V6a3 3 0 0 1 6 0v2"]],
  // Place kinds
  cafe: [["path", "M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"], ["path", "M17 11h1.5a2.5 2.5 0 0 1 0 5H17M8 3v3M12 3v3"]],
  food: [["path", "M7 3v8M5 3v5a2 2 0 0 0 4 0V3M7 11v10M17 21V3c-2 1-3 4-3 8h3"]],
  shop: [["path", "M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9a2.7 2.7 0 0 0 5.3 0 2.7 2.7 0 0 0 5.4 0A2.7 2.7 0 0 0 20 9"]],
  park: [["path", "M12 21v-5M12 3a5 5 0 0 0-5 5 4 4 0 0 0 1 7h8a4 4 0 0 0 1-7 5 5 0 0 0-5-5Z"]],
  school: [["path", "M2 9l10-5 10 5-10 5z"], ["path", "M6 11v5c3 2 9 2 12 0v-5"]],
  atm: [["rect", 3, 6, 18, 12, 2], ["circle", 12, 12, 2.5]],
  toilet: [["circle", 8, 5, 1.5], ["circle", 16, 5, 1.5], ["path", "M6 21v-6H5l1-6h4l1 6h-1v6M14 21V9h4v12M12 3v18"]],
  bus: [["rect", 4, 3, 16, 15, 3], ["path", "M4 11h16M7 21v-3M17 21v-3M8 14.5h.01M16 14.5h.01"]],
  work: [["rect", 3, 7, 18, 13, 2], ["path", "M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18"]],
  study: [["path", "M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"], ["path", "M4 19V5M9 7h6"]],
  star: [["path", "m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"]],
  // Report categories (conditions and events, never people)
  speech: [["path", "M4 5h16v11H9l-5 4z"], ["path", "M9 9.5h.01M12 9.5h.01M15 9.5h.01"]],
  footsteps: [["path", "M7 3c-1.7 0-3 1.9-3 4.5S5 12 7 12s3-1.9 3-4.5S8.7 3 7 3ZM5 15h4l-.5 3a1.5 1.5 0 0 1-3 0zM17 8c1.7 0 3 1.9 3 4.5S19 17 17 17s-3-1.9-3-4.5S15.3 8 17 8ZM15 20h4"]],
  hand: [["path", "M8 13V5.5a1.5 1.5 0 0 1 3 0V11M11 10V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6a1.5 1.5 0 0 1 3 0v8a7 7 0 0 1-7 7h-.5a6 6 0 0 1-4.9-2.5L2.5 14a1.5 1.5 0 0 1 2.3-2L8 15"]],
  lamp: [["path", "M9 21h6M12 21V9M8 4h8l-1.5 5h-5z"], ["path", "M7 12l-1.5 1M17 12l1.5 1"]],
  sun: [["circle", 12, 12, 4], ["path", "M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"]],
  dots: [["path", "M6 12h.01M12 12h.01M18 12h.01"]],
  bulb: [["path", "M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3Z"]],
};

export type IconName = keyof typeof ICONS;

const esc = (s: string) => s.replace(/[<>&"]/g, "");

/** The icon as an SVG string for DOM-only contexts (map pins). */
export function iconSvg(name: string, size = 16): string {
  const els = ICONS[name] ?? ICONS.pin;
  const body = els
    .map((e) =>
      e[0] === "path"
        ? `<path d="${esc(e[1])}"/>`
        : e[0] === "circle"
          ? `<circle cx="${e[1]}" cy="${e[2]}" r="${e[3]}"/>`
          : `<rect x="${e[1]}" y="${e[2]}" width="${e[3]}" height="${e[4]}" rx="${e[5]}"/>`,
    )
    .join("");
  return `<svg aria-hidden="true" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;
}
