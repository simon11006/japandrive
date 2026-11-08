// Korean / English. Korean is the source language in the code; English is a
// dictionary of whole strings plus patterns for sentences that contain
// numbers or names. Any text that appears on screen is translated as it is
// inserted (MutationObserver), and canvas drawings call t() directly.

const saved = (() => {
  try {
    return localStorage.getItem("keep-left-lang");
  } catch {
    return null;
  }
})();
export const LANG = saved || (/^ko\b/i.test(globalThis.navigator?.language || "ko") ? "ko" : "en");
export function setLanguage(lang) {
  try {
    localStorage.setItem("keep-left-lang", lang);
  } catch {}
  location.reload();
}

const EN = {
  "KEEP LEFT: Japan Drive · 일본 첫 운전 연습": "KEEP LEFT: Japan Drive · Your first drive in Japan",
  "테스트 0.6": "Test 0.6",
  "전체 화면": "Full screen",
  "시야 설정": "View settings",
  설명서: "Manual",
  "목적지 변경": "Change destination",
  "일본 첫 운전 연습": "Your first drive in Japan",
  "실제 지도 위에서 익히는, 첫 일본 운전": "Learn to drive in Japan on real maps",
  "아무 키나 누르거나 화면을 클릭하세요": "Press any key or click the screen",
  "드라이브 시작": "Start drive",
  "빠른 출발": "Quick drive",
  "자료와 재현 범위": "Sources & accuracy",
  "오키나와 본섬": "Okinawa main island",
  "좌측통행 · 우핸들 · 추천 장소 28곳": "Keep left · Right-hand drive · 28 featured places",
  "오키나와 지도를 불러오는 중…": "Loading the Okinawa map…",
  선택: "Select",
  결정: "Confirm",
  뒤로: "Back",
  "어디로 떠날까요?": "Where would you like to go?",
  "달리고 싶은 지역부터 골라 주세요.": "Start by choosing a region.",
  "← 타이틀 화면": "← Title",
  "함께 달릴 차량": "Your car",
  "일본 사양 · 우핸들": "Japanese model · right-hand drive",
  "프리우스로 가볍게, 알파드로 여유롭게. 두 차량의 크기와 회전 반경 차이를 익혀 보세요.":
    "Nimble in the Prius, roomy in the Alphard. Get a feel for their size and turning circle.",
  "추천 지역": "Featured region",
  "장소 검색": "Search places",
  "지도에서 선택": "Pick on map",
  "장소 목록": "Place list",
  "추천 드라이브 장소": "Featured places",
  "본섬 전체 장소 찾기": "All places on the island",
  종류: "Type",
  전체: "All",
  숙소: "Stay",
  식당: "Restaurant",
  관광지: "Sight",
  "쇼핑·휴게소": "Shopping & rest stops",
  "공항·렌터카": "Airport & car rental",
  "목록 안에서 찾기": "Filter list",
  지역: "Area",
  "본섬 전체": "Whole island",
  "남부 · 나하·난조": "South · Naha, Nanjo",
  "중부 · 차탄·온나": "Central · Chatan, Onna",
  "북부 · 나고·모토부": "North · Nago, Motobu",
  "옆으로 넘겨 선택하세요": "Swipe to choose",
  "장소 더 불러오기": "Load more places",
  "출발 준비": "Ready to go",
  출발지: "Departure",
  "출발지를 선택하세요": "Choose a departure",
  "내비게이션을 따라 목적지 주차장으로": "Follow the navigation to the destination car park",
  목적지: "Destination",
  "목적지를 선택하세요": "Choose a destination",
  "주차장 확인": "Car park",
  "경로 계산": "Route",
  "주변 도로 준비": "Nearby roads",
  취소: "Cancel",
  "운전 시작": "Start driving",
  "좌측통행을 지키고, 다른 차량과 간격을 유지하세요.": "Keep left and keep your distance from other cars.",
  "목적지에서는 정차 후 주차 브레이크까지 마무리하세요.": "At the destination, stop and set the parking brake.",
  "추천 코스로 변경 · 모토부 숙소 → 카이호우마루": "Use the sample course · Motobu hotel → Kaihoumaru",
  "난이도가 높을수록 주변 도로의 차량이 늘어납니다. 가장 높은 난이도에서는 교차로와 차간 간격에 더 주의하세요.":
    "Higher levels add more traffic. On the hardest level, take extra care at junctions and with following distance.",
  이전: "Back",
  "차량 선택 →": "Choose car →",
  "실제 지도 위에서 익히는 일본 첫 운전. 교통 흐름과 신호 주기는 연습용으로 동작합니다.":
    "Your first drive in Japan, on real maps. Traffic and signal timing are simulated for practice.",
  "지도·차량 자료와 재현 범위": "Map & car sources and accuracy",
  "W 가속 · S 제동 · A/D 조향": "W accelerate · S brake · A/D steer",
  "출발 위치로 돌아가기": "Back to start",
  "표지 확인": "Check signs",
  "운전 점수": "Score",
  "같은 키(Z / X)를 다시 누르면 꺼집니다 · 회전 후 핸들을 풀면 자동으로 꺼짐":
    "Press the same key (Z / X) again to cancel · it also cancels after the turn",
  "D 전진": "D Drive",
  "R 후진": "R Reverse",
  "내비 확대 M": "Nav zoom M",
  "◀ 깜빡이": "◀ Signal",
  "주차 B": "Park B",
  "내비 확대": "Nav zoom",
  "깜빡이 ▶": "Signal ▶",
  일시정지: "Pause",
  제동: "Brake",
  가속: "Accel",
  속도: "Speed",
  기어: "Gear",
  "남은 거리": "Remaining",
  "W / ↑ 가속 · S / ↓ 제동 · A D / ← → 조향 · Z / X 방향지시등":
    "W / ↑ accelerate · S / ↓ brake · A D / ← → steer · Z / X turn signals",
  "R 전후진 · B 주차 브레이크 · Q / E 미러 · C 후방 · P 일시정지 · M 지도":
    "R drive/reverse · B parking brake · Q / E mirrors · C look back · P pause · M map",
  "© OpenStreetMap 기여자 · 경로: OSRM": "© OpenStreetMap contributors · Routing: OSRM",
  "설명서 · MANUAL": "MANUAL",
  "KEEP LEFT 설명서": "KEEP LEFT manual",
  조작키: "Controls",
  "출발과 주차": "Driving & parking",
  "일본 도로 규칙": "Japanese road rules",
  "감점 기준": "Penalties",
  "문제 해결": "Troubleshooting",
  "닫고 계속하기": "Close and continue",
  "운전석을 내 몸에 맞추세요": "Fit the driving seat to you",
  "실제 운전처럼 좌석과 시야를 먼저 맞추세요. 모니터가 가까울수록 시야각을 좁게, 멀수록 넓게 하면 거리감이 자연스럽습니다.":
    "Set your seat and view first, as in a real car. Sit close to the monitor → narrower view; further away → wider. Distances will feel natural.",
  시야각: "Field of view",
  "좌석 앞뒤": "Seat fore/aft",
  "좌석 높이": "Seat height",
  "왼쪽 미러 보조 화면 (Q로 직접 볼 때는 숨김)": "Left mirror inset (hidden while you look with Q)",
  "저속 회전 시 진행 방향으로 시선 이동": "Look into slow turns",
  기본값: "Defaults",
  확인: "OK",
  "지도를 움직여 위치를 맞추세요": "Move the map to place the crosshair",
  "· 지도: 국토지리원 地理院タイル": "· Map: GSI Japan (地理院タイル)",
  "이 위치로 선택": "Use this spot",
  "잠시 쉬어가세요": "Take a break",
  "계속 운전": "Continue driving",
  "출발 위치로": "Back to start",
  "타이틀로 돌아가기": "Back to title",
  "지도와 차량 자료": "Map and car sources",
  "실제 자료를 바탕으로": "Based on real data",
  "일본 국토지리원": "GSI Japan",
  프리우스: "Prius",
  알파드: "Alphard",
  "주차장 배치도": "Car park layout",
  "일본 경찰청 속도 규정": "NPA speed rules",
  "오키나와 단속장비 운영": "Okinawa speed enforcement",
  돌아가기: "Back",
  "오키나와 3D 운전 화면": "Okinawa 3D driving view",
  "메인 메뉴": "Main menu",
  "지역 · 차량 · 출발지 · 목적지 · 교통량을 고르고 출발합니다.":
    "Choose region, car, departure, destination and traffic, then drive.",
  "모토부 숙소 → 카이호우마루 · 실제 도로 543m · 주차까지 바로 연습합니다.":
    "Motobu hotel → Kaihoumaru · 543 m of real road · straight into driving and parking.",
  "시야각과 좌석 위치를 내 모니터와 자세에 맞춥니다.": "Match the field of view and seat to your monitor and posture.",
  "조작키, 출발·주차 방법, 일본 도로 규칙, 감점 기준을 확인합니다.":
    "Controls, starting and parking, Japanese road rules and penalties.",
  "지도 · 차량 자료와 게임이 재현한 범위를 확인합니다.": "Map and car sources, and what the game reproduces.",
  "오키나와 본섬과 드라이브 목적지 지도": "Map of Okinawa and destinations",
  "드라이브 준비 단계": "Setup steps",
  "장소 이름·주소, 또는 구글맵 링크·좌표 붙여넣기": "Place name or address, or paste a Google Maps link / coordinates",
  "숙소, 식당, 관광지 이름": "Hotel, restaurant or sight name",
  "이전 장소": "Previous place",
  "장소 선택 슬라이드": "Place slides",
  "다음 장소": "Next place",
  "오키나와 지도": "Okinawa map",
  "드라이브 준비 진행 상황": "Preparation progress",
  "선택 단계 이동": "Step navigation",
  "경로 안내 지도": "Route map",
  "터치 운전 조작": "Touch controls",
  "왼쪽 조향": "Steer left",
  "오른쪽 조향": "Steer right",
  "위치 선택 지도": "Location picker map",
  남부: "South",
  중부: "Central",
  북부: "North",
  "입체 화면을 열지 못했습니다. 브라우저의 그래픽 가속을 켜고 다시 시도해 주세요.":
    "Could not start 3D graphics. Turn on hardware acceleration in your browser and try again.",
  차폭: "Width",
  "차 높이": "Height",
  "최소 회전 반경": "Turning radius",
  "차체 길이": "Length",
  "지도 서비스가 제한 시간 안에 응답하지 않았습니다. 다시 시도하거나 추천 코스를 선택해 주세요.":
    "The map service did not answer in time. Try again or choose the sample course.",
  "지도 연결이 끊겼습니다. 인터넷 연결을 확인한 뒤 다시 시도해 주세요.":
    "Lost the map connection. Check your internet connection and try again.",
  "지도 연결이 끊겼습니다. 연결을 확인한 뒤 다시 시도해 주세요.": "Lost the map connection. Check your connection and try again.",
  "지도 응답을 읽지 못했습니다. 잠시 후 다시 시도해 주세요.": "Could not read the map response. Please try again shortly.",
  "남부 · 중부 · 북부": "South · Central · North",
  "남부부터 북부까지, 숙소·식당·관광지를 골라 직접 운전하고 주차하세요.":
    "From south to north: pick hotels, restaurants and sights, drive there and park.",
  " · 기본 지도 테스트 범위": " · basic map test area",
  "목록에서 목적지를 고르면 경로를 계산할 수 있습니다.": "Pick a destination from the list to plan a route.",
  " · 지역 버튼을 눌러 다시 시도해 주세요.": " · press the region button to try again.",
  "대교로 연결되는 고우리섬": "Kouri Island (by bridge)",
  "시설 공용 주차장으로 안내": "Guides you to the public car park",
  "출발지·목적지로 선택": "Use as departure / destination",
  "위치 확인 중": "Locating",
  "검색 조건에 맞는 장소가 없습니다.": "No places match your search.",
  "내비게이션을 따라 목적지 주차장까지 이동합니다.": "Follow the navigation to the destination car park.",
  "검색 조건을 바꿔 주세요": "Try a different search",
  차량: "Car",
  교통량: "Traffic",
  "출발 확인": "Confirm",
  "함께 달릴 차량은?": "Which car will you drive?",
  "어디에서 출발할까요?": "Where will you start?",
  "어디까지 달려볼까요?": "Where are you heading?",
  "어떤 도로에서 연습할까요?": "How busy should the roads be?",
  "이제 출발할 준비가 됐어요.": "You're ready to go.",
  "두 차량의 크기와 회전 반경 차이를 익혀 보세요.": "Get a feel for the two cars' size and turning circle.",
  "카드를 옆으로 넘겨 출발할 장소를 선택하세요.": "Search, or swipe the cards to choose where to start.",
  "숙소·식당·관광지를 고르면 목적지 주차장으로 안내합니다.": "Pick a hotel, restaurant or sight; you'll be guided to its car park.",
  "교통량을 세 단계로 조절할 수 있습니다.": "Choose one of three traffic levels.",
  "선택한 코스를 확인하고 천천히 출발하세요.": "Check your course, then set off gently.",
  "안전하게 출발하세요": "Drive safely",
  "선택해 주세요": "Please choose",
  "← 타이틀": "← Title",
  "← 이전": "← Back",
  "지도를 불러오는 중…": "Loading map…",
  "준비를 취소했습니다. 코스를 바꾸거나 다시 시작할 수 있습니다.": "Cancelled. Change the course or start again.",
  "처음이라면 천천히": "Take it easy at first",
  "차간 간격과 신호 확인": "Watch gaps and signals",
  "혼잡한 도심 주행 연습": "Busy city driving",
  "출발지와 다른 목적지를 선택해 주세요.": "Choose a destination different from the departure.",
  출발: "Start",
  도착: "Finish",
  "실제 본섬 해안선 · OSM": "Real island coastline · OSM",
  "실제 지도 등록 위치": "Mapped location",
  나하: "Naha",
  차탄: "Chatan",
  모토부: "Motobu",
  헤도곶: "Cape Hedo",
  "길을 준비하는 중…": "Preparing the route…",
  "목적지 주차장으로 가는 길을 준비하고 있습니다…": "Preparing the route to the destination car park…",
  "드라이브를 준비하고 있습니다…": "Preparing your drive…",
  "하나사키 마르셰 공용 주차장": "Hanasaki Marché public car park",
  "출발 위치의 도로 데이터를 불러오지 못했습니다.": "Could not load the roads at the departure point.",
  "다시 시도": "Try again",
  "먼저 S 또는 제동 버튼으로 완전히 정차한 뒤 기어를 바꿔 주세요.": "Stop completely with S (brake) before changing gear.",
  "R 후진 · W / ↑ 또는 가속 버튼으로 천천히 후진하세요.": "R Reverse · back up slowly with W / ↑ or the accelerator.",
  "D 전진 · W / ↑ 또는 가속 버튼으로 출발하세요.": "D Drive · pull away with W / ↑ or the accelerator.",
  좌회전: "Turn left",
  우회전: "Turn right",
  직진: "Go straight",
  "완만한 좌회전": "Bear left",
  "완만한 우회전": "Bear right",
  "급한 좌회전": "Sharp left",
  "급한 우회전": "Sharp right",
  유턴: "U-turn",
  "목적지 도착": "Arrive",
  "도로를 따라 이동": "Follow the road",
  "주차장 안의 초록색 주차면에 주차하세요": "Park in the green bay inside the car park",
  "주차장 안의 빈 공간에 안전하게 정차하세요": "Stop safely in a free space in the car park",
  "주차 연습": "Parking practice",
  "주변 길을 불러오는 중": "Loading nearby roads",
  "안전거리를 유지하세요": "Keep a safe distance",
  "주차 완료 · 다음 드라이브를 선택하세요": "Parked · choose your next drive",
  "일시정지 · Esc로 계속": "Paused · Esc to continue",
  "주차 브레이크가 걸려 있습니다 · S로 브레이크를 밟은 채 B로 해제하세요":
    "Parking brake is on · hold S (brake) and press B to release it",
  "W 가속 · S 제동 · A/D 조향 · Z/X 방향지시등 · Q/E 미러 확인": "W accelerate · S brake · A/D steer · Z/X signals · Q/E mirrors",
  "주차 브레이크 작동 · 잠시 정차를 유지하세요": "Parking brake on · stay stopped for a moment",
  "정차한 뒤 B로 주차 브레이크를 걸어 주세요.": "Stop, then set the parking brake with B.",
  "차체를 주차선과 나란히 맞춰 주세요.": "Line the car up with the bay.",
  "차량 전체가 주차 구역 안에 들어가야 합니다.": "The whole car must be inside the parking area.",
  "주차 브레이크가 걸려 있습니다 · B로 해제": "Parking brake is on · B to release",
  "왼쪽 차선으로 달리고, 교차로에서는 신호와 주변 차량을 확인하세요.": "Keep to the left lane; check signals and traffic at junctions.",
  제한속도: "Limit",
  "주차 브레이크 작동": "Parking brake on",
  "R 후진 · W 가속 / S 제동": "R Reverse · W accel / S brake",
  "D 전진 · W 가속 / S 제동": "D Drive · W accel / S brake",
  "빨간 신호입니다. 정지선 앞에 멈추고 녹색 신호를 기다리세요.": "Red light. Stop before the line and wait for green.",
  "진행 방향과 왼쪽 차선을 확인하세요.": "Check your direction and keep to the left lane.",
  "단속카메라 지점에서 제한속도를 초과했습니다.": "You were over the limit at a speed camera.",
  "일시정지 표지 앞에서 완전히 멈춰 주세요.": "Come to a complete stop at the stop sign.",
  "전방 일시정지 · 정지선 앞에 완전히 멈춰 주세요.": "Stop sign ahead · stop completely before the line.",
  "드라이브 완료": "Drive complete",
  "주차까지, 잘 도착했습니다.": "You made it, all the way to parking.",
  " / 100점": " / 100",
  "주차 정렬 · 완전 정차 · 주차 브레이크 완료. 점수는 게임의 연습 평가입니다.":
    "Aligned · fully stopped · parking brake set. The score is a practice rating only.",
  "다음 드라이브": "Next drive",
  추천: "Featured",
  "주소 검색": "Address search",
  좌표: "Coordinates",
  "지도 데이터": "Map data",
  "찾지 못했습니다. 다른 이름이나 구글맵 링크·좌표를 붙여 넣거나 '지도에서 선택'을 눌러 주세요.":
    "Nothing found. Try another name, paste a Google Maps link or coordinates, or use 'Pick on map'.",
  "오키나와 본섬 안의 위치를 골라 주세요.": "Please pick a spot on Okinawa's main island.",
  "지도를 불러오는 중입니다. 잠시 후 다시 선택해 주세요.": "The map is still loading. Please try again in a moment.",
  "브라우저 창을 넓히면 운전석을 더 편하게 볼 수 있습니다.": "A wider browser window gives a better view from the driver's seat.",
  "일시적인 오류가 발생했지만 게임은 계속됩니다. 화면이 이상하면 일시정지 메뉴에서 출발 위치로 돌아가세요.":
    "A temporary error occurred but the game continues. If something looks wrong, use Back to start in the pause menu.",
  "주차 브레이크가 걸려 있습니다. B를 눌러 해제하세요.": "The parking brake is on. Press B to release it.",
  "시설물과 접촉했습니다. 후진해서 간격을 확보하세요.": "You touched a structure. Reverse to make space.",
  "도로 가장자리입니다. 천천히 차도로 돌아오세요.": "You're at the road edge. Ease back onto the road.",
  "차량과 접촉했습니다. 정차하고 주변을 확인하세요.": "You touched another car. Stop and check around you.",
  "차량과 접촉했습니다. 후진하거나 핸들을 돌려 간격을 확보하세요.": "You touched another car. Reverse or steer away to make space.",
  "빨간 신호에서는 정지선 앞에 멈춰 주세요.": "Stop before the line at a red light.",
  "목적지 주차장": "Destination car park",
  "주변을 직접 확인하세요": "Check your surroundings",
  "왼쪽 미러": "Left mirror",
  "오른쪽 미러": "Right mirror",
  "주행 준비": "READY",
  "하이브리드 시스템": "Hybrid system",
  "경제 운전": "Eco",
  "지도에 등록된 제한속도": "Mapped speed limit",
  "존 30": "Zone 30",
  "중앙선 없는 생활도로 · 2026.09 시행": "Residential road without centre line · from Sep 2026",
  "현장 제한속도 표지를 확인하세요": "Check the posted speed limit",
  "제한속도 초과": "Speeding",
  "신호 위반": "Red light",
  "역주행·대향차로 주행": "Wrong way / wrong side",
  "일시정지 미준수": "Stop sign not obeyed",
  "차량·시설 접촉": "Contact with car/structure",
  "단속카메라 통과 중 속도 초과": "Speeding at camera",
  "방향지시등 미사용": "No turn signal",
  주차장: "Car park",
  패스트푸드: "Fast food",
  카페: "Café",
  디저트: "Dessert",
  푸드코트: "Food court",
  술집: "Bar",
  시장: "Market",
  주유소: "Fuel",
  충전소: "Charging",
  렌터카: "Car rental",
  화장실: "Toilets",
  편의점: "Convenience store",
  슈퍼마켓: "Supermarket",
  쇼핑몰: "Mall",
  백화점: "Department store",
  기념품: "Gifts",
  수산물: "Seafood",
  빵집: "Bakery",
  "자동차 판매": "Car dealer",
  호텔: "Hotel",
  게스트하우스: "Guest house",
  호스텔: "Hostel",
  모텔: "Motel",
  캠핑장: "Campsite",
  박물관: "Museum",
  전망대: "Viewpoint",
  테마파크: "Theme park",
  수족관: "Aquarium",
  동물원: "Zoo",
  안내소: "Information",
  피크닉장: "Picnic site",
  공원: "Park",
  해변: "Beach",
  워터파크: "Water park",
  골프장: "Golf course",
  마리나: "Marina",
  체육시설: "Sports centre",
  경기장: "Stadium",
  유적: "Historic site",
  공항: "Airport",
  장소: "Place",
  "지도 서버 응답 형식이 올바르지 않습니다.": "Unexpected map server response.",
  "지도 서버에 연결하지 못했습니다.": "Could not reach the map server.",
  "자동차 경로가 없습니다.": "No driving route.",
  "자동차 경로 서버에 연결하지 못했습니다. 잠시 후 다시 시도해 주세요.": "Could not reach the routing server. Please try again shortly.",
  "붙여 넣은 위치": "Pasted location",
  도쿄: "Tokyo",
  "도쿄역 주변 · 반경 2.5km": "Around Tokyo Station · 2.5 km radius",
  후쿠오카: "Fukuoka",
  "하카타 중심 · 반경 2.5km": "Central Hakata · 2.5 km radius",
  "본섬 전체 · 남부 / 중부 / 북부": "Whole island · south / central / north",
  "자동차 경로를 찾지 못했습니다. 출발지 또는 목적지를 바꿔 주세요.": "No driving route found. Change the departure or destination.",
  "배를 이용하는 경로입니다. 본섬 안의 다른 출발지·목적지를 선택해 주세요.":
    "That route needs a ferry. Choose a departure and destination on the main island.",
  "자동차 경로에 본섬 밖 구간이 있습니다. 본섬 안의 다른 출발지·목적지를 선택해 주세요.":
    "The route leaves the main island. Choose places on the main island.",
  "시설과 자동차 도로가 500m 이상 떨어져 있습니다. 진입 위치를 검증한 뒤 이용해야 합니다.":
    "This place is over 500 m from a road; its entrance has not been verified.",
  "토요타 프리우스": "Toyota Prius",
  "토요타 알파드": "Toyota Alphard",
  쉬움: "Easy",
  "여유 있는 도로": "Quiet roads",
  보통: "Normal",
  "일상적인 교통": "Everyday traffic",
  어려움: "Hard",
  "도심처럼 밀집된 차량": "Dense city traffic",
  "지도 서버가 조회를 완료하지 못했습니다.": "The map server could not finish the query.",
  "지원하지 않는 지도 조회입니다.": "Unsupported map query.",
  "지도 조회 범위가 너무 넓습니다.": "Map query area is too large.",
  "지도 요청이 완료되지 않았습니다. 잠시 후 다시 시도해 주세요.": "The map request did not complete. Please try again shortly.",
  "잘못된 지도 요청입니다.": "Invalid map request.",
  드라이브: "Drive",
  "주차면 안": "in bay",
  "주차면 밖": "outside bay",
  "주차 브레이크 해제": "parking brake off",
  "안전하게 출발하세요.": "Drive safely.",
  // featured places
  "오키나와 소바 미네": "Okinawa Soba Mine",
  카이호우마루: "Kaihoumaru",
  "이노 레스토랑": "Inoh Restaurant",
  "오션Boo! 미라우미점": "Ocean Boo! Miraumi",
  "블루 엔트런스 키친": "Blue Entrance Kitchen",
  "스테이크하우스88 차탄점": "Steak House 88 Chatan",
  "슈리 아야고항 우나이": "Shuri Ayagu-han Unai",
  "류큐노우시 차탄점": "Ryukyu no Ushi Chatan",
  "나하공항 국제선 푸드코트 / 포타마": "Naha Airport Intl. food court / Pork Tamago Onigiri",
  "나고 파인애플파크": "Nago Pineapple Park",
  "츄라우미 수족관": "Churaumi Aquarium",
  "고우리 오션타워": "Kouri Ocean Tower",
  고우리비치: "Kouri Beach",
  만좌모: "Cape Manzamo",
  류큐무라: "Ryukyu Mura",
  아메리칸빌리지: "American Village",
  슈리성공원: "Shurijo Castle Park",
  "오키나와 월드": "Okinawa World",
  "교쿠센도 종유동굴": "Gyokusendo Cave",
  "치넨미사키 · 치넨곶": "Chinen Misaki Park",
  온나노에키: "Onna no Eki",
  "이아스 오키나와 토요사키": "iias Okinawa Toyosaki",
  "도로휴게소 쿄다": "Michi-no-Eki Kyoda",
  "나하공항 국제선 터미널": "Naha Airport Intl. Terminal",
  "유아이렌터카 나하공항점": "U-i Rent-a-car Naha Airport",
  "오달렌터카 나하공항점": "ODAL Rent-a-car Naha Airport",
  "공식 주소와 지도 장소 일치 확인 · 주차장 입구 미검증": "Address matches the map · car park entrance not verified",
  "수족관 내부 식당 · 수족관 도착 지점을 공유": "Inside the aquarium · shares the aquarium's arrival point",
  "매장 운영 지도 좌표 · 공식 소개와 지도의 번지 표기가 달라 진입 위치 재확인 필요": "Shop's own map pin · address differs from the official page; entrance to be rechecked",
  "공항 내부 식당 · 공항 도착 지점을 공유": "Inside the airport · shares the airport's arrival point",
  "오키나와 월드 내부 동굴 · 공원 도착 지점을 공유": "Cave inside Okinawa World · shares the park's arrival point",
  "공식 공항점 지도 좌표 · 주차장 입구 미검증": "Official airport branch pin · car park entrance not verified",
  "공식 안내 주소 207-3 Zayasu, Tomigusuku · 지도 좌표는 장소 등록 위치 · 주차장 입구 미검증": "Official address 207-3 Zayasu, Tomigusuku · pin is the listed location · car park entrance not verified",
  // cars
  "4세대형 · 2WD · 15인치 기준": "4th gen · 2WD · 15-inch wheels",
  "4세대형 · 브라운 실내 · 18인치 기준": "4th gen · brown interior · 18-inch wheels",
  // manual
  "가속. 누르는 시간만큼 페달이 깊어집니다.": "Accelerate. The longer you hold, the deeper the pedal.",
  "브레이크. 짧게 누르면 약하게, 길게 누르면 강하게.": "Brake. A tap is gentle, holding brakes harder.",
  "핸들. 누르는 동안 천천히 돌아갑니다.": "Steering. The wheel turns gradually while held.",
  "왼쪽 / 오른쪽 방향지시등.": "Left / right turn signal.",
  "같은 키를 다시 누르면 꺼집니다.": "Press the same key again to cancel it.",
  "회전한 뒤 핸들을 풀면 자동으로 꺼집니다.": "It also cancels when the wheel straightens after a turn.",
  "주차 브레이크 걸기·풀기 (정차 중에만)": "Set / release parking brake (only when stopped)",
  "D(전진) ↔ R(후진) 바꾸기 (완전히 멈춘 뒤)": "Switch D (drive) ↔ R (reverse) (after a full stop)",
  "누르는 동안 왼쪽 / 오른쪽 미러 쪽으로 고개 돌리기": "Hold to look toward the left / right mirror",
  뒤돌아보기: "Look back",
  "내비게이션 화면 가까이 보기": "Zoom in on the navigation screen",
  "이 설명서 열기": "Open this manual",
  "화면 아래 가운데에 속도, 제한속도, 기어(P·D·R), 운전 점수, 방향지시등이 표시됩니다.":
    "The bottom centre of the screen shows speed, speed limit, gear (P·D·R), score and turn signals.",
  "출발:": "Starting:",
  "처음에는 주차 브레이크가 걸려 있습니다.": "The parking brake is on when you start.",
  "(브레이크)를 누른 채": "(brake), press",
  "로 풀고,": "to release it, then let go of",
  "를 떼면 차가 천천히 움직이기 시작합니다(크립).": "and the car starts to creep forward.",
  "크립:": "Creep:",
  "하이브리드 자동변속 차는 D·R에서 브레이크를 떼면 시속 6km 정도로 움직입니다. 신호 대기 중에는":
    "An automatic hybrid moves at about 6 km/h in D or R when you release the brake. While waiting at lights, keep holding",
  "를 계속 누르세요.": ".",
  "내비게이션:": "Navigation:",
  "왼쪽 화면 위 초록 띠가 다음 회전과 남은 거리입니다. 아래 흰 띠는 남은 시간과 도착 예정 시각입니다.":
    "The green band at the top shows the next turn and its distance. The white band at the bottom shows time left and arrival time.",
  "회전:": "Turning:",
  "30m 전에 방향지시등을 켜고 속도를 줄입니다. 좌회전은 왼쪽 차선 그대로, 우회전은 대향차가 지나간 뒤에 합니다.":
    "Signal 30 m before and slow down. Left turns stay in the left lane; turn right only after oncoming traffic has passed.",
  "주차:": "Parking:",
  "목적지 주차장에 들어가 초록색 주차면(또는 주차장 구역) 안에 차체 전체를 넣고, 완전히 멈춘 뒤":
    "Enter the destination car park, get the whole car inside the green bay (or car park area), stop completely, press",
  "로 주차 브레이크를 걸고 2초 기다리면 완료입니다.": "for the parking brake and wait 2 seconds.",
  "후진 주차:": "Reverse parking:",
  "멈춘 뒤": "After stopping, press",
  ". 내비 화면이 후방카메라로 바뀝니다. 빨간 선은 약 0.5m, 노란 선은 약 1m입니다.":
    ". The nav screen becomes a rear camera. The red line is about 0.5 m, the yellow line about 1 m.",
  "좌측통행:": "Keep left:",
  "도로 왼쪽 차선으로 달립니다. 운전석은 오른쪽입니다.": "Drive in the left lane. The driver's seat is on the right.",
  "止まれ(일시정지):": "止まれ (Stop):",
  "빨간 역삼각형 표지 앞에서는 차가 없어도 반드시 완전히 멈춥니다.":
    "At the red inverted-triangle sign, always stop completely, even if the road is empty.",
  "신호:": "Signals:",
  "빨간불·노란불에는 정지선 앞에서 멈춥니다.": "Stop before the line on red and amber.",
  "제한속도:": "Speed limits:",
  "표지가 없는 생활도로는 2026년 9월부터 시속 30km입니다. 지도에 없는 제한속도는 '표지 확인'으로 나옵니다.":
    "Unsigned residential roads are 30 km/h from September 2026. Limits missing from the map show as 'Check signs'.",
  "방향지시등:": "Turn signals:",
  "회전 30m 전, 차선 변경 3초 전에 켭니다.": "On 30 m before a turn, 3 seconds before a lane change.",
  "미러:": "Mirrors:",
  "왼쪽 미러는 오른쪽 운전석에서 멀리 있습니다. 좌회전·주차 전에는": "The left mirror is far from the right-hand seat. Before turning left or parking, always check with",
  "로 꼭 확인하세요.": ".",
  "같은 위반이 이어지면 한 번만 감점합니다. 게임 안의 연습 평가이며 실제 범칙금·벌점이 아닙니다.":
    "A continuing violation is penalised once. This is a practice score, not a real fine or licence points.",
  "지도를 불러오지 못함:": "Map won't load:",
  "인터넷 연결을 확인하고 페이지를 새로고침하세요. 교실 서버(": "Check your internet connection and reload. If you joined a classroom server (",
  ")로 접속했다면 선생님 PC의 서버 창이 켜져 있는지 확인하세요.": "), make sure the server window on the teacher's PC is open.",
  "지도 서비스 시간 초과:": "Map service timeout:",
  "처음 가는 지역은 지도를 받는 데 시간이 걸립니다. 잠시 후 다시 시도하거나 추천 코스를 선택하세요.":
    "New areas take a while to download. Try again shortly or choose the sample course.",
  "화면이 느림:": "Slow screen:",
  "그래픽 품질이 자동으로 낮아집니다. '시야 설정'에서 시야각을 줄이면 더 가벼워집니다.":
    "Graphics quality lowers automatically. A narrower field of view in 'View settings' also helps.",
  "원하는 장소가 없음:": "Place not listed:",
  "장소 검색 칸에 구글맵 링크나 좌표를 붙여 넣거나 '지도에서 선택'으로 위치를 찍으세요.":
    "Paste a Google Maps link or coordinates into the search box, or use 'Pick on map'.",
  "소리가 안 남:": "No sound:",
  "화면을 한 번 클릭하거나 키를 누르면 소리가 켜집니다.": "Click the screen or press a key once to turn sound on.",
  "도로·건물 위치: OpenStreetMap. 테스트 구간 높이·주차선 참고: 국토지리원 표고·항공사진. 차량 크기: 토요타 공식 제원. 실내 배치와 색상: 첨부 사진·공식 사진.":
    "Roads and buildings: OpenStreetMap. Test-area heights and bay lines: GSI elevation and aerial photos. Car dimensions: Toyota specifications. Interior layout and colours: reference and official photos.",
  "건물 높이 일부는 층수 기반 추정이고, 외관과 실내 세부 치수는 단순화되어 있습니다. 주차면은 항공사진 판독값이며 현장 실측이 아닙니다. 지도 갱신 및 현장 차이가 있을 수 있습니다. 교통량·신호 주기는 실제 실시간 정보가 아닙니다.":
    "Some building heights are estimated from floor counts, and exterior and interior details are simplified. Parking bays are read from aerial photos, not surveyed. Maps may differ from the site. Traffic and signal timing are not real-time data.",
  "제한속도는 지도에 등록된 값을 사용하며, 미확인 도로는 숫자를 추측하지 않고 ‘표지 확인’으로 표시합니다. 2026년 9월 생활도로 법정속도 변경을 참고했습니다. 단속카메라·일시정지 위치는 공개 지도 등록 지점이며 누락되거나 변경되었을 수 있습니다. 일부 카메라의 현재 운영 여부는 확인되지 않았습니다. 장비와 표지 모양·도로변 배치는 단순화했습니다. 이동식 단속 위치는 임의로 추가하지 않았습니다. 화면의 경고·감점은 게임의 연습 평가이며 실제 단속이나 벌점 판정이 아닙니다.":
    "Speed limits come from the map; where unknown, the game shows 'Check signs' instead of guessing. The September 2026 residential-road limit change is included. Speed camera and stop sign positions are public map entries and may be missing or out of date; whether some cameras are active is unconfirmed. Equipment, sign shapes and roadside layout are simplified. No mobile speed traps were invented. Warnings and penalties are practice ratings, not real enforcement.",
};

// Sentences with numbers or names: [pattern, (match, t) => English].
const PATTERNS = [
  [/^([\d.,]+ ?k?m) 후 (.+?)(?: · (.+))?$/, (m, t) => `In ${m[1]}, ${t(m[2]).toLowerCase()}${m[3] ? " · " + t(m[3]) : ""}`],
  [/^현도 (\d+)호선$/, (m) => `Pref. Route ${m[1]}`],
  [/^국도 (\d+)호선$/, (m) => `Route ${m[1]}`],
  [/^STEP (\d) \/ 6 · (.+)$/, (m, t) => `STEP ${m[1]} / 6 · ${t(m[2])}`],
  [/^(\d+)단계 (.+?)( · 이전 단계를 먼저 완료하세요)?$/, (m, t) => `Step ${m[1]} ${t(m[2])}${m[3] ? " · finish the earlier steps first" : ""}`],
  [/^(.+) →$/, (m, t) => `${t(m[1])} →`],
  [/^(.+) 지도와 목적지를 불러오는 중…$/, (m, t) => `Loading ${t(m[1])} map and destinations…`],
  [/^(\d+)개 장소 · 추천 드라이브$/, (m) => `${m[1]} places · featured`],
  [/^(\d+)개 장소 · 전체 지역 검색$/, (m) => `${m[1]} places · whole-island search`],
  [/^(\d+) \/ (\d+)\s+·\s+(.+)$/, (m, t) => `${m[1]} / ${m[2]}   ·   ${t(m[3])}`],
  [/^장소를 선택하세요$/, () => "Choose a place"],
  [/^(.+) · (\d+)초( · 지도 서비스 응답을 기다리고 있습니다)?$/, (m, t) => `${t(m[1])} · ${m[2]} s${m[3] ? " · waiting for the map service" : ""}`],
  [/^주차장 진입 위치 확인 중$/, () => "Finding the car park entrance"],
  [/^주행 경로 계산 중$/, () => "Calculating the route"],
  [/^도로와 운전석 준비 중$/, () => "Preparing roads and cockpit"],
  [/^(.+) · 우핸들$/, (m, t) => `${t(m[1])} · right-hand drive`],
  [/^(.+) · 자동차 경로 연결됨$/, (m) => `${m[1]} · route ready`],
  [/^경로상 남은 거리 (.+)$/, (m) => `${m[1]} to go on the route`],
  [/^(\d+) m · 주차$/, (m) => `${m[1]} m · parking`],
  [/^⚠ (.+?)(  ·  −(\d+)점)?$/, (m, t) => `⚠ ${t(m[1])}${m[3] ? `  ·  −${m[3]} pts` : ""}`],
  [/^제한속도 (\d+)km\/h 초과 · 속도를 줄여 주세요\.$/, (m) => `Over the ${m[1]} km/h limit · slow down.`],
  [/^전방 (좌회전|우회전) · ([ZX])로 방향지시등을 켜 주세요\.$/, (m) => `${m[1] === "좌회전" ? "Left" : "Right"} turn ahead · signal with ${m[2]}.`],
  [/^(좌회전|우회전) 30m 전부터 방향지시등을 켜 주세요\.$/, (m) => `Signal at least 30 m before a ${m[1] === "좌회전" ? "left" : "right"} turn.`],
  [/^전방 (\d+)m · 과속 단속카메라$/, (m) => `Speed camera in ${m[1]} m`],
  [/^(\d+)회( · −(\d+)점)?$/, (m) => `${m[1]}×${m[3] ? ` · −${m[3]} pts` : ""}`],
  [/^-(\d+)점$/, (m) => `−${m[1]} pts`],
  [/^(출발지|목적지): (.+)$/, (m) => `${m[1] === "출발지" ? "Departure" : "Destination"}: ${m[2]}`],
  [/^장소 데이터 ([\d,]+)곳( · 기준일 (\S+))?( · © OpenStreetMap)?$/, (m) => `${m[1]} places${m[3] ? ` · data as of ${m[3]}` : ""}${m[4] || ""}`],
  [/^지도에서 고른 위치 \((.+)\)$/, (m) => `Picked on map (${m[1]})`],
  [/^(앞|뒤|위|아래)? ?(\d+) cm$/, (m) => `${{ 앞: "forward ", 뒤: "back ", 위: "up ", 아래: "down " }[m[1]] || ""}${m[2]} cm`],
  [/^(\d+)분$/, (m) => `${m[1]} min`],
  [/^(\d\d:\d\d) 도착$/, (m) => `Arrive ${m[1]}`],
  [/^(\d+)분 (\d+)초$/, (m) => `${m[1]} min ${m[2]} s`],
  [/^(.+) 앞 도로변$/, (m) => `Roadside at ${m[1]}`],
  [/^(.+) 주차장$/, (m) => `${m[1]} car park`],
  [/^데이터를 불러오지 못했습니다 \((\d+)\)$/, (m) => `Could not load data (${m[1]})`],
  [/^지도 서버 응답 (\d+)$/, (m) => `Map server answered ${m[1]}`],
  [/^전장 (\d+) · 전폭 (\d+) mm$/, (m) => `Length ${m[1]} · width ${m[2]} mm`],
  [/^축거 (\d+) mm · 최소 회전 반경 ([\d.]+) m$/, (m) => `Wheelbase ${m[1]} mm · turning radius ${m[2]} m`],
  [/^(.+) \/ (.+)$/, (m, t) => {
    const a = t(m[1]),
      b = t(m[2]);
    return a !== m[1] || b !== m[2] ? `${a} / ${b}` : null;
  }],
  [/^(.+) · (.+)$/, (m, t) => {
    const a = t(m[1]),
      b = t(m[2]);
    return a !== m[1] || b !== m[2] ? `${a} · ${b}` : null;
  }],
];

export function t(text) {
  if (LANG !== "en" || text == null) return text;
  const s = String(text);
  const key = s.trim().replace(/\s+/g, " ");
  if (!key || !/[\uac00-\ud7a3]/.test(key)) return s;
  const wrap = (out) => (s.trim() === key ? s.replace(key, out) : s.match(/^\s*/)[0] + out + s.match(/\s*$/)[0]);
  if (EN[key] != null) return wrap(EN[key]);
  for (const [re, fn] of PATTERNS) {
    const m = key.match(re);
    if (m) {
      const out = fn(m, t);
      if (out != null) return wrap(out);
    }
  }
  return s;
}

const ATTRS = ["placeholder", "aria-label", "title", "data-hint", "alt"];
function translateNode(node) {
  if (node.nodeType === 3) {
    const next = t(node.nodeValue);
    if (next !== node.nodeValue) node.nodeValue = next;
    return;
  }
  if (node.nodeType !== 1 || node.closest?.("[data-lang]:not([data-lang=en])")) return;
  for (const a of ATTRS)
    if (node.hasAttribute?.(a)) {
      const v = node.getAttribute(a),
        next = t(v);
      if (next !== v) node.setAttribute(a, next);
    }
  const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 3) {
      const next = t(n.nodeValue);
      if (next !== n.nodeValue) n.nodeValue = next;
    } else
      for (const a of ATTRS)
        if (n.hasAttribute(a)) {
          const v = n.getAttribute(a),
            next = t(v);
          if (next !== v) n.setAttribute(a, next);
        }
  }
}

export function startTranslation() {
  document.documentElement.lang = LANG;
  if (LANG !== "en") return;
  document.title = t(document.title);
  translateNode(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") translateNode(r.target);
      else if (r.type === "attributes") translateNode(r.target);
      else r.addedNodes.forEach(translateNode);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
}
