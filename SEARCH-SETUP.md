# 검색 노출 준비

현재 공식 주소는 미정입니다. Google Search Console 등록이나 색인 요청은 실행하지 않았습니다. 검색 노출·순위는 보장되지 않습니다.

## 준비한 것

- `/ko/`와 `/en/`: 서버에서 바로 읽을 수 있는 한국어·영어 HTML, 개별 제목·설명, 명시적인 언어 전환 링크, 플레이·코스 링크.
- 모바일 레이아웃, 실제 게임 스크린샷, 공유용 Open Graph 메타데이터, 사실에 근거한 `VideoGame` JSON-LD. 별점은 코스 난이도이며 리뷰 평점으로 등록하지 않습니다.
- `robots.txt`, 대표 주소(canonical), 상호 `hreflang`, XML 사이트맵 생성기.
- Netlify deploy preview는 `noindex` 처리. 개발 테스트와 지도 원자료는 정적 배포에서 제외.

공식 주소가 비어 있는 동안에는 **canonical·hreflang·sitemap.xml에 임의 주소를 넣지 않습니다**. 소개 페이지와 내부 언어 링크는 정상 작동합니다. 라이브 HTML은 기본적으로 색인을 허용하지만 현재 공개 주소를 공식 대표 주소로 지정한 것은 아닙니다.

## 공식 주소를 정한 뒤

1. `site.config.json`의 `siteUrl`에 HTTPS 기본 주소를 입력하거나 배포 환경 변수 `SITE_URL`을 설정합니다. 경로가 있는 주소도 지원합니다. Netlify 자동 `URL` 값을 공식 주소로 간주하지 않습니다.
2. Search Console에서 직접 발급한 소유 확인 토큰을 `searchConsoleVerification` 또는 `GOOGLE_SITE_VERIFICATION`에 입력할 수 있습니다. 토큰을 임의로 생성하지 않습니다. DNS 소유 확인을 사용하면 이 값은 불필요합니다.
3. 다시 배포합니다. Netlify는 `netlify.toml`에 지정한 명령을 사용하고, GitHub Pages는 저장소 변수 `SITE_URL`, `GOOGLE_SITE_VERIFICATION`을 사용할 수 있습니다. 두 배포가 같은 `site.config.json`을 사용하면 canonical도 같은 공식 주소로 통일됩니다.
4. 실제 대표 사이트의 두 소개 페이지, canonical·hreflang, `robots.txt`와 `sitemap.xml`을 확인합니다. Search Console에서 소유 확인 후 사이트맵 제출·URL 검사를 진행합니다.
5. 대표 주소가 확정되면 다른 공개 주소는 필요에 따라 리디렉션하거나 보조 테스트 배포로 운영합니다. 이번 변경에서 기존 GitHub Pages나 Netlify 배포를 중단하지 않았습니다.

## 로컬/빌드 확인

```text
node scripts/build-site.mjs --pages-only
node server.mjs
# http://127.0.0.1:8000/ko/ 와 /en/
node scripts/build-site.mjs
node --test tests/site-pages.test.mjs tests/world-courses.test.mjs
```

`_site`는 생성 산출물입니다. Netlify는 기존 Git 연결을 유지하며 이 폴더를 배포합니다. 실제 Netlify 주소·계정 상태는 저장소에서 확인할 수 없으므로 배포 결과는 Netlify 대시보드에서도 확인해야 합니다.

## 기준 자료

- [Google: 다국어 페이지의 별도 URL·hreflang](https://developers.google.com/search/docs/specialty/international/managing-multi-regional-sites)
- [Google: 대표 URL](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)
- [Google: 절대 주소를 사용하는 사이트맵](https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap)
- [NSW: 신호와 회전](https://www.nsw.gov.au/driving-boating-and-transport/driving-nsw/roads-safety-and-rules/stopping-giving-way-turning/traffic-lights)
- [NSW: 제한속도](https://www.nsw.gov.au/driving-boating-and-transport/driving-nsw/roads-safety-and-rules/safe-driving/speed-limits-and-cameras/speed-limits)
- [NZTA: 방문 운전자](https://www.nzta.govt.nz/travelling-on-our-roads/visitors-and-new-residents/visiting-new-zealand)
- [NZTA: 양보·신호 규칙](https://www.nzta.govt.nz/driving-skills/learn-to-drive/roadcode/general-road-code/about-driving/giving-way/the-give-way-rules)
- [OpenStreetMap 저작자 표시와 라이선스](https://www.openstreetmap.org/copyright)

원자료 파일의 `survey.url`, `bbox`, `retrievedAt`에 지도 출처와 조회 범위를 보존합니다. 국가 이름만 바꾼 일본 도로가 아닙니다. 모든 외벽·표고·시설의 현장 일치를 뜻하지는 않습니다.
