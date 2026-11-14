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
export function signalAppearance(country='JP',region='') {
  const snow=country==='JP'&&/sapporo|삿포로|홋카이도/i.test(region);
  return {vertical:country!=='JP'||snow,backboard:country!=='JP',threeArrows:country!=='JP',
    housing:country==='JP'?'#adb6b8':'#171c20',pole:country==='NZ'?'#e6b62c':'#737e80',snow};
}
export function signalLensPositions(country = "JP",region='') {
  // Kept in green/yellow/red order for the shared traffic controller.
  return signalAppearance(country,region).vertical
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
