// Only the road systems represented by the bundled courses are included.
export const COUNTRIES = Object.freeze({
  JP: {
    name: "일본",
    english: "Japan",
    signalLayout: "horizontal",
    stopShape: "triangle",
    stopText: "止まれ",
    crossing: "zebra",
    urbanLimit: null,
  },
  AU: {
    name: "호주",
    english: "Australia",
    signalLayout: "vertical",
    stopShape: "octagon",
    stopText: "STOP",
    crossing: "parallel",
    urbanLimit: 50,
  },
  NZ: {
    name: "뉴질랜드",
    english: "New Zealand",
    signalLayout: "vertical",
    stopShape: "octagon",
    stopText: "STOP",
    crossing: "parallel",
    urbanLimit: 50,
  },
});
export const countryProfile = (code = "JP") => COUNTRIES[code] || COUNTRIES.JP;
export const courseLocation = (course) =>
  `${countryProfile(course?.country).name} · ${course?.region || ""}`;
export function signalLensPositions(country = "JP") {
  // Kept in green/yellow/red order for the shared traffic controller.
  return countryProfile(country).signalLayout === "vertical"
    ? [
        [0, -0.43],
        [0, 0],
        [0, 0.43],
      ]
    : [
        [-0.43, 0],
        [0, 0],
        [0.43, 0],
      ];
}
