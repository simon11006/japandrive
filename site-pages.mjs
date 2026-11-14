import { countryProfile } from "./country-profiles.mjs";
import { t } from "./i18n.mjs";

export const escapeHtml = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function normalizeSiteUrl(value = "") {
  if (!value.trim()) return "";
  const u = new URL(value);
  if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash)
    throw Error(
      "SITE_URL must be an HTTPS base URL without credentials, query or fragment",
    );
  return u.href.replace(/\/+$/, "") + "/";
}
const COPY = {
  ko: {
    title: "KEEP LEFT · 일본·호주·뉴질랜드 좌측통행 운전 게임",
    description:
      "일본, 호주, 뉴질랜드의 실제 도로 형태를 바탕으로 만든 짧은 운전 코스. 프리우스와 알파드를 골라 내비게이션을 따라 달리고 주차하세요. 설치 없이 즐기는 한국어·영어 웹게임.",
    eyebrow: "왼쪽으로 떠나는 작은 여행",
    headline: "낯선 길도,<br><em>왼쪽으로.</em>",
    lede: "복잡한 도시부터 조용한 해안 마을까지.<br>한 번에 10분 이내, 새로운 길에 익숙해지는 드라이브.",
    play: "무료로 플레이",
    browse: "코스 둘러보기",
    beta: "개발 중인 테스트 버전",
    image: "실제 게임 플레이 화면 — 우핸들 운전석과 교차로",
    countries: "개국",
    courses: "개 코스",
    minutes: "분 이내 예상",
    choose: "국경보다, 달리고 싶은 길.",
    chooseText:
      "국가 선택 단계 없이 코스를 고르세요. 나라와 지역, 예상 시간과 별점이 함께 보입니다.",
    all: "전체 코스",
    select: "이 코스 선택",
    time: "분",
    difficulty: "난이도",
    featuresTitle: "출발에서 주차까지, 하나의 드라이브.",
    features: [
      [
        "01",
        "왼쪽 차로를 찾는 감각",
        "교차로에서 좌회전하고, 대향차를 기다린 뒤 우회전하세요. 횡단보도에서는 보행자에게 양보합니다.",
      ],
      [
        "02",
        "두 차량, 다른 시야",
        "프리우스와 알파드의 차폭과 눈높이 차이를 느껴 보세요. 사이드미러와 후방카메라로 주차를 마무리합니다.",
      ],
      [
        "03",
        "내 속도로, 내 난이도로",
        "한산·보통·혼잡 중 교통량을 고르세요. 안전운전 점수를 쌓고 완료 후 잘한 점과 개선할 점을 확인합니다.",
      ],
    ],
    devices: "키보드로도. 터치로도.",
    deviceText:
      "PC는 방향키로 가속·제동·조향. 정차 중 브레이크를 누른 채 R로 전후진을 전환하고 B로 파킹을 조작하세요. 스마트폰·태블릿은 화면 버튼과 가로 전체화면을 이용할 수 있습니다.",
    scopeTitle: "짧은 코스, 분명한 재현 범위.",
    scopeText:
      "도로와 건물 윤곽은 OpenStreetMap 기반입니다. 교통·신호 주기·주차면과 건물 외관은 연습을 위해 구성했습니다. 호주·뉴질랜드 코스의 지형 높이는 평탄화했습니다. 표시 시간은 교통량과 운전 방식에 따라 달라질 수 있습니다.",
    scopeNote:
      "일본·호주·뉴질랜드의 모든 운전 규칙을 다루는 교육 과정은 아닙니다. 실제 운전 전에는 현지 도로 규칙을 확인하세요. 최신 WebGL 지원 브라우저와 그래픽 가속이 필요합니다.",
    ready: "다음 모퉁이에서 만나요.",
    faqTitle: "플레이 전에 궁금한 점",
    faqs: [
      [
        "설치하거나 가입해야 하나요?",
        "아니요. 브라우저에서 무료로 플레이할 수 있으며 회원가입은 필요하지 않습니다.",
      ],
      [
        "실제 목적지까지 몇 시간씩 운전하나요?",
        "아니요. 실제 도로 형태에서 짧은 구간을 골랐습니다. 모든 코스의 예상 소요 시간은 10분 이내이며, 정체나 주차에 따라 실제 플레이 시간은 더 길어질 수 있습니다.",
      ],
      [
        "모바일에서도 할 수 있나요?",
        "터치 조작을 지원하며 가로 화면을 권장합니다. 기기 성능에 따라 속도가 달라집니다. 일부 iPhone·iPad는 Safari에서 홈 화면에 추가한 뒤 전체화면으로 실행할 수 있습니다.",
      ],
    ],
    credit:
      "지도: © OpenStreetMap 기여자 · 일부 일본 지형·항공사진: 국토지리원",
    back: "게임으로",
    source: "프로젝트",
    lang: "언어",
    courseCount: (n) => `${n}개의 짧은 드라이브`,
  },
  en: {
    title:
      "KEEP LEFT · Left-side driving game in Japan, Australia & New Zealand",
    description:
      "Play short driving courses based on real roads in Japan, Australia and New Zealand. Choose a Prius or Alphard, follow navigation and park. A free browser game in English and Korean.",
    eyebrow: "SMALL JOURNEYS. A DIFFERENT SIDE.",
    headline: "New roads.<br><em>Keep left.</em>",
    lede: "From busy city blocks to quiet coastal towns.<br>Get familiar with the left side, one short drive at a time.",
    play: "Play for free",
    browse: "Explore courses",
    beta: "Test version · in development",
    image:
      "Actual gameplay — a right-hand-drive cockpit approaching a junction",
    countries: "countries",
    courses: "courses",
    minutes: "min estimated maximum",
    choose: "Pick a road. Find your rhythm.",
    chooseText:
      "Choose a course directly. Each card shows its country, location, estimated duration and difficulty.",
    all: "All courses",
    select: "Choose this course",
    time: "min",
    difficulty: "Difficulty",
    featuresTitle: "One drive. All the way to parking.",
    features: [
      [
        "01",
        "Build a feel for the left lane",
        "Turn left, wait for oncoming traffic before turning right, and give people time to cross.",
      ],
      [
        "02",
        "Two cars. A different perspective.",
        "Try the Prius and Alphard to experience different widths and eye heights. Use the door mirrors and reversing camera to park.",
      ],
      [
        "03",
        "Find your own pace",
        "Choose light, normal or busy traffic. Earn points for safe driving and review your strengths and areas to improve.",
      ],
    ],
    devices: "Keys or touch. Your choice.",
    deviceText:
      "On a computer, use the arrow keys to accelerate, brake and steer. Hold the brake while stopped, then press R to switch drive/reverse or B for parking hold. Phones and tablets have touch controls and a landscape fullscreen option.",
    scopeTitle: "Short courses. An honest view of the world.",
    scopeText:
      "Roads and building footprints come from OpenStreetMap. Traffic, signal timing, parking bays and building appearances are practice scenery. Elevation is flattened in Australian and New Zealand courses. Estimated times vary with traffic and driving style.",
    scopeNote:
      "This is not a complete driving course or a substitute for the local road code. Check local rules before driving in real life. A recent WebGL-capable browser with graphics acceleration is required.",
    ready: "See you at the next corner.",
    faqTitle: "Before you set off",
    faqs: [
      [
        "Do I need to install anything or sign up?",
        "No. Play for free in your browser, with no account required.",
      ],
      [
        "Will a drive take hours in real time?",
        "No. Courses use short sections of real road layouts. All estimated durations are within 10 minutes; queues and parking can make actual play take longer.",
      ],
      [
        "Can I play on my phone?",
        "Yes, touch controls are available. Landscape mode is recommended and performance depends on your device. On some iPhones and iPads, use Safari’s Add to Home Screen to play fullscreen.",
      ],
    ],
    credit:
      "Map: © OpenStreetMap contributors · Some Japanese elevation and aerial imagery: GSI Japan",
    back: "Play",
    source: "Project",
    lang: "Language",
    courseCount: (n) => `${n} short drives`,
  },
};
function routeSvg(course) {
  const coords = course.preview || [],
    xs = coords.map((p) => p[0]),
    ys = coords.map((p) => p[1]);
  const lat = (course.origin[1] * Math.PI) / 180,
    cos = Math.cos(lat),
    xmin = Math.min(...xs),
    xmax = Math.max(...xs),
    ymin = Math.min(...ys),
    ymax = Math.max(...ys);
  const scale = Math.min(
    240 / ((xmax - xmin) * cos || 1),
    130 / (ymax - ymin || 1),
  );
  const points = coords.map(([x, y]) => [
    160 + (x - (xmin + xmax) / 2) * cos * scale,
    88 - (y - (ymin + ymax) / 2) * scale,
  ]);
  const path = points
      .map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`)
      .join(" "),
    a = points[0] || [0, 0],
    z = points.at(-1) || a;
  return `<svg viewBox="0 0 320 176" aria-hidden="true"><path class="map-grid" d="M0 44H320M0 88H320M0 132H320M80 0V176M160 0V176M240 0V176"/><path class="route-shadow" d="${path}"/><path class="route-line" d="${path}"/><circle cx="${a[0]}" cy="${a[1]}" r="5" class="route-start"/><circle cx="${z[0]}" cy="${z[1]}" r="5" class="route-end"/></svg>`;
}
export function seoHead({
  lang,
  title,
  description,
  siteUrl = "",
  verification = "",
  preview = false,
  path = `${lang}/`,
}) {
  const base = normalizeSiteUrl(siteUrl),
    e = escapeHtml;
  const url = base ? new URL(path, base).href : "",
    image = base ? new URL("screenshots/drive-world-014.jpg", base).href : "";
  return `<meta name="description" content="${e(description)}">
<meta name="robots" content="${preview ? "noindex,follow" : "index,follow,max-image-preview:large"}">
<meta property="og:type" content="website"><meta property="og:site_name" content="KEEP LEFT">
<meta property="og:title" content="${e(title)}"><meta property="og:description" content="${e(description)}"><meta property="og:locale" content="${lang === "ko" ? "ko_KR" : "en_US"}">
<meta name="twitter:card" content="summary_large_image">
${
  base
    ? `<link rel="canonical" href="${e(url)}"><meta property="og:url" content="${e(url)}"><meta property="og:image" content="${e(image)}"><meta property="og:image:alt" content="KEEP LEFT gameplay">
${["ko", "en"].map((l) => `<link rel="alternate" hreflang="${l}" href="${e(new URL(l + "/", base).href)}">`).join("\n")}
<link rel="alternate" hreflang="x-default" href="${e(new URL("en/", base).href)}">`
    : ""
}
${verification ? `<meta name="google-site-verification" content="${e(verification)}">` : ""}`;
}
export function renderLanding({
  lang = "ko",
  courses,
  siteUrl = "",
  verification = "",
  preview = false,
}) {
  const c = COPY[lang],
    e = escapeHtml,
    base = normalizeSiteUrl(siteUrl),
    play = `../?lang=${lang}`;
  const schema = {
    "@context": "https://schema.org",
    "@type": "VideoGame",
    name: "KEEP LEFT",
    description: c.description,
    inLanguage: ["ko", "en"],
    genre: "Driving simulation",
    gamePlatform: "Web browser",
    isAccessibleForFree: true,
    playMode: "SinglePlayer",
    ...(base
      ? {
          url: new URL(lang + "/", base).href,
          image: new URL("screenshots/drive-world-014.jpg", base).href,
        }
      : {}),
  };
  const cards = courses
    .map((course) => {
      const name = t(course.name, lang),
        where = `${lang === "en" ? countryProfile(course.country).english : countryProfile(course.country).name} · ${t(course.region, lang)}`;
      return `<article class="road-card" data-country="${course.country}"><div class="route-art">${routeSvg(course)}<span>${e(t(course.category, lang))}</span></div><div class="road-body"><p class="place">${e(where)}</p><h3>${e(name)}</h3><div class="road-stats"><b>${course.minutes.join("–")} ${c.time}</b><span aria-label="${c.difficulty} ${course.stars} / 5">${"★".repeat(course.stars)}<i>${"☆".repeat(5 - course.stars)}</i></span></div><p class="road-features">${course.features
        .slice(0, 3)
        .map((f) => e(t(f, lang)))
        .join(
          " · ",
        )}</p><a href="${play}&amp;course=${encodeURIComponent(course.id)}">${c.select}<span aria-hidden="true">↗</span></a></div></article>`;
    })
    .join("");
  return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#101a23"><title>${e(c.title)}</title>${seoHead({ lang, title: c.title, description: c.description, siteUrl, verification, preview })}<link rel="icon" href="../app-icon.svg" type="image/svg+xml"><link rel="stylesheet" href="../landing.css"><script type="application/ld+json">${JSON.stringify(schema).replace(/</g, "\\u003c")}</script></head><body>
<a class="skip-link" href="#courses">${c.browse}</a><header class="site-header"><a class="wordmark" href="./">KEEP LEFT<span>DRIVING EXPERIENCE</span></a><nav aria-label="${c.lang}"><a href="../ko/" lang="ko" ${lang === "ko" ? 'aria-current="page"' : ""}>한국어</a><a href="../en/" lang="en" ${lang === "en" ? 'aria-current="page"' : ""}>English</a><a class="nav-play" href="${play}">${c.back} ↗</a></nav></header>
<main><section class="landing-hero"><img class="hero-shot" src="../screenshots/drive-world-014.jpg" width="1440" height="900" alt="${e(c.image)}" fetchpriority="high"><div class="hero-shade"></div><div class="hero-copy"><p class="eyebrow">${c.eyebrow}</p><h1>${c.headline}</h1><p class="lede">${c.lede}</p><div class="hero-actions"><a class="cta" href="${play}">${c.play} <span>→</span></a><a class="quiet-link" href="#courses">${c.browse} ↓</a></div><small class="beta"><i></i>${c.beta}</small></div><div class="hero-caption">IN-GAME FOOTAGE / KEEP LEFT</div></section>
<div class="quick-facts"><div><strong>03</strong><span>${c.countries}</span></div><div><strong>${courses.length}</strong><span>${c.courses}</span></div><div><strong>10</strong><span>${c.minutes}</span></div><div class="fact-note">JAPAN / AUSTRALIA / NEW ZEALAND</div></div>
<section id="courses" class="section courses-section"><div class="section-heading"><div><p class="eyebrow">CHOOSE YOUR DRIVE</p><h2>${c.choose}</h2><p>${c.chooseText}</p></div><span class="course-count">${c.courseCount(courses.length)}</span></div><div class="road-grid">${cards}</div></section>
<section class="section experience"><p class="eyebrow">THE DRIVE</p><h2>${c.featuresTitle}</h2><div class="feature-grid">${c.features.map(([n, title, body]) => `<article><span class="feature-number">${n}</span><h3>${title}</h3><p>${body}</p></article>`).join("")}</div></section>
<section class="section details-section"><div><p class="eyebrow">PLAY YOUR WAY</p><h2>${c.devices}</h2><p>${c.deviceText}</p><div class="key-art" aria-hidden="true"><span>←</span><span>↑<br>↓</span><span>→</span><b>R</b><b>B</b></div></div><div class="scope"><h3>${c.scopeTitle}</h3><p>${c.scopeText}</p><p>${c.scopeNote}</p></div></section>
<section class="section faq"><h2>${c.faqTitle}</h2>${c.faqs.map(([q, a]) => `<details><summary>${q}</summary><p>${a}</p></details>`).join("")}</section><section class="final-invite"><h2>${c.ready}</h2><a class="cta" href="${play}">${c.play} <span>→</span></a></section></main>
<footer class="site-footer"><strong>KEEP LEFT</strong><p>${c.credit}</p><a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a><a href="https://github.com/simon11006/japandrive">${c.source} ↗</a></footer></body></html>`;
}
export function renderSitemap(siteUrl) {
  const base = normalizeSiteUrl(siteUrl);
  if (!base) return null;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">${["ko/", "en/"].map((path) => `<url><loc>${escapeHtml(new URL(path, base).href)}</loc>${["ko", "en", "x-default"].map((lang) => `<xhtml:link rel="alternate" hreflang="${lang}" href="${escapeHtml(new URL((lang === "ko" ? "ko" : "en") + "/", base).href)}"/>`).join("")}</url>`).join("")}</urlset>\n`;
}
export function renderRobots(siteUrl = "", preview = false) {
  const base = normalizeSiteUrl(siteUrl),
    prefix = base ? new URL(base).pathname : "/";
  return `User-agent: *\n${preview ? "Disallow: /" : `Allow: /\nDisallow: ${prefix}tests/\nDisallow: ${prefix}scripts/\nDisallow: ${prefix}data/course-sources/`}${base && !preview ? "\nSitemap: " + new URL("sitemap.xml", base).href : ""}\n`;
}
