# KEEP LEFT — 지역 풍경과 지형 자료

검토: 2026-11-15. 거리 사진을 직접 보고 지역별 건축·외벽·지붕·가로수의 특징을 자체 Three.js 모델과 캔버스 재질로 표현했습니다. 사진은 게임에 복사하거나 텍스처로 배포하지 않습니다. OSM의 도로·건물 윤곽과 등록 높이를 우선하며, 개별 상점 외관·미등록 높이·식재는 대표 형태입니다.

| 코스 | 사진에서 반영한 특징 | 거리 사진·지역 자료 |
|---|---|---|
| 시드니 | 유리 고층과 사암·벽돌 저층부, 도심 가로수 | [Pitt Street 건물 사진](https://www.realcommercial.com.au/sold/property-unit-25-level-5-88-pitt-street-sydney-nsw-2000-502961346) |
| 뉴타운 | 낮은 연속 상가, 벽돌·장식 파사드, 주택 베란다 | [Kingston Road 사진](https://www.realestate.com.au/property/88-kingston-rd-newtown-nsw-2042/), [Inner West 지역 지침](https://www.developmentcontrols.innerwest.nsw.gov.au/part-4/newtown) |
| 맨리 | 밝은 해안 상가·주택, 노퍽소나무, 실제 해안선 | [South Steyne 사진](https://www.colliers.com.au/en-au/properties/rare-beachfront-retail-investment/aus-manly-greenhouse-36-38-south-steyne-manly-nsw-2095/aus66016955), [Sydney 관광청](https://www.sydney.com/destinations/sydney/sydney-north/manly/attractions/manly-beach) |
| 카툼바 | 낮은 상가와 차양, 박공지붕, 유칼립투스와 산악 능선 | [Katoomba Street 사진](https://www.commercialrealestate.com.au/property/195c-193-198-katoomba-street-katoomba-nsw-2780-16604138) |
| 오클랜드 | 언덕 도로, 석조·장식 상가와 유리 건물의 혼합 | [도심 상가 사진](https://www.nzherald.co.nz/business/companies/retail/store-closures-prompt-rethink-over-how-and-where-retail-operates-the-front-page/NXQFGJA27VHPRI766MPP4MX5QM/) |
| 데번포트 | 목조 외벽, 빌라 베란다·박공지붕, 오래된 상가 | [Victoria Road 사진](https://devonportflagstaff.co.nz/victoria-rd-buildings-set-for-heritage-downgrade/), [지역 건축 기록](https://www.devonportheritage.net/devonport-buildings) |
| 미션베이 | 해안 공원, 포후투카와 수목, 낮은 밝은 건물과 해변 | [거리·해변 사진](https://www.tripideas.nz/place/mission-bay), [뉴질랜드 관광청](https://www.newzealand.com/int/feature/tamaki-drive-and-beaches/) |
| 퀸스타운 | 호수와 실제 주변 산맥, 편암·목재 외벽, 짙은 박공지붕 | [시가지 사진](https://rwqueenstown.co.nz/properties/commercial-for-sale/queenstown-lakes-district/queenstown-9300/commercial-land/3473825) |

맨리 코스는 해변 바로 앞만 달리는 경로가 아닙니다. 해변을 도로 옆으로 임의 이동시키지 않고 실제 해안선과 코스의 관계를 유지합니다. 퀸스타운은 OSM Lake Wakatipu 경계(relation 1636910)를 사용합니다. 수면은 약 308m 기준으로 단순화했습니다.

## 표고와 노면

해외 8개 코스의 가까운 지형은 25m 간격, 먼 지형은 125–200m 간격으로 [Mapzen Terrain Tiles](https://registry.opendata.aws/terrain-tiles/)를 재표본화해 동봉합니다. 도심의 건물 크기 잡음을 줄이는 연속 격자 필터를 적용합니다. 지형·도로·차량은 같은 높이 함수를 사용하고 주차면·요금소 주변은 완만하게 정지 작업합니다. 지형을 평평하게 만들었던 이전 버전과 다릅니다. 교량·터널의 독립 상판, 실제 옹벽·절개지와 모든 도로 종단을 실측 재현한 것은 아닙니다.

원본 타일: `data/course-sources/terrain-tiles/` (배포 제외). 재생성: `node scripts/cache-world-terrain.mjs`와 `node scripts/build-world-scenery.mjs`. 처리 결과: `data/world-terrain/`, `data/world-scenery.json`. 실행 중 지형 서버에 접속하지 않습니다.

## 저작자와 이용 조건

- 지도·건물·해안·호수: **© OpenStreetMap contributors**, [ODbL 및 저작권 안내](https://www.openstreetmap.org/copyright). 파생 자료의 출처는 원본 조사 JSON에도 보관합니다.
- 일본 표고·항공사진: [일본 국토지리원 타일](https://maps.gsi.go.jp/development/ichiran.html)을 가공했습니다.
- Mapzen Terrain Tiles: [서비스와 형식](https://github.com/tilezen/joerd/blob/master/docs/use-service.md), [전체 원자료 저작자·라이선스](https://github.com/tilezen/joerd/blob/master/docs/attribution.md). AWS는 타일 호스팅을 제공합니다.
- 호주 원자료: **© Commonwealth of Australia (Geoscience Australia) 2017**, [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
- 뉴질랜드 원자료: **© LINZ, Crown Copyright 2011**, [CC BY 3.0 New Zealand](https://creativecommons.org/licenses/by/3.0/nz/).
- 전역 보완 표고: **USGS SRTM / GMTED**. 데이터 조합·재표본화·평활화·주차면 조정은 이 프로젝트에서 수행했습니다. 원 제공자의 게임 보증이나 승인을 의미하지 않습니다.

차량 사진과 제원 출처: [exterior-model-sources.json](references/exterior-model-sources.json). 신호등 형태와 동작 참고: [TRAFFIC-REFERENCES.md](TRAFFIC-REFERENCES.md).
