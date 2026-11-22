// The screenshot scenes behind ?shot=start|play|chase|mission. Each one plays the real
// rules forward from a fresh world for a fixed number of steps, steered by a simple
// autopilot that follows the road grid toward waypoints, so the frame is what real
// play looks like and the same seed always gives the same frame.
import { CLUB, STEP } from './config.js';
import { blankControls } from './input.js';
import { roadRoute } from './world.js';
import { SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 5;
const PLAY_SECONDS = 14;
const CHASE_SECONDS = 10;
const MISSION_SECONDS = 4;

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

/**
 * Drive the player's car toward a list of waypoints, by pure pursuit: aim at the
 * point on the route polyline 140 px ahead of the car's closest point on it.
 * That rounds corners smoothly instead of overshooting them (at full speed a car
 * cannot make a 90-degree turn at a waypoint and sails onto the beach or into a
 * building), and it recovers when a collision knocks the car off the route.
 * `pilot` carries the stuck detection between calls.
 */
function autopilot(state, pilot) {
  const controls = blankControls();
  const player = state.player;
  if (!player.inCar) return controls;
  const car = state.cars[player.carId];
  if (!car) return controls;
  const wps = pilot.waypoints;
  if (!wps.length) return controls;
  const final = wps[wps.length - 1];
  if (Math.hypot(final.x - car.x, final.y - car.y) < 45) return controls;
  // Closest point on the route polyline.
  let bestD = Infinity;
  let bestSeg = 0;
  let bestX = wps[0].x;
  let bestY = wps[0].y;
  for (let i = 0; i < wps.length - 1; i += 1) {
    const ax = wps[i].x;
    const ay = wps[i].y;
    const dx = wps[i + 1].x - ax;
    const dy = wps[i + 1].y - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 === 0 ? 0 : ((car.x - ax) * dx + (car.y - ay) * dy) / len2;
    t = Math.max(0, Math.min(1, t));
    const px = ax + dx * t;
    const py = ay + dy * t;
    const d = Math.hypot(car.x - px, car.y - py);
    if (d < bestD) { bestD = d; bestSeg = i; bestX = px; bestY = py; }
  }
  // Lookahead point 140 px ahead along the route from that closest point.
  let remaining = 140;
  let ax = bestX;
  let ay = bestY;
  let si = bestSeg;
  while (remaining > 0 && si < wps.length - 1) {
    const bx = wps[si + 1].x;
    const by = wps[si + 1].y;
    const segLen = Math.hypot(bx - ax, by - ay);
    if (segLen <= remaining) {
      remaining -= segLen;
      ax = bx; ay = by;
      si += 1;
    } else {
      const r = remaining / segLen;
      ax += (bx - ax) * r;
      ay += (by - ay) * r;
      remaining = 0;
    }
  }
  const desired = Math.atan2(ay - car.y, ax - car.x);
  const diff = angleDiff(desired, car.angle);
  if (diff > 0.12) controls.right = true;
  else if (diff < -0.12) controls.left = true;
  // Stuck (pressed against a building): reverse briefly. Speed-based: at low
  // speed a car legitimately covers under 2 px a step.
  pilot.stuckTimer -= 1 / 60;
  if (Math.abs(car.speed) < 25) pilot.still += 1 / 60;
  else pilot.still = 0;
  if (pilot.still > 1.2) {
    pilot.reverseTimer = 0.7;
    pilot.still = 0;
  }
  if (pilot.reverseTimer > 0) {
    pilot.reverseTimer -= 1 / 60;
    controls.down = true;
    controls.left = !controls.left;
    controls.right = !controls.right;
    return controls;
  }
  // Brake for a sharp turn, coast for a medium one, accelerate when aligned.
  // The brake only bites above ~120 speed: below that the car turns tightly
  // enough, and a surrounded car at a standstill must be allowed to get moving.
  if (Math.abs(diff) > 0.9 && Math.abs(car.speed) > 120) {
    controls.down = true;
  } else if (Math.abs(diff) > 0.45 && Math.abs(car.speed) > 200) {
    // Coast: no throttle, no brake.
  } else {
    controls.up = true;
  }
  if (Math.abs(diff) > 1.1 && Math.abs(car.speed) > 220) controls.handbrake = true;
  return controls;
}

function putPlayerInCar(state, x, y, angle) {
  // Find the nearest parked car and place the player in it, as if they stole it.
  let best = null; let bestD = Infinity;
  for (const car of state.cars) {
    if (!car.active || car.kind !== 'parked') continue;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  }
  if (!best) return false;
  best.x = x; best.y = y; best.angle = angle; best.kind = 'player';
  state.player.inCar = true;
  state.player.carId = best.id;
  state.player.x = x; state.player.y = y; state.player.angle = angle;
  return true;
}

function makePilot(waypoints) {
  return { waypoints, index: 0, lastX: 0, lastY: 0, still: 0, stuckTimer: 0, reverseTimer: 0 };
}

/**
 * Set `world` to the named scene (start, play, chase or mission; any other name is
 * start) and return the screen to draw over it.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'chase' && name !== 'mission') {
    for (let i = 0; i < START_SECONDS / STEP; i += 1) world.step(STEP, blankControls(), true);
    return { screen: SCREEN_TITLE, saveInfo: null };
  }

  if (name === 'play') {
    putPlayerInCar(state, 420, 760, 0);
    const pilot = makePilot([
      { x: 2240, y: 760 }, { x: 2240, y: 1520 }, { x: 320, y: 1520 }, { x: 320, y: 760 }, { x: 1600, y: 760 },
    ]);
    for (let i = 0; i < PLAY_SECONDS / STEP; i += 1) {
      world.step(STEP, autopilot(state, pilot), false);
    }
    return { screen: SCREEN_PLAY, saveInfo: null };
  }

  if (name === 'chase') {
    putPlayerInCar(state, 420, 760, 0);
    state.wanted = 3;
    state.policeSpawnTimer = 0;
    const pilot = makePilot([
      { x: 2240, y: 760 }, { x: 2240, y: 1520 }, { x: 320, y: 1520 }, { x: 320, y: 760 }, { x: 1600, y: 760 },
    ]);
    for (let i = 0; i < CHASE_SECONDS / STEP; i += 1) {
      world.step(STEP, autopilot(state, pilot), false);
    }
    return { screen: SCREEN_PLAY, saveInfo: null };
  }

  // mission: mid-delivery, package in the car, Neon Palms ahead. The cops
  // noticed the pickup, so the heat is on (1 star) — matching the dialog line.
  state.mission = 1;
  state.stage = 1;
  state.hasPackage = true;
  state.wanted = 1;
  putPlayerInCar(state, 2100, 760, Math.PI);
  const pilot = makePilot(roadRoute({ x: 2100, y: 760 }, { x: CLUB.x, y: CLUB.y }));
  for (let i = 0; i < MISSION_SECONDS / STEP; i += 1) {
    world.step(STEP, autopilot(state, pilot), false);
  }
  state.dialog = { text: 'Jax: "Package secured. Now the Palms — and the cops noticed."', timer: 4.2 };
  state.dialogQueue.length = 0;
  return { screen: SCREEN_PLAY, saveInfo: null };
}
