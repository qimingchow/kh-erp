const iconPaths = {
  dashboard: "M4 12h6V4H4v8Zm0 8h6v-6H4v6Zm10 0h6V10h-6v10Zm0-18v6h6V2h-6Z",
  inbox: "M4 5h16v10h-4l-2 3H10l-2-3H4V5Zm4 5h8",
  boxes: "M4 7 12 3l8 4-8 4-8-4Zm0 0v10l8 4 8-4V7",
  truck: "M3 7h11v8H3V7Zm11 3h4l3 3v2h-7v-5Zm-8 8a2 2 0 1 0 0.001 4.001A2 2 0 0 0 6 18Zm10 0a2 2 0 1 0 0.001 4.001A2 2 0 0 0 16 18Z",
  clock: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Zm0-15v5l3 2",
  calendar: "M8 2v3M16 2v3M3 7h18M5 5h14v15H5V5Zm3 6h3m0 0h3m0 0h3",
  monitor: "M4 6h16v10H4V6Zm4 12h8M10 16v2",
  landmark: "M3 10h18M6 10v8m4-8v8m4-8v8m4-8v8M3 18h18M12 3 3 8h18L12 3Z",
  users: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 21a8 8 0 0 1 16 0M19 8a3 3 0 0 1 0 6m2 7a6 6 0 0 0-4-5.65",
  sparkle: "M12 3 13.9 8.1 19 10 13.9 11.9 12 17 10.1 11.9 5 10 10.1 8.1 12 3Zm6 10 1 2.5L21 16l-2.5 1-1 2.5-1-2.5L14 16l2.5-1 1-2.5Z",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v10m0 0 4-4m-4 4-4-4M5 21h14",
  refresh: "M20 11A8 8 0 1 0 21 16h-4m4-5V7",
  search: "M11 19a8 8 0 1 1 5.657-13.657A8 8 0 0 1 11 19Zm5-3 5 5",
  bell: "M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9Zm-4 11a2 2 0 0 1-4 0",
  help: "M12 18h.01M9.1 9a3 3 0 1 1 5.3 1.94c-.9.58-1.4 1.22-1.4 2.06M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5a7.7 7.7 0 0 0-.07-1l2-1.55-2-3.46-2.35.95a8.6 8.6 0 0 0-1.73-1L15.5 3h-4l-.35 2.94a8.6 8.6 0 0 0-1.73 1L7.07 5.99l-2 3.46 2 1.55a7.7 7.7 0 0 0 0 2l-2 1.55 2 3.46 2.35-.95a8.6 8.6 0 0 0 1.73 1L11.5 21h4l.35-2.94a8.6 8.6 0 0 0 1.73-1l2.35.95 2-3.46-2-1.55c.05-.33.07-.66.07-1Z",
  menu: "M4 7h16M4 12h16M4 17h16",
  check: "M20 6 9 17l-5-5",
  warning: "M12 3 2 21h20L12 3Zm0 7v4m0 3h.01",
  chart: "M4 19V5m0 14h16M8 16v-5m4 5V8m4 8v-9",
  play: "M8 5v14l11-7L8 5Z",
  pause: "M7 5h4v14H7V5Zm6 0h4v14h-4V5Z",
  tool: "M14.7 6.3a4 4 0 0 0-5 5L4 17l3 3 5.7-5.7a4 4 0 0 0 5-5l-3.1 3.1-2.9-2.9 3-3Z",
  upload: "M12 21V11m0 0-4 4m4-4 4 4M5 7h14",
  arrow: "M5 12h14m-6-6 6 6-6 6",
};

export function icon(name) {
  const path = iconPaths[name] || iconPaths.arrow;
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="${path}"></path>
    </svg>
  `;
}
