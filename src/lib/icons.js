const iconPaths = {
  dashboard: "M4 12h6V4H4v8Zm0 8h6v-6H4v6Zm10 0h6V10h-6v10Zm0-18v6h6V2h-6Z",
  inbox: "M4 5h16v10h-4l-2 3H10l-2-3H4V5Zm4 5h8",
  boxes: "M4 7 12 3l8 4-8 4-8-4Zm0 0v10l8 4 8-4V7",
  truck: "M3 7h11v8H3V7Zm11 3h4l3 3v2h-7v-5Zm-8 8a2 2 0 1 0 0.001 4.001A2 2 0 0 0 6 18Zm10 0a2 2 0 1 0 0.001 4.001A2 2 0 0 0 16 18Z",
  calendar: "M8 2v3M16 2v3M3 7h18M5 5h14v15H5V5Zm3 6h3m0 0h3m0 0h3",
  monitor: "M4 6h16v10H4V6Zm4 12h8M10 16v2",
  landmark: "M3 10h18M6 10v8m4-8v8m4-8v8m4-8v8M3 18h18M12 3 3 8h18L12 3Z",
  users: "M16 11a4 4 0 1 0-8 0 4 4 0 0 0 8 0ZM4 21a8 8 0 0 1 16 0M19 8a3 3 0 0 1 0 6m2 7a6 6 0 0 0-4-5.65",
  sparkle: "M12 3 13.9 8.1 19 10 13.9 11.9 12 17 10.1 11.9 5 10 10.1 8.1 12 3Zm6 10 1 2.5L21 16l-2.5 1-1 2.5-1-2.5L14 16l2.5-1 1-2.5Z",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v10m0 0 4-4m-4 4-4-4M5 21h14",
  refresh: "M20 11A8 8 0 1 0 21 16h-4m4-5V7",
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
