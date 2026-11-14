export const TAU = Math.PI * 2;
export const DIFFICULTIES = [
  { id: "easy", name: "한산", description: "여유 있는 도로", cars: 8 },
  { id: "normal", name: "보통", description: "일상적인 교통", cars: 28 },
  { id: "hard", name: "혼잡", description: "도심처럼 밀집된 차량", cars: 80 },
];
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const headingBetween = (a, b) => Math.atan2(b.x - a.x, -(b.y - a.y));
export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const forward = (angle) => ({ x: Math.sin(angle), y: -Math.cos(angle) });
export function nearestOnSegment(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  const point = { x: a.x + t * dx, y: a.y + t * dy };
  return { point, t, distance: distance(p, point) };
}
export function roadWidth(tags = {}) {
  const known = parseFloat(tags.width),
    lanes = parseInt(tags.lanes, 10);
  return Number.isFinite(known)
    ? known
    : lanes
      ? lanes * 3
      : tags.highway === "service"
        ? 4.8
        : tags.oneway === "yes"
          ? 4
          : 7;
}
export function vehicleCorners(state, car, margin = 0) {
  const f = forward(state.heading),
    r = { x: Math.cos(state.heading), y: Math.sin(state.heading) };
  return [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ].map(([side, end]) => ({
    x: state.x + r.x * side * (car.width / 2 + margin) + f.x * end * (car.length / 2 + margin),
    y: state.y + r.y * side * (car.width / 2 + margin) + f.y * end * (car.length / 2 + margin),
  }));
}
export function insidePolygon(p, points) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i],
      b = points[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}
export function bayFromGeo(data, project) {
  return data.spaces.map((s) => {
    const points = s.corners.map(project),
      center = points.reduce((a, p) => ({ x: a.x + p.x / 4, y: a.y + p.y / 4 }), { x: 0, y: 0 });
    const entry = { x: (points[0].x + points[1].x) / 2, y: (points[0].y + points[1].y) / 2 };
    const rear = { x: (points[2].x + points[3].x) / 2, y: (points[2].y + points[3].y) / 2 };
    return {
      ...s,
      points,
      center,
      entry,
      heading: headingBetween(entry, rear),
      width: distance(points[0], points[1]),
      length: distance(entry, rear),
    };
  });
}
export function parkingStatus(state, car, bay, heldSeconds = 0) {
  if (!bay) return { inside: false, aligned: false, stopped: false, complete: false };
  const inside = vehicleCorners(state, car).every((p) => insidePolygon(p, bay.points));
  const delta = Math.abs(wrapAngle(state.heading - (bay.heading || 0)));
  const angle = Math.min(delta, Math.PI - delta);
  const aligned = bay.type === "area" || angle < Math.PI / 18,
    stopped = Math.abs(state.speed) < 0.1;
  const ready = inside && stopped;
  return { inside, aligned, stopped, angle, ready, complete: ready && heldSeconds >= 1 };
}
// A move into an obstacle is undone. But when the car was already touching it
// (another car stopped against it, an approximate map footprint), only moves
// that bring it closer are undone, so the driver can always back or steer
// away instead of being stuck for good.
export function blocksMove(previous, next, obstacle, touchingBefore) {
  if (!touchingBefore) return true;
  return distance(next, obstacle) <= distance(previous, obstacle) + 1e-6;
}
export function rectanglesOverlap(a, carA, b, carB) {
  const ac = vehicleCorners(a, carA),
    bc = vehicleCorners(b, carB);
  for (const h of [a.heading, b.heading])
    for (const axis of [forward(h), { x: Math.cos(h), y: Math.sin(h) }]) {
      const av = ac.map((p) => p.x * axis.x + p.y * axis.y),
        bv = bc.map((p) => p.x * axis.x + p.y * axis.y);
      if (Math.max(...av) < Math.min(...bv) || Math.max(...bv) < Math.min(...av)) return false;
    }
  return true;
}
function hash(value) {
  let n = 2166136261;
  for (const c of String(value)) n = Math.imul(n ^ c.charCodeAt(0), 16777619);
  return n >>> 0;
}
export function signalPhase(signal, heading, time) {
  if(signal.profile==='flash')return Math.abs(Math.cos(heading-(signal.axis??0)))>.707?'flash-red':'flash-yellow';
  if(signal.profile==='arrow'){
    const main=Math.abs(Math.cos(heading-(signal.axis??0)))>.707;
    const phase=(time+(hash(signal.timingId??signal.id)%52)+(main?0:26))%52;
    // NPA 2024 guideline: green → yellow → red + right arrow → yellow → all-red.
    return phase<12?'green':phase<15||(!['AU','NZ'].includes(signal.country)&&phase>=20&&phase<23)?'yellow':'red';
  }
  // Short practice cycles; retain yellow and an all-red clearance interval.
  const phase = (time + (hash(signal.timingId ?? signal.id) % 44)) % 44;
  const axis = signal.axis ?? 0;
  const main = Math.abs(Math.cos(heading - axis)) > 0.707;
  const t = main ? phase : (phase + 22) % 44;
  return t < 16 ? "green" : t < 19 ? "yellow" : "red";
}
export function signalRightArrow(signal,heading,time){
  if(signal.profile!=='arrow')return false;
  const main=Math.abs(Math.cos(heading-(signal.axis??0)))>.707;
  const phase=(time+hash(signal.timingId??signal.id)%52+(main?0:26))%52;
  return phase>=15&&phase<20;
}
export function signalTurnPhase(signal,heading,time){
  if(signal.profile!=='arrow')return 'off';
  if(!['AU','NZ'].includes(signal.country))return signalRightArrow(signal,heading,time)?'green':'off';
  const main=Math.abs(Math.cos(heading-(signal.axis??0)))>.707;
  const phase=(time+hash(signal.timingId??signal.id)%52+(main?0:26))%52;
  return phase>=15&&phase<20?'green':phase>=20&&phase<23?'yellow':'red';
}
export function synchronizeSignals(signals) {
  const groups = [];
  for (const s of signals) {
    const related = groups.filter((g) => g.some((p) => distance(p, s) < 28));
    if (!related.length) groups.push([s]);
    else {
      const merged = [s, ...related.flat()];
      for (const g of related) groups.splice(groups.indexOf(g), 1);
      groups.push(merged);
    }
  }
  for (const g of groups) {
    const anchor = g.slice().sort((a, b) => String(a.id).localeCompare(String(b.id), 'en', {numeric:true}))[0];
    const profile=g.some(s=>s.profile==='arrow')?'arrow':anchor.profile;
    for (const s of g) {
      s.timingId = anchor.id;
      s.axis = anchor.approachHeading ?? anchor.axis ?? 0;
      s.profile=profile;
    }
  }
  return signals;
}
export function reverseGuides(state, car, maxDistance = 5) {
  const tracks = [];
  let p = { x: state.x, y: state.y, heading: state.heading };
  for (let d = 0; d <= maxDistance + 0.001; d += 0.1) {
    const f = forward(p.heading),
      right = { x: Math.cos(p.heading), y: Math.sin(p.heading) },
      rear = { x: p.x - (f.x * car.length) / 2, y: p.y - (f.y * car.length) / 2 };
    tracks.push({
      distance: d,
      left: { x: rear.x - right.x * (car.width / 2 + 0.15), y: rear.y - right.y * (car.width / 2 + 0.15) },
      right: { x: rear.x + right.x * (car.width / 2 + 0.15), y: rear.y + right.y * (car.width / 2 + 0.15) },
    });
    const yaw = (-0.1 / car.wheelbase) * Math.tan(state.steer || 0),
      h = p.heading + yaw / 2;
    p.x -= Math.sin(h) * 0.1;
    p.y += Math.cos(h) * 0.1;
    p.heading += yaw;
  }
  return tracks;
}
export function buildRoadGraph(roads) {
  const nodes = new Map(),
    edges = [];
  const key = (p) => `${p.x.toFixed(1)}:${p.y.toFixed(1)}`;
  function node(p) {
    const k = key(p);
    if (!nodes.has(k)) nodes.set(k, { ...p, key: k, out: [], incoming: [] });
    return nodes.get(k);
  }
  for (const road of roads) {
    if (road.tags.highway === "service") continue;
    for (let i = 1; i < road.points.length; i++) {
      const a = node(road.points[i - 1]),
        b = node(road.points[i]),
        length = distance(a, b);
      if (length < 0.3) continue;
      const add = (from, to) => {
        const edge = {
          id: edges.length,
          from,
          to,
          length,
          heading: headingBetween(from, to),
          width: roadWidth(road.tags),
          roadId: road.id,
          highway: road.tags.highway,
          oneway: ['yes','1','true','-1'].includes(road.tags.oneway),
          lanes: parseInt(road.tags.lanes,10)||1,
        };
        edges.push(edge);
        from.out.push(edge);
        to.incoming.push(edge);
      };
      if (road.tags.oneway !== "-1") add(a, b);
      if (!["yes", "1", "true"].includes(road.tags.oneway)) add(b, a);
    }
  }
  return { nodes, edges };
}
export class TrafficSimulation {
  constructor(roads, signals, start, count = 16) {
    this.roads=roads;
    this.graph = buildRoadGraph(roads);
    this.signals = signals;
    this.cars = [];
    this.serial = 1;
    this.origin = { ...start };
    this.targetCount = count;
    this.junctionOwners=new Map();
    this.junctions=[];
    for(const s of signals){
      const id=s.timingId??s.id;
      if(this.junctions.some(j=>j.id===id))continue;
      this.junctions.push({id,center:s,signal:s,radius:Math.max(5,...(s.approaches||[]).map(a=>a.stopDistance))});
    }
    for(const node of this.graph.nodes.values()){
      const directions=[...node.out.map(e=>e.heading),...node.incoming.map(e=>wrapAngle(e.heading+Math.PI))];
      const arms=[];for(const h of directions)if(!arms.some(a=>Math.abs(wrapAngle(a-h))<.18))arms.push(h);
      if(arms.length<3||this.junctions.some(j=>j.signal&&distance(j.center,node)<30))continue;
      // Split, one-way carriageways can have only one or two outgoing arms.
      // Count incoming arms as well and reserve their whole physical junction.
      const nearby=this.junctions.find(j=>!j.signal&&distance(j.center,node)<22),radius=Math.max(7,...node.out.map(e=>e.width/2+4));
      if(nearby)nearby.radius=Math.max(nearby.radius,distance(nearby.center,node)+radius);
      else this.junctions.push({id:'node:'+node.key,center:node,radius});
    }
    // One physical intersection may be several OSM nodes (median islands or
    // slip lanes). Overlapping independent locks can otherwise deadlock.
    let merged=true;
    while(merged){merged=false;
      outer:for(let i=0;i<this.junctions.length;i++)for(let k=i+1;k<this.junctions.length;k++){
        const a=this.junctions[i],b=this.junctions[k],d=distance(a.center,b.center);
        if(a.signal||b.signal||d>=a.radius+b.radius+7)continue;
        const radius=Math.max(a.radius,b.radius,(d+a.radius+b.radius)/2);
        if(radius>48)continue;
        const t=d>0?Math.max(0,(radius-a.radius)/d):0;
        a.center={x:a.center.x+(b.center.x-a.center.x)*t,y:a.center.y+(b.center.y-a.center.y)*t};a.radius=radius;
        this.junctions.splice(k,1);merged=true;break outer;
      }
    }
    const candidates = this.graph.edges.filter(
      (e) => distance(e.from, start) < 420 && distance(e.from, start) > 18 && e.length > 5,
    );
    const score = (e) => distance(e.from, start) + (hash(e.roadId + ":" + e.id) % 75);
    const sorted = candidates.sort((a, b) => score(a) - score(b));
    const rows = sorted.map((edge) => {
      const result = [{ edge, along: edge.length * 0.35 }];
      for (let d = 12; d < edge.length - 6; d += 11) result.push({ edge, along: d });
      return result;
    });
    // Interleave roads and directions before adding another car to the same
    // edge. Flattening each long edge first filled the entire traffic budget
    // with one queue and left opposing/cross traffic absent.
    const slots=[];
    for(let depth=0;depth<Math.max(0,...rows.map(row=>row.length));depth++)
      for(const row of rows)if(row[depth])slots.push(row[depth]);
    for (let j = 0; j < slots.length && this.cars.length < count; j++) {
      const { edge, along } = slots[j],
        i = this.cars.length;
      const car = {
        id: i,
        edge,
        along,
        speed: 3 + (i % 4),
        desired: 6 + (i % 5),
        heading: edge.heading,
        x: 0,
        y: 0,
        length: i % 5 === 0 ? 4.9 : 4.3,
        width: i % 5 === 0 ? 1.85 : 1.72,
        kind: i % 5 === 0 ? "van" : "sedan",
        color: ["#f1efdf", "#c8d2d4", "#364f63", "#bf6251", "#dbdfdf"][i % 5],
        braking: false,
      };
      this.place(car);
      if (
        distance(car, start) < 480 &&
        distance(car, start) > 18 &&
        !this.junctions.some(j=>distance(car,j.center)<j.radius+car.length/2+2) &&
        this.cars.every(
          (other) =>
            !rectanglesOverlap(car, { ...car, length: car.length + 4, width: car.width + 0.3 }, other, other),
        )
      )
        this.cars.push(car);
    }
  }
  recenter(roads, start) {
    if (distance(this.origin, start) < 180) return;
    const fresh = new TrafficSimulation(roads, this.signals, start, this.targetCount),
      kept = this.cars.filter((c) => distance(c, start) < 160);
    this.cars = kept;
    for (const candidate of fresh.cars) {
      if (this.cars.length >= this.targetCount) break;
      if (
        distance(candidate, start) < 105 ||
        this.cars.some((other) => rectanglesOverlap(candidate, candidate, other, other))
      )
        continue;
      candidate.id = "r" + this.serial++;
      this.cars.push(candidate);
    }
    this.graph = fresh.graph;
    this.roads=roads;
    this.origin = { ...start };
  }
  lanePosition(car,e,along) {
    const t = along / e.length,
      offset = e.oneway ? (e.lanes>1 ? e.width/2-e.width/e.lanes*((hash(car.id)%e.lanes)+.5) : .15) : Math.min(1.65, e.width * 0.23);
    return {x:e.from.x+(e.to.x-e.from.x)*t-Math.cos(e.heading)*offset,
      y:e.from.y+(e.to.y-e.from.y)*t-Math.sin(e.heading)*offset,heading:e.heading};
  }
  place(car) {Object.assign(car,this.lanePosition(car,car.edge,car.along));}
  signalApproach(signal,heading) {
    return signal.approaches?.filter(a=>Math.abs(wrapAngle(a.heading-heading))<Math.PI/4)
      .sort((a,b)=>Math.abs(wrapAngle(a.heading-heading))-Math.abs(wrapAngle(b.heading-heading)))[0];
  }
  previewPath(car,range=45){
    const path=[{x:car.x,y:car.y}];let edge=car.edge,along=car.along,next=car.next,left=range;
    const add=p=>{left-=distance(path.at(-1),p);path.push(p);};
    for(let i=0;i<64&&left>0;i++){
      const remaining=Math.max(0,edge.length-along),travel=Math.min(left,remaining);
      add(this.lanePosition(car,edge,along+travel));
      if(travel<remaining||!next)break;
      edge=next;along=0;add(this.lanePosition(car,edge,0));next=this.chooseNext(car,edge);
    }
    return path;
  }  // Pick the edge after `edge`: mostly straight on, sometimes a turn, never an
  // immediate U-turn unless the road ends. Deterministic per car and edge.
  chooseNext(car, edge) {
    const planned=car.plan?.get(edge.id);
    if(planned&&edge.to.out.includes(planned))return planned;
    const options = edge.to.out.filter((e) => e.to.key !== edge.from.key);
    if (!options.length) return edge.to.out.find((e) => e.to.key === edge.from.key) || null;
    if (options.length === 1) return options[0];
    const weighted = options.map((e) => {
      const turn = Math.abs(wrapAngle(e.heading - edge.heading));
      return { e, w: turn < 0.45 ? 5 : turn < 2.2 ? 1.6 : 0.2 };
    });
    const visit=car.visits?.get(edge.id)||0;
    let pick = (hash(car.id + ":" + edge.id+(visit?":"+visit:"")) % 1000) / 1000;
    const total = weighted.reduce((n, o) => n + o.w, 0);
    for (const o of weighted) {
      pick -= o.w / total;
      if (pick <= 0) return o.e;
    }
    return weighted.at(-1).e;
  }
  rerouteQueueHead(car,time,bodies){
    if((car.queueAge||0)<25||time<(car.nextReroute||0))return;
    car.nextReroute=time+8;
    const f=forward(car.heading);
    if(bodies.some(other=>other!==car&&other.length&&Math.cos((other.heading??0)-car.heading)>.7&&
      (other.x-car.x)*f.x+(other.y-car.y)*f.y>0&&
      (other.x-car.x)*f.x+(other.y-car.y)*f.y<9&&
      Math.abs((other.x-car.x)*f.y-(other.y-car.y)*f.x)<(car.width+other.width)/2+.2))return;
    // Re-plan only an upcoming fork. Cars never teleport, reverse through a
    // queue, ignore a signal, or change the turn after entering its junction.
    if([...this.junctionOwners.values()].some(l=>l.car===car&&l.entered))return;
    car.plan??=new Map();
    const cost=()=>{const path=this.previewPath(car,75);return bodies.reduce((n,other)=>{
      if(other===car||!other.length||distance(other,car)>80)return n;
      const hit=path.slice(1).some((p,i)=>nearestOnSegment(other,path[i],p).distance<(car.width+other.width)/2+.5);
      return n+(hit?other.barrier?100:(other.speed||0)<.2?12:2:0);
    },0);};
    const originalCost=cost();let edge=car.edge,travel=car.edge.length-car.along;
    for(let i=0;i<32&&travel<55;i++){
      const next=edge===car.edge?car.next:this.chooseNext(car,edge);
      const options=edge.to.out.filter(e=>e!==next&&e.to.key!==edge.from.key&&Math.abs(wrapAngle(e.heading-edge.heading))<2.65);
      const oldPlan=car.plan.get(edge.id),oldNext=car.next;
      for(const option of options){
        car.plan.set(edge.id,option);if(edge===car.edge)car.next=option;
        if(cost()<originalCost-1)return;
      }
      if(oldPlan)car.plan.set(edge.id,oldPlan);else car.plan.delete(edge.id);car.next=oldNext;
      if(!next)break;edge=next;travel+=edge.length;
    }
  }
  junctionExit(car,junction) {
    if(!junction)return null;
    const path=this.previewPath(car,junction.radius*3+45);let entered=false;
    for(let i=1;i<path.length;i++){
      const a=path[i-1],b=path[i],n=Math.ceil(distance(a,b)/2),heading=headingBetween(a,b);
      for(let k=0;k<=n;k++){
        const p={x:a.x+(b.x-a.x)*k/Math.max(1,n),y:a.y+(b.y-a.y)*k/Math.max(1,n),heading};
        const d=distance(p,junction.center);
        if(d<junction.radius)entered=true;
        if(entered&&d>junction.radius+car.length/2+3)return{...p,turn:wrapAngle(heading-car.edge.heading)};
      }
    }
    return null;
  }
  tick(dt, time, player) {
    const bodies = [...this.cars, player,...(this.barriers||[])];
    // A car that entered on green keeps the crossing until its rear clears.
    // This also prevents a right-turning queue blocking the next green phase.
    for(const [id,lock]of this.junctionOwners){
      const d=distance(lock.car,lock.center);
      if(!this.cars.includes(lock.car)||(lock.entered&&d>lock.radius+lock.car.length/2+2))this.junctionOwners.delete(id);
      else if(d<lock.radius+lock.car.length/2)lock.entered=true;
      else if(!lock.entered&&time-lock.since>3)this.junctionOwners.delete(id);
    }
    for(const car of this.cars)car.queueAge=car.speed<.2?(car.queueAge||0)+dt:0;
    // Older waiting approaches get first chance at a newly clear junction.
    // Fixed array order starved later cars on short repeating city loops.
    const order=[...this.cars].sort((a,b)=>(b.queueAge||0)-(a.queueAge||0));
    for (const car of order) {
      if(this.debug)car.waitReasons=[];
      let target = car.edge.highway==='motorway'?Math.max(car.desired,20):car.desired,stopTravel=Infinity;
      car.next ??= this.chooseNext(car, car.edge);
      this.rerouteQueueHead(car,time,bodies);
      const pedestrianStop=this.pedestrianStop?.(car,this.previewPath(car))??Infinity;
      if(Number.isFinite(pedestrianStop))target=Math.min(target,Math.sqrt(4*Math.max(0,pedestrianStop)));
      const f = forward(car.heading);
      for (const other of bodies) {
        if (other === car) continue;
        const dx = other.x - car.x,
          dy = other.y - car.y,
          ahead = dx * f.x + dy * f.y,
          lateral = Math.abs(dx * f.y - dy * f.x);
        // Keep a 2-second gap, never closer than about 6 m between centres.
        // A crossing or oncoming car is not a lead vehicle. Junction priority
        // and body collision checks below handle it without a permanent queue.
        const aligned=other===player||other.barrier||Math.cos((other.heading??car.heading)-car.heading)>.7;
        const laneGap=(car.width+(other.width||1.8))/2+.15;
        if (aligned && ahead > 0 && ahead < 30 && lateral < laneGap){
          target = Math.min(target, Math.max(0, (ahead - 6.5) / 2));
          if(this.debug&&ahead<7)car.waitReasons.push({lead:other.id,ahead,lateral});
        }
      }
      // Slow for the coming turn: about 15 km/h for a right angle.
      car.next ??= this.chooseNext(car, car.edge);
      const toEnd = car.edge.length - car.along;
      if (car.next && toEnd < 25) {
        const turn = Math.abs(wrapAngle(car.next.heading - car.edge.heading));
        if (turn > 0.35) target = Math.min(target, Math.max(3.6, 9 - turn * 3.4) + toEnd * 0.25);
      }
      for (const s of this.signals) {
        const approach=this.signalApproach(s,car.edge.heading);
        if(s.approaches&&!approach)continue;
        const dx = s.x - car.x,
          dy = s.y - car.y,
          ahead = dx * f.x + dy * f.y,
          lateral = Math.abs(dx * f.y - dy * f.x-(approach?.offset||0)),
          // Share the visible stop-line setback for this incoming approach.
          toLine = ahead - (approach?.stopDistance??5) - car.length / 2;
        if (ahead <= 0 || ahead > 60 || lateral > (approach?.width/2+1||7) || toLine < -0.5) continue;
        const incoming=approach?.heading??car.edge.heading;
        const junction=this.junctions.find(j=>j.id===(s.timingId??s.id));
        const turn=this.junctionExit(car,junction)?.turn??(car.next?wrapAngle(car.next.heading-car.edge.heading):0);
        const right=turn>.4&&turn<2.5,arrowPhase=signalTurnPhase(s,incoming,time),phase = signalPhase(s,incoming,time);
        if (phase === "green"&&!(right&&arrowPhase==='red')) continue;
        if (phase === 'flash-yellow') {target=Math.min(target,6);continue;}
        if (phase === 'flash-red') {
          car.signalStops??=new Map();const held=car.signalStops.get(s.id)||0;
          if(toLine<4&&car.speed<.2)car.signalStops.set(s.id,held+dt);
          if(held>=1.2)continue;
        }
        if(right&&arrowPhase==='green')continue;
        // Yellow: stop only if a comfortable stop (≤3.5 m/s²) is still possible.
        if ((right&&arrowPhase==='yellow'||phase === "yellow") && car.speed ** 2 / (2 * Math.max(0.1, toLine)) > 3.5) continue;
        target = Math.min(target, Math.sqrt(2 * 2.5 * Math.max(0, toLine - 0.5)));
        stopTravel=Math.min(stopTravel,Math.max(0,toLine-.15));
        if(this.debug)car.waitReasons.push({signal:s.id,phase,arrowPhase,right,toLine});
      }
      for(const junction of this.junctions){
        const s=junction.center,{radius,id}=junction,d=distance(car,s);
        if(d>radius+18)continue;
        const ahead=(s.x-car.x)*f.x+(s.y-car.y)*f.y,lateral=Math.abs((s.x-car.x)*f.y-(s.y-car.y)*f.x);
        if(ahead<0||lateral>radius)continue;
        const lock=this.junctionOwners.get(id),entry=ahead-radius-car.length/2,exit=this.junctionExit(car,junction),turn=exit?.turn??0;
        if(lock?.car===car)continue;
        const incoming=this.signalApproach(s,car.edge.heading)?.heading??car.edge.heading;
        const arrow=signalTurnPhase(s,incoming,time),phase=junction.signal?signalPhase(s,incoming,time):'green',right=turn>.4&&turn<2.5;
        const allowed=phase==='green'&&!(right&&arrow==='red')||right&&arrow==='green'||phase==='flash-yellow'||phase==='flash-red'&&(car.signalStops?.get(s.id)||0)>=1.2;
        const oncoming=right&&arrow!=='green'&&bodies.some(other=>{
          if(other===car||other.barrier||Math.cos(other.heading-car.heading)>-.7)return false;
          const of=forward(other.heading),toCross=(s.x-other.x)*of.x+(s.y-other.y)*of.y;
          const crossOffset=Math.abs((s.x-other.x)*of.y-(s.y-other.y)*of.x);
          return toCross>-other.length&&toCross<Math.max(18,(other.speed||0)*5)&&crossOffset<radius&&other.speed>.3;
        });
        const exitBlocked=exit&&bodies.some(other=>other!==car&&other.length&&rectanglesOverlap(exit,{length:car.length+5,width:car.width+.25},other,other));
        const path=this.previewPath(car,radius*2+30);
        const occupied=bodies.some(other=>other!==car&&other.length&&distance(other,s)<radius+other.length/2&&distance(other,s)<d-1&&
          path.slice(1).some((p,i)=>nearestOnSegment(other,path[i],p).distance<(car.width+other.width)/2+.2));
        // Closely spaced stop lines can share the same exit space. Acquire
        // that space atomically, rather than letting two cars hold one half
        // each and wait forever for the other half to clear.
        const adjacentLock=[...this.junctionOwners.values()].some(other=>other.car!==car&&
          distance(other.center,s)<other.radius+radius+Math.max(car.length,other.car.length)+3);
        if(entry>-.5&&(lock||adjacentLock||oncoming||exitBlocked||occupied||!allowed)){
          if(this.debug)car.waitReasons.push({junction:id,entry,owner:lock?.car.id,oncoming,exitBlocked,occupied,allowed});
          target=Math.min(target,Math.sqrt(5*Math.max(0,entry-.5)));
          stopTravel=Math.min(stopTravel,Math.max(0,entry-.15));
        }else if(!lock&&entry<4&&entry>=-.5&&target>.2&&allowed){
          this.junctionOwners.set(id,{car,center:s,radius,entered:false,since:time});
        }
      }
      car.braking = target < 0.15 || target < car.speed - 0.05;
      const speed = Math.max(0, car.speed + Math.max(-4.5 * dt, Math.min(1.4 * dt, target - car.speed)));
      // Never advance into another body (including the player's car).
      const probe = { ...car, x: car.x + f.x * speed * dt * 4, y: car.y + f.y * speed * dt * 4 };
      const hits = bodies.filter(
        (other) => other !== car && other.length && rectanglesOverlap(probe, car, other, other),
      );
      // After a long AI-only standoff, relax the forward safety probe;
      // the actual-position check below still prevents bodies overlapping.
      // The player and toll barriers always retain the forward safety gap.
      car.blockedFor = hits.length ? (car.blockedFor || 0) + dt : 0;
      const blocked = hits.includes(player) || hits.some(h=>h.barrier) || (hits.length > 0 && car.blockedFor < 6);
      if(this.debug&&blocked)car.waitReasons.push({probe:hits.map(c=>c.id)});
      const previousState={edge:car.edge,next:car.next,previous:car.previous,along:car.along,x:car.x,y:car.y,heading:car.heading};
      const passed=[];
      car.speed = blocked ? 0 : Math.min(speed,Math.max(0,pedestrianStop)/Math.max(dt,.001),stopTravel/Math.max(dt,.001));
      if(car.speed<speed-.01)car.braking=true;
      if (blocked) car.braking = true;
      car.along += car.speed * dt;
      let guard = 0;
      while (car.along > car.edge.length && guard++ < 8) {
        car.along -= car.edge.length;
        const boundaryExit=car.edge.to.out.length===1&&car.edge.to.out[0].to.key===car.edge.from.key&&distance(car,player)>100;
        const next = boundaryExit?null:car.next ?? this.chooseNext(car, car.edge);
        car.next = null;
        if (!next) {
          car.along = car.edge.length - 0.1;
          car.speed = 0;
          car.braking = true;
          car.finished = true;
          break;
        }
        passed.push(car.edge.id);
        car.previous=car.edge;car.edge = next;car.next=this.chooseNext(car,car.edge);
      }
      this.place(car);
      // Switching to a differently sized/angled lane can move the centre
      // sideways. Check the actual result as well as the forward probe.
      const entered=bodies.some(other=>other!==car&&other.length&&rectanglesOverlap(car,car,other,other)&&
        blocksMove(previousState,car,other,rectanglesOverlap(previousState,car,other,other)));
      if(entered||this.pedestrianBlocked?.(previousState,car)){Object.assign(car,previousState);car.speed=0;car.braking=true;if(this.debug)car.waitReasons.push({collision:true});}
      else if(passed.length){car.visits??=new Map();for(const id of passed){car.visits.set(id,(car.visits.get(id)||0)+1);car.plan?.delete(id);}}
    }
    // A clipped one-way road is an exit from the simulated district, not a
    // permanent parked car. Re-enter traffic at an unoccupied distant edge.
    const active=this.cars.filter(c=>!c.finished||distance(c,player)<100);
    this.pendingSpawn=(this.pendingSpawn||0)+this.cars.length-active.length;
    this.cars=active;
    if(this.pendingSpawn>0&&time>=(this.nextReplenish??0)){
      this.nextReplenish=time+3;
      const fresh=new TrafficSimulation(this.roads||[],this.signals,this.origin,this.targetCount);
      for(const candidate of fresh.cars){
        if(this.pendingSpawn<=0||this.cars.length>=this.targetCount)break;
        if(distance(candidate,player)<100||this.cars.some(c=>rectanglesOverlap(candidate,{...candidate,length:candidate.length+8,width:candidate.width+.5},c,c)))continue;
        candidate.id='r'+this.serial++;this.cars.push(candidate);this.pendingSpawn--;
      }
    }
    this.serial++;
  }
}
