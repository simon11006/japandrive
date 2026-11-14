export const NAV_ANCHOR = .7;
export function nextNavigationStep(steps,travelled,remaining) {
  // Keep the current turn until the car actually passes the junction. The
  // old +8 m threshold advanced the instruction before the driver turned.
  const index=steps.findIndex(s=>s.maneuver.type!=='depart'&&s.atDistance>=travelled-5);
  const next=index<0?steps.at(-1):steps[index];
  return {next,toTurn:Math.max(0,next?next.atDistance-travelled:remaining),then:index>=0?steps[index+1]:null};
}
export function navigationBanner(info={}) {
  return !info.parking&&info.maneuver?.type==='turn'&&info.toTurn<=45?.35:.25;
}
export function navigationScale(height,speed,info={}) {
  if(info.parking&&info.parkingDistance<40)return 7;
  const distance=Math.max(0,info.toTurn??Infinity);
  if(distance<180&&info.maneuver?.type==='turn'){
    const available=height*(NAV_ANCHOR-navigationBanner(info)-.055);
    return Math.max(.8,Math.min(7,available/Math.max(20,distance+9)));
  }
  return Math.max(1.1,Math.min(2.8,height/(140+Math.max(0,speed)*11)));
}
