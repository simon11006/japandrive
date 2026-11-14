// Posted limits take precedence. Unrecorded street signs are never invented.
export function mappedSpeedLimit(tags = {}, heading = 0, wayHeading = 0, country = 'JP') {
  const direction = Math.cos(heading - wayHeading) >= 0 ? "forward" : "backward";
  const raw = tags["maxspeed:" + direction] ?? tags.maxspeed;
  if (raw != null && /^\d+(?:\.\d+)?(?:\s*(?:km\/h|kph))?$/.test(String(raw).trim()))
    return { value: Number.parseFloat(raw), source: "지도에 등록된 제한속도" };
  if (country === 'JP' && (tags["zone:maxspeed"] === "JP:30" || tags["maxspeed:type"] === "JP:zone30"))
    return { value: 30, source: "존 30" };
  // Since 2026-09-01, unmarked general roads without a centre line have a
  // 30 km/h statutory limit. Require an explicit mapping of that condition.
  if (country === 'JP' && tags.centreline === "no" && !/^(motorway|trunk)/.test(tags.highway || ""))
    return { value: 30, source: "중앙선 없는 생활도로 · 2026.09 시행" };
  // Overseas defaults apply only to explicitly surveyed built-up roads.
  // Unclassified/rural roads and conditional school limits remain unknown.
  if (['AU','NZ'].includes(country) && !tags['maxspeed:conditional'] &&
      (tags['maxspeed:type'] === `${country}:urban` || tags['source:maxspeed'] === `${country}:urban`))
    return { value: 50, source: "해당 국가의 도심 기본 제한속도" };
  return { value: null, source: "현장 제한속도 표지를 확인하세요" };
}
export const VIOLATIONS = {
  speeding: { name: "제한속도 초과", penalty: 5 },
  red: { name: "신호 위반", penalty: 20 },
  wrongWay: { name: "역주행·대향차로 주행", penalty: 20 },
  stop: { name: "일시정지 미준수", penalty: 10 },
  collision: { name: "차량·시설 접촉", penalty: 30 },
  camera: { name: "단속카메라 통과 중 속도 초과", penalty: 0 },
  blinker: { name: "방향지시등 미사용", penalty: 0 },
  turnExit: { name: "회전 후 차로 확인 필요", penalty: 0 },
  pedestrian: { name: "횡단보도 보행자 보호 미준수", penalty: 20 },
};
export const REWARDS = {
  safeLane:{name:'안전한 차로 주행 50m',points:5,feedback:'제한속도와 진행 방향을 지키며 올바른 차로로 주행했습니다.'},
  leftTurn:{name:'좌회전 후 왼쪽 차로 진입',points:10,feedback:'방향지시등을 켜고 좌회전한 뒤 왼쪽 차로로 진입했습니다.'},
  rightTurn:{name:'우회전 후 왼쪽 차로 진입',points:10,feedback:'방향지시등을 켜고 우회전한 뒤 왼쪽 차로로 진입했습니다.'},
  signal:{name:'신호 대기 후 출발',points:10,feedback:'정지선 앞에서 멈춰 기다린 뒤 진행 가능한 신호에 출발했습니다.'},
  stop:{name:'일시정지 준수',points:10,feedback:'일시정지 표지 앞에서 완전히 멈춘 뒤 출발했습니다.'},
  pedestrian:{name:'보행자에게 양보',points:15,feedback:'횡단보도 앞에서 멈추고 보행자가 모두 건넌 뒤 진행했습니다.'},
  parking:{name:'목표 주차 완료',points:30,feedback:'차량 전체를 목표 주차면 안에 넣고 완전히 정차했습니다.'},
};
const IMPROVEMENTS={
  speeding:'표시된 제한속도 전에 감속하고 속도계를 확인하세요.',
  red:'정지선 앞에서 멈추고, 녹색 신호 또는 자신의 진행 방향 화살표를 확인하세요.',
  wrongWay:'회전 후에도 중앙선 왼쪽 차로로 진입하고 진행 방향을 확인하세요.',
  stop:'일시정지 표지 앞에서는 속도를 완전히 0으로 만든 뒤 출발하세요.',
  collision:'앞차와 거리를 두고, 좁은 길과 주차장에서는 미러를 보며 천천히 움직이세요.',
  camera:'단속 구간을 포함해 도로에 표시된 제한속도를 지켜 주세요.',
  blinker:'교차로 회전 전에 방향지시등을 미리 켜 주세요.',
  turnExit:'회전한 뒤 내비의 진행 방향과 왼쪽 차로를 다시 확인하세요.',
  pedestrian:'건너거나 건너려는 사람이 있으면 횡단보도 앞에서 멈추고 통행을 방해하지 마세요.',
};
// The left side is relative to the driver's direction, not the order in
// which a map way was recorded. Inside a junction, a legal right turn may
// temporarily cross the opposing half, so evaluate the exit lane afterwards.
export function leftTrafficStatus(state,lane,{inLot=false,inJunction=false}={}) {
  if(!lane||inLot||inJunction||state.gear<0)return {wrong:false,correct:false};
  const tags=lane.road.tags||{},cos=Math.cos(state.heading-lane.heading);
  const oneway=['yes','1','true','-1'].includes(tags.oneway);
  const width=Number.parseFloat(tags.width)||(Number.parseInt(tags.lanes,10)||2)*3;
  if(lane.distance>width/2||Math.abs(cos)<.8)return {wrong:false,correct:false};
  if(oneway){const wrong=tags.oneway==='-1'?cos>0:cos<0;return {wrong,correct:!wrong};}
  if(tags.highway==='service'&&!(Number(tags.lanes)>=2))return {wrong:false,correct:false};
  const direction=cos>=0?lane.heading:lane.heading+Math.PI;
  const side=(state.x-lane.point.x)*Math.cos(direction)+(state.y-lane.point.y)*Math.sin(direction);
  return {wrong:side>.75,correct:side<-.4,side};
}
export class DrivingScore {
  constructor() {
    this.events = [];
    this.rewards = [];
    this.rewardKeys = new Set();
    this.latches = new Map();
    this.turns = new Map();
    this.signalStops = new Map();
    this.crossings = new Map();
    this.routePeak = 0;
    this.safeDistance = 0;
    this.closed = false;
  }
  get earned() { return this.rewards.reduce((n,e)=>n+e.points,0); }
  get deducted() { return this.events.reduce((n,e)=>n+e.penalty,0); }
  get score() {
    // Keep a visible, auditable net total, including a negative balance.
    // Clamping each deduction to zero would erase early serious violations.
    return this.earned-this.deducted;
  }
  add(type, time, detail = "") {
    if (this.closed || !VIOLATIONS[type]) return null;
    const prior = this.events.findLast((e) => e.type === type);
    if (prior && time - prior.time < 3) return null;
    const event = { type, time, detail, ...VIOLATIONS[type] };
    this.events.push(event);
    return event;
  }
  reward(type,key,time,detail=''){
    const id=type+':'+key;
    if(this.closed||!REWARDS[type]||this.rewardKeys.has(id))return null;
    this.rewardKeys.add(id);
    const event={type,key,time,detail,...REWARDS[type]};this.rewards.push(event);return event;
  }
  cleanSince(time){return !this.events.some(e=>e.penalty>0&&e.time>=time);}
  observeRoute({travelled,eligible,speed,dt,time}){
    if(this.closed||!Number.isFinite(travelled))return null;
    const delta=travelled-this.routePeak;
    if(delta<=0)return null;
    this.routePeak=travelled;
    // Resets, shortcuts or a nearest-segment jump cannot earn distance points.
    if(!eligible||delta>Math.max(4,Math.abs(speed)*dt*2+1)||!this.cleanSince(time-2))return null;
    const before=Math.floor(this.safeDistance/50);this.safeDistance+=delta;
    const after=Math.floor(this.safeDistance/50);
    return after>before?this.reward('safeLane',after,time):null;
  }
  beginTurn(id,{side,time,indicated}){
    if(!this.closed&&!this.turns.has(id))this.turns.set(id,{side,time,indicated,finished:false});
  }
  completeTurn(id,{time,onLeft,aligned}){
    const turn=this.turns.get(id);if(!turn||turn.finished||this.closed)return null;
    turn.finished=true;
    if(onLeft&&aligned&&turn.indicated&&this.cleanSince(turn.time-2))return this.reward(turn.side<0?'leftTurn':'rightTurn',id,time);
    return null;
  }
  waitAtSignal(id,{dt,stopped,frontDistance,mustStop,time=0}){
    if(this.closed)return;
    const state=this.signalStops.get(id)||{held:0,passed:false};
    if(!state.passed&&mustStop&&stopped&&frontDistance>=0&&frontDistance<12){state.entered??=time;state.held+=dt;}
    this.signalStops.set(id,state);
  }
  passSignal(id,{time,compliant}){
    const state=this.signalStops.get(id)||{held:0,passed:false};
    if(state.passed||this.closed)return null;
    state.passed=true;this.signalStops.set(id,state);
    return compliant&&state.held>=.8&&this.cleanSince(state.entered)?this.reward('signal',id,time):null;
  }
  observeCrossing(id,{frontDistance,priority,stopped,dt,time,aligned}){
    if(this.closed||!aligned)return null;
    let state=this.crossings.get(id);
    if(!state&&priority&&frontDistance>=0&&frontDistance<40){state={held:0,last:frontDistance,passed:false,entered:time};this.crossings.set(id,state);}
    if(!state||state.passed)return null;
    if(priority&&stopped&&frontDistance>=2&&frontDistance<15)state.held+=dt;
    let event=null;
    if(state.last>0&&frontDistance<=0){
      state.passed=true;
      const failed=this.events.some(e=>e.type==='pedestrian'&&e.time>=state.entered);
      if(!priority&&state.held>=.8&&!failed)event=this.reward('pedestrian',id,time);
    }
    state.last=frontDistance;return event;
  }
  finish(time){
    if(!this.closed)this.reward('parking','destination',time);
    this.closed=true;return this.summary();
  }
  summary(){
    const earned=Object.entries(REWARDS).map(([type,rule])=>({...rule,type,count:this.rewards.filter(e=>e.type===type).length})).filter(r=>r.count);
    const issues=this.breakdown().filter(r=>r.count&&r.type!=='camera').sort((a,b)=>b.penalty-a.penalty);
    return {score:this.score,earned:this.earned,deducted:this.deducted,
      strengths:earned.map(r=>({title:r.name,count:r.count,points:r.points*r.count,detail:r.feedback})),
      improvements:issues.map(r=>({title:r.name,count:r.count,penalty:r.penalty,detail:IMPROVEMENTS[r.type]}))};
  }
  sustained(type, condition, dt, time, seconds = 2) {
    const state = this.latches.get(type) || { held: 0, clear: 0, fired: false };
    if (condition) {
      state.held += dt;
      state.clear = 0;
    } else {
      state.clear += dt;
      state.held = 0;
      if (state.clear > 2) state.fired = false;
    }
    this.latches.set(type, state);
    if (condition && state.held >= seconds && !state.fired) {
      state.fired = true;
      return this.add(type, time);
    }
    return null;
  }
  breakdown() {
    return Object.entries(VIOLATIONS).map(([type, rule]) => ({
      type,
      name: rule.name,
      count: this.events.filter((e) => e.type === type).length,
      penalty: this.events.filter((e) => e.type === type).reduce((n, e) => n + e.penalty, 0),
    }));
  }
}

// A stop sign node applies only to traffic facing it. OSM direction=forward /
// backward is relative to the way the node lies on; signs without a direction
// apply to traffic travelling along that way (not to crossing traffic).
export function stopSignApplies(tags = {}, heading = 0, wayHeading = 0) {
  const c = Math.cos(heading - wayHeading),
    d = String(tags.direction || "").toLowerCase();
  if (d === "forward") return c > 0.5;
  if (d === "backward") return c < -0.5;
  return Math.abs(c) > 0.7;
}

// Japanese road law: signal 30 m before a turn at an intersection.
export const BLINKER_LEAD_METRES = 30;
export function turnSide(maneuver = {}) {
  if (!["turn", "end of road", "fork", "on ramp", "off ramp"].includes(maneuver.type)) return 0;
  const m = maneuver.modifier || "";
  if (/slight/.test(m) && maneuver.type === "turn") return 0;
  return /left/.test(m) ? -1 : /right/.test(m) ? 1 : 0;
}

// Contact is the player's fault when the player's car was moving toward the
// other body; being hit while stopped or by a car from behind is not.
export function playerAtFault(player, other, gear) {
  if (player.speed < 0.3) return false;
  const fx = Math.sin(player.heading) * gear,
    fy = -Math.cos(player.heading) * gear;
  return (other.x - player.x) * fx + (other.y - player.y) * fy > 0;
}
