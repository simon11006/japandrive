# 신호등과 NPC 교통 — 0.15

검토: 2026-11-15. 국가·지역별 대표 형태를 적용합니다. 개별 실제 교차로의 제조사·등기구 크기·신호 주기까지 동일하다는 뜻은 아닙니다. 일부 신호는 연습을 위해 추가한 배치이며, 코스의 신호 주기는 짧게 구성했습니다.

| 지역 | 표시 |
|---|---|
| 일본 일반 | 가로형 녹색·황색·적색, 별도 녹색 우회전 화살표 |
| 삿포로 | 적설 지역에서 쓰는 세로형 적색·황색·녹색. 우회전 화살표는 본등 아래 |
| 호주 NSW | 세로형 본등, 검은 차광판과 흰 테두리, 우회전 적색·황색·녹색 화살표, 회색 지지대와 도로변 보조 신호 |
| 뉴질랜드 | 세로형 본등·회전 화살표, 검은 차광판, 노란 신호 지주와 회색 가로 지지대, 도로변 보조 신호 |

일본 우회전 화살표는 적색 본등과 함께 켜지고, 화살표 종료 후 황색·적색으로 이어집니다. NSW·뉴질랜드에서는 녹색 본등이라도 적색 우회전 화살표가 켜지면 우회전 차량은 정지합니다. 화살표 종료 시 황색 화살표를 표시합니다. 일반 녹색에서 우회전하는 차량은 대향 직진 차량을 기다립니다. 회전 차량은 마지막 보행자가 횡단을 마칠 때까지 양보합니다.

NPC와 화면 신호는 같은 접근 방향·정지선·시계를 사용합니다. 분리 차로의 교차로 노드들을 묶어 진입 방향마다 신호를 배치합니다. 교차로 출구가 막혔으면 진입을 보류하고 가까운 교차로 사이의 공간도 함께 확인합니다. 경로 선택은 교차로에 접근하는 동안 유지하며, 오래 기다린 진입 방향에 우선권을 줍니다. 지도 바깥으로 나간 차량만 플레이어에서 떨어진 빈 도로로 재배치합니다.

## 확인 자료

- [일본 경찰청 우회전 화살표 운영 지침](https://www.npa.go.jp/laws/notification/koutuu/kisei/kisei20240326_2.pdf)
- [오키나와현 경찰 신호 안내](https://www.police.pref.okinawa.jp/docs/2015030500114/)
- [삿포로 세로형 신호 사진 — 도쿄서적](https://ten.tokyo-shoseki.co.jp/detail/26805/): 2001년 사진의 공개 미리보기로 형태 확인.
- [NSW 교통 신호 규칙과 그림](https://www.nsw.gov.au/driving-boating-and-transport/driving-nsw/roads-safety-and-rules/stopping-giving-way-turning/traffic-lights): 본등·적색 우회전 화살표 그림을 직접 확인.
- [Transport for NSW 신호등 표준](https://standards.transport.nsw.gov.au/_entity/annotation/ae0b0a9c-5d17-f111-8341-6045bdc3f6e4)
- [NZTA M28 신호 지주 색상 규격](https://nzta.govt.nz/assets/resources/colours-for-traffic-control-devices/NZTA-M28-Specification-for-colours-for-traffic-control-devices-June-2024.pdf), §6.4: 신호 지주 노란색, 가로 지지대는 무도장 금속 허용. 공개 검색 사본으로 내용 확인.
- [뉴질랜드 도로 규칙 — 양보](https://www.nzta.govt.nz/driving-skills/learn-to-drive/roadcode/motorcycle-code/about-riding/giving-way/the-give-way-rules)

검증은 적색 정지선 통과, 우회전 대향차 양보, 보행자 횡단, 분리 차로의 신호 방향, 실제 저장 코스의 혼잡 교통을 포함합니다.
