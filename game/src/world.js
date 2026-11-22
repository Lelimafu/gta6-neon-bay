// Neon Bay — the game's rules and state, with no drawing and no browser in it: the
// city, the player on foot and in cars, traffic, pedestrians, police, the wanted
// level, the three-mission story and the side jobs. step() advances one fixed step
// and returns what happened as bit flags, so the caller can react without the world
// knowing about screens or sound. Nothing here allocates after createWorld returns
// (pools are fixed at boot).
import {
  BEACH_Y, CAR, CLUB, DOCKS, ECONOMY, HARBOUR, MISSIONS, OCEAN_Y, PAINT_SHOP,
  PARK, PED, PLAYER, PLAYER_START, POLICE, ROADS_X, ROADS_Y, ROAD_W, SAFEHOUSE,
  SIDE_JOB_REWARD, SIDE_JOB_SPOTS, TRAFFIC, WANTED, WORLD,
} from './config.js';
import { pick, range } from './random.js';

export const EVENT_CRASH = 1;
export const EVENT_PUNCH = 2;
export const EVENT_PICKUP = 4;
export const EVENT_MISSION = 8;
export const EVENT_BUSTED = 16;
export const EVENT_WASTED = 32;
export const EVENT_WANTED = 64;
export const EVENT_ENTER_CAR = 128;
export const EVENT_SPRAY = 256;
export const EVENT_STEAL = 512;

const CAR_COLORS = ['#d94f3d', '#3d7dd9', '#e8b93c', '#7dd93d', '#9b59d0', '#e8e8e8', '#222831', '#ff7a1a', '#2ec4b6', '#c9c9c9'];
const PED_SHIRTS = ['#e8e8e8', '#3d7dd9', '#d94f3d', '#e8b93c', '#7dd93d', '#9b59d0', '#ff7a1a', '#2ec4b6'];
const ROOFS = ['#c96f4a', '#b85c5c', '#7d8aa5', '#a5875e', '#6f9a7d', '#946b9e'];

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

function angleDiff(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function dist(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function onRoad(x, y) {
  for (const rx of ROADS_X) if (Math.abs(x - rx) < ROAD_W / 2) return true;
  for (const ry of ROADS_Y) if (Math.abs(y - ry) < ROAD_W / 2) return true;
  return false;
}

/** Waypoints along the road grid from `from` to `to` (Manhattan route via roads). */
export function roadRoute(from, to) {
  const nearestX = ROADS_X.reduce((a, b) => (Math.abs(b - to.x) < Math.abs(a - to.x) ? b : a));
  const nearestY = ROADS_Y.reduce((a, b) => (Math.abs(b - to.y) < Math.abs(a - to.y) ? b : a));
  // Nearest road to `from`; ties break toward the target's road, so the first leg
  // heads in the direction the trip is going.
  const startY = ROADS_Y.reduce((a, b) => {
    const da = Math.abs(a - from.y);
    const db = Math.abs(b - from.y);
    if (db < da) return b;
    if (db === da && Math.abs(b - to.y) < Math.abs(a - to.y)) return b;
    return a;
  });
  const points = [
    { x: from.x, y: startY },
    { x: nearestX, y: startY },
    { x: nearestX, y: nearestY },
    { x: to.x, y: nearestY },
    { x: to.x, y: to.y },
  ];
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (!last || Math.hypot(p.x - last.x, p.y - last.y) > 40) out.push(p);
  }
  return out;
}

/** Push a circle out of a rect; returns true when it overlapped. */
function resolveCircleRect(obj, r, rect) {
  const cx = clamp(obj.x, rect.x, rect.x + rect.w);
  const cy = clamp(obj.y, rect.y, rect.y + rect.h);
  const dx = obj.x - cx;
  const dy = obj.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > 0.0001) {
    const d = Math.sqrt(d2);
    obj.x = cx + (dx / d) * r;
    obj.y = cy + (dy / d) * r;
  } else {
    // Centre inside the rect: push out along the smallest penetration.
    const left = obj.x - rect.x;
    const right = rect.x + rect.w - obj.x;
    const top = obj.y - rect.y;
    const bottom = rect.y + rect.h - obj.y;
    const m = Math.min(left, right, top, bottom);
    if (m === left) obj.x = rect.x - r;
    else if (m === right) obj.x = rect.x + rect.w + r;
    else if (m === top) obj.y = rect.y - r;
    else obj.y = rect.y + rect.h + r;
  }
  return true;
}

export function createWorld(random) {
  const player = {
    x: PLAYER_START.x, y: PLAYER_START.y, angle: 0, inCar: false, carId: -1,
    punchTimer: 0, punchCooldown: 0, invuln: 0, damageTimer: 99,
  };
  const cars = [];
  const traffic = [];
  const peds = [];
  const cops = [];
  const particles = [];
  const skids = [];
  const buildings = [];
  const trees = [];
  const palms = [];
  const lamps = [];
  const parkedSpots = [];

  const state = {
    player, cars, traffic, peds, cops, particles, skids, buildings, trees, palms, lamps,
    time: 0, cash: ECONOMY.startCash, health: 100, wanted: 0,
    mission: 0, stage: 0, hasPackage: false,
    sideJob: null, sideJobCooldown: 0,
    dialog: null, dialogQueue: [],
    banner: null,
    marker: null,
    shake: 0, mode: 'play', modeTimer: 0,
    decayTimer: 0, policeSpawnTimer: 0, bustTimer: 0, ramCooldown: 0, sprayCooldown: 0,
    speed: 0, // player car speed, for the HUD
  };

  function addDialog(text) {
    state.dialogQueue.push(text);
  }

  function setBanner(text) {
    state.banner = { text, timer: 2.6 };
  }

  function makeCar(x, y, angle, color, kind) {
    const car = {
      id: cars.length, x, y, angle, speed: 0, color, health: CAR.health, kind, active: true, smoke: 0,
      route: null, routeIdx: 0, routeTimer: 0, stuck: 0, reverseTimer: 0, lastX: x, lastY: y, ramTimer: 0,
    };
    cars.push(car);
    return car;
  }

  function spawnParticles(x, y, count, color, speed, life, size) {
    for (let i = 0; i < count; i += 1) {
      const p = particles.find((q) => q.life <= 0);
      if (!p) return;
      const a = random() * Math.PI * 2;
      const v = speed * (0.4 + random() * 0.8);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.life = life * (0.6 + random() * 0.7); p.maxLife = p.life;
      p.color = color; p.size = size * (0.7 + random() * 0.6);
    }
  }

  function addSkid(x, y, angle) {
    const s = skids.find((q) => q.life <= 0);
    if (!s) return;
    s.x = x; s.y = y; s.angle = angle; s.life = 6;
  }

  function solidForCar(obj) {
    for (const b of buildings) if (resolveCircleRect(obj, CAR.radius, b)) return b;
    if (resolveCircleRect(obj, CAR.radius, HARBOUR)) return HARBOUR;
    if (obj.y > OCEAN_Y - CAR.radius) { obj.y = OCEAN_Y - CAR.radius; return 'ocean'; }
    if (obj.x < CAR.radius) obj.x = CAR.radius;
    if (obj.x > WORLD.width - CAR.radius) obj.x = WORLD.width - CAR.radius;
    if (obj.y < CAR.radius) obj.y = CAR.radius;
    if (obj.y > WORLD.height - CAR.radius) obj.y = WORLD.height - CAR.radius;
    return null;
  }

  function solidForPed(obj) {
    for (const b of buildings) resolveCircleRect(obj, PLAYER.radius, b);
    resolveCircleRect(obj, PLAYER.radius, HARBOUR);
    if (obj.y > OCEAN_Y - PLAYER.radius) obj.y = OCEAN_Y - PLAYER.radius;
    obj.x = clamp(obj.x, PLAYER.radius, WORLD.width - PLAYER.radius);
    obj.y = clamp(obj.y, PLAYER.radius, WORLD.height - PLAYER.radius);
  }

  function randomSidewalkSpot() {
    if (random() < 0.5) {
      const ry = pick(random, ROADS_Y);
      return { x: 60 + random() * (WORLD.width - 120), y: ry + (random() < 0.5 ? -78 : 78), axis: 'h', road: ry, dir: random() < 0.5 ? -1 : 1, side: random() < 0.5 ? -1 : 1 };
    }
    const rx = pick(random, ROADS_X);
    return { x: rx + (random() < 0.5 ? -78 : 78), y: 60 + random() * (WORLD.height - 220), axis: 'v', road: rx, dir: random() < 0.5 ? -1 : 1, side: random() < 0.5 ? -1 : 1 };
  }

  function reset() {
    player.x = PLAYER_START.x; player.y = PLAYER_START.y; player.angle = 0;
    player.inCar = false; player.carId = -1;
    player.punchTimer = 0; player.punchCooldown = 0; player.invuln = 0; player.damageTimer = 99;
    cars.length = 0; traffic.length = 0; peds.length = 0; cops.length = 0;
    particles.length = 0; skids.length = 0;
    buildings.length = 0; trees.length = 0; palms.length = 0; lamps.length = 0; parkedSpots.length = 0;
    for (let i = 0; i < 160; i += 1) particles.push({ x: 0, y: 0, vx: 0, vy: 0, life: 0, maxLife: 1, color: '#fff', size: 3 });
    for (let i = 0; i < 240; i += 1) skids.push({ x: 0, y: 0, angle: 0, life: 0 });

    state.time = 0; state.cash = ECONOMY.startCash; state.health = 100; state.wanted = 0;
    state.mission = 0; state.stage = 0; state.hasPackage = false;
    state.sideJob = null; state.sideJobCooldown = 0;
    state.dialog = null; state.dialogQueue.length = 0;
    state.banner = null; state.marker = null;
    state.shake = 0; state.mode = 'play'; state.modeTimer = 0;
    state.decayTimer = 0; state.policeSpawnTimer = 0; state.bustTimer = 0;
    state.ramCooldown = 0; state.sprayCooldown = 0; state.sprayWarned = false; state.speed = 0;

    // --- City blocks: grid cells between the roads. ---
    const xBlocks = [[0, 260], [380, 900], [1020, 1540], [1660, 2180], [2300, 2560]];
    const yBlocks = [[0, 240], [360, 700], [820, 1160], [1280, 1460], [1580, 1640]];
    const isPark = (xb, yb) => xb[0] === 1020 && yb[0] === 820;
    const isHarbourBlock = (xb) => xb[0] === 2300;
    const isClubBlock = (xb, yb) => xb[0] === 380 && yb[0] === 360;
    const isSafehouseBlock = (xb, yb) => xb[0] === 0 && yb[0] === 1280;
    const isPaintStrip = (yb) => yb[0] === 1580;

    for (const xb of xBlocks) {
      for (const yb of yBlocks) {
        if (isPark(xb, yb) || isHarbourBlock(xb) || isPaintStrip(yb)) continue;
        if (isClubBlock(xb, yb)) {
          buildings.push({ x: 640, y: 390, w: 150, h: 110, color: '#5a2d6e', club: true });
          continue;
        }
        if (isSafehouseBlock(xb, yb)) {
          buildings.push({ x: 110, y: 1310, w: 120, h: 110, color: '#a5875e', house: true });
          continue;
        }
        const downtown = xb[0] >= 380 && xb[0] <= 1660 && yb[0] >= 360 && yb[0] <= 1160;
        const count = 1 + Math.floor(random() * (downtown ? 3 : 2));
        for (let n = 0; n < count; n += 1) {
          const w = downtown ? 110 + random() * 130 : 90 + random() * 110;
          const h = downtown ? 90 + random() * 110 : 70 + random() * 90;
          const bx = xb[0] + 16 + random() * Math.max(1, xb[1] - xb[0] - w - 32);
          const by = yb[0] + 16 + random() * Math.max(1, yb[1] - yb[0] - h - 32);
          // Keep the start area clear: the player walks from the safehouse to the
          // car parked right by it, so no building may sit in that corridor — nor
          // in the corridor south from the car to the road, which the first drive
          // out of the start area uses.
          if (bx < 640 && bx + w > 380 && by < 1430 && by + h > 1320) continue;
          if (bx < 570 && bx + w > 470 && by < 1580 && by + h > 1430) continue;
          let overlap = false;
          for (const b of buildings) {
            if (bx < b.x + b.w + 14 && bx + w + 14 > b.x && by < b.y + b.h + 14 && by + h + 14 > b.y) { overlap = true; break; }
          }
          if (!overlap) buildings.push({ x: bx, y: by, w, h, color: pick(random, ROOFS) });
        }
      }
    }
    // Paint shop garage on the south strip.
    buildings.push({ x: PAINT_SHOP.x - 75, y: PAINT_SHOP.y - 28, w: 150, h: 56, color: '#3d6e8f', garage: true });
    // Harbour containers.
    buildings.push({ x: 2320, y: 420, w: 46, h: 120, color: '#d94f3d', container: true });
    buildings.push({ x: 2320, y: 580, w: 46, h: 120, color: '#3d7dd9', container: true });
    buildings.push({ x: 2320, y: 1000, w: 46, h: 120, color: '#e8b93c', container: true });

    // Park trees + pond-side trees.
    for (let i = 0; i < 26; i += 1) {
      const x = PARK.x + 20 + random() * (PARK.w - 40);
      const y = PARK.y + 20 + random() * (PARK.h - 40);
      if (Math.hypot((x - 1280) / 130, (y - 1010) / 70) < 1.1) continue;
      trees.push({ x, y, r: 12 + random() * 10 });
    }
    // Palms along the beach.
    for (let x = 60; x < WORLD.width; x += 95) {
      palms.push({ x: x + range(random, -20, 20), y: BEACH_Y + 30 + random() * 60 });
    }
    // Palms and lamps along the roads.
    for (const ry of ROADS_Y) {
      for (let x = 140; x < WORLD.width; x += 260) {
        if (random() < 0.55) palms.push({ x: x + range(random, -30, 30), y: ry + (random() < 0.5 ? -82 : 82) });
        lamps.push({ x, y: ry + (random() < 0.5 ? -74 : 74) });
      }
    }
    for (const rx of ROADS_X) {
      for (let y = 140; y < BEACH_Y; y += 260) {
        if (random() < 0.4) palms.push({ x: rx + (random() < 0.5 ? -82 : 82), y: y + range(random, -30, 30) });
        lamps.push({ x: rx + (random() < 0.5 ? -74 : 74), y });
      }
    }

    // Parked cars along the roads.
    for (let i = 0; i < 26; i += 1) {
      let x; let y; let angle;
      if (random() < 0.55) {
        const ry = pick(random, ROADS_Y);
        x = 80 + random() * (WORLD.width - 160);
        let near = false;
        for (const rx of ROADS_X) if (Math.abs(x - rx) < 110) near = true;
        if (near) continue;
        y = ry + (random() < 0.5 ? -82 : 82);
        angle = random() < 0.5 ? 0 : Math.PI;
      } else {
        const rx = pick(random, ROADS_X);
        y = 80 + random() * (BEACH_Y - 200);
        let near = false;
        for (const ry of ROADS_Y) if (Math.abs(y - ry) < 110) near = true;
        if (near) continue;
        x = rx + (random() < 0.5 ? -82 : 82);
        angle = random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
      }
      // Keep the start area clear: one car right by the player for mission 1.
      if (dist(x, y, PLAYER_START.x, PLAYER_START.y) < 220) continue;
      parkedSpots.push({ x, y, angle, color: pick(random, CAR_COLORS) });
    }
    // A car parked right next to the start, so mission 1 can begin at once.
    parkedSpots.push({ x: PLAYER_START.x + 100, y: PLAYER_START.y, angle: 0, color: '#ff7a1a' });
    for (const s of parkedSpots) makeCar(s.x, s.y, s.angle, s.color, 'parked');

    // Traffic.
    for (let i = 0; i < TRAFFIC.count; i += 1) {
      const car = spawnTrafficCar();
      traffic.push(car);
    }

    // Pedestrians.
    for (let i = 0; i < PED.count; i += 1) {
      const spot = randomSidewalkSpot();
      peds.push({
        x: spot.x, y: spot.y, angle: spot.dir > 0 ? 0 : Math.PI, axis: spot.axis, road: spot.road,
        dir: spot.dir, side: spot.side, speed: range(random, PED.walkMin, PED.walkMax),
        state: 'walk', timer: 0, shirt: pick(random, PED_SHIRTS), fleeX: 0, fleeY: 0,
      });
    }
  }

  function spawnTrafficCar() {
    const horizontal = random() < 0.5;
    let car; let t;
    if (horizontal) {
      const ry = pick(random, ROADS_Y);
      const dir = random() < 0.5 ? 1 : -1;
      car = makeCar(60 + random() * (WORLD.width - 120), ry + dir * 28, dir > 0 ? 0 : Math.PI, pick(random, CAR_COLORS), 'traffic');
      t = { carId: car.id, axis: 'h', road: ry, dir, cruise: range(random, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax), turnTimer: 1 };
    } else {
      const rx = pick(random, ROADS_X);
      const dir = random() < 0.5 ? 1 : -1;
      car = makeCar(rx - dir * 28, 60 + random() * (BEACH_Y - 160), dir > 0 ? Math.PI / 2 : -Math.PI / 2, pick(random, CAR_COLORS), 'traffic');
      t = { carId: car.id, axis: 'v', road: rx, dir, cruise: range(random, TRAFFIC.cruiseMin, TRAFFIC.cruiseMax), turnTimer: 1 };
    }
    return t;
  }

  function nearestCar(x, y, maxDist) {
    let best = null; let bestD = maxDist;
    for (const car of cars) {
      if (!car.active || car.health <= 0) continue;
      const d = dist(x, y, car.x, car.y);
      if (d < bestD) { bestD = d; best = car; }
    }
    return best;
  }

  function raiseWanted(n) {
    const before = state.wanted;
    state.wanted = clamp(state.wanted + n, 0, WANTED.max);
    if (state.wanted > before) return EVENT_WANTED;
    return 0;
  }

  function respawn(kind) {
    player.x = SAFEHOUSE.x + 90; player.y = SAFEHOUSE.y;
    player.angle = 0; player.inCar = false; player.carId = -1;
    player.punchTimer = 0; player.punchCooldown = 0; player.invuln = 0;
    player.damageTimer = 99;
    state.health = 100;
    state.wanted = 0; state.bustTimer = 0; state.decayTimer = 0;
    state.mode = 'play'; state.modeTimer = 0;
    for (const cop of cops) cop.state = 'gone';
    for (const car of cars) if (car.active && car.kind === 'police') car.active = false;
    if (kind === 'busted') state.cash = Math.max(0, state.cash - ECONOMY.bustedFine);
    else state.cash = Math.max(0, state.cash - ECONOMY.wastedLoss);
    addDialog(kind === 'busted'
      ? 'Jax: "Busted. They took my cash and dropped me at the safehouse."'
      : 'Jax: "That hurt. Back at the safehouse — stay out of trouble."');
  }

  function enterCar(car) {
    player.inCar = true;
    player.carId = car.id;
    let events = EVENT_ENTER_CAR;
    if (car.kind === 'police') {
      events |= EVENT_STEAL | raiseWanted(2);
      car.kind = 'player';
    } else if (car.kind === 'parked' || car.kind === 'traffic') {
      events |= EVENT_STEAL | raiseWanted(1);
      if (car.kind === 'traffic') {
        // The driver bails and runs.
        const idx = traffic.findIndex((t) => t.carId === car.id);
        if (idx >= 0) traffic.splice(idx, 1);
        const spot = randomSidewalkSpot();
        peds.push({
          x: car.x, y: car.y, angle: 0, axis: 'h', road: spot.road, dir: 1, side: 1,
          speed: PED.fleeSpeed, state: 'flee', timer: 2, shirt: '#e8e8e8', fleeX: 0, fleeY: -1,
        });
        // Keep the traffic count up: a fresh car joins elsewhere.
        traffic.push(spawnTrafficCar());
      }
      car.kind = 'player';
    }
    return events;
  }

  function exitCar() {
    const car = cars[player.carId];
    player.inCar = false;
    player.carId = -1;
    if (car) {
      const px = car.x + Math.cos(car.angle + Math.PI / 2) * 34;
      const py = car.y + Math.sin(car.angle + Math.PI / 2) * 34;
      player.x = px; player.y = py;
      solidForPed(player);
    }
    return 0;
  }

  function doPunch() {
    let events = 0;
    player.punchTimer = 0.25;
    player.punchCooldown = PLAYER.punchCooldown;
    const px = player.x + Math.cos(player.angle) * 26;
    const py = player.y + Math.sin(player.angle) * 26;
    for (const ped of peds) {
      if (ped.state === 'down') continue;
      if (dist(px, py, ped.x, ped.y) > PLAYER.punchRange) continue;
      if (Math.abs(angleDiff(Math.atan2(ped.y - player.y, ped.x - player.x), player.angle)) > PLAYER.punchArc) continue;
      ped.state = 'down'; ped.timer = PED.downTime;
      ped.fleeX = Math.cos(player.angle); ped.fleeY = Math.sin(player.angle);
      events |= EVENT_PUNCH | raiseWanted(1);
      spawnParticles(ped.x, ped.y, 6, '#ffe14d', 120, 0.4, 4);
    }
    for (const cop of cops) {
      if (cop.state === 'down' || cop.state === 'gone') continue;
      if (dist(px, py, cop.x, cop.y) > PLAYER.punchRange) continue;
      if (Math.abs(angleDiff(Math.atan2(cop.y - player.y, cop.x - player.x), player.angle)) > PLAYER.punchArc) continue;
      cop.health -= 1;
      cop.punchTimer = 0.6;
      events |= EVENT_PUNCH | raiseWanted(2);
      spawnParticles(cop.x, cop.y, 8, '#ffe14d', 140, 0.4, 4);
      if (cop.health <= 0) { cop.state = 'down'; cop.timer = 5; }
    }
    return events;
  }

  function drivePlayerCar(dt, c) {
    const car = cars[player.carId];
    if (!car || !car.active) return;
    const forward = c.up ? 1 : 0;
    const back = c.down ? 1 : 0;
    const steer = (c.right ? 1 : 0) - (c.left ? 1 : 0);
    if (car.health <= 0) {
      car.speed = Math.max(0, car.speed - 300 * dt);
    } else if (forward) {
      car.speed += CAR.accel * dt;
    } else if (back) {
      car.speed += car.speed > 30 ? -CAR.brake * dt : -CAR.reverseAccel * dt;
    } else {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 260 * dt);
    }
    if (c.handbrake) {
      car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), CAR.handbrakeDecel * dt);
    }
    const maxF = onRoad(car.x, car.y) ? CAR.maxForward : CAR.offroadMax;
    car.speed = clamp(car.speed, -CAR.maxReverse, maxF);
    const speedFactor = clamp(Math.abs(car.speed) / 200, 0, 1) * (1 - (Math.abs(car.speed) / CAR.maxForward) * 0.5);
    car.angle += steer * CAR.steerRate * speedFactor * Math.sign(car.speed || 1) * dt;
    if (c.handbrake && Math.abs(car.speed) > 180) {
      car.angle += steer * 1.1 * dt * Math.sign(car.speed);
      addSkid(car.x - Math.cos(car.angle) * 16, car.y - Math.sin(car.angle) * 16, car.angle);
      addSkid(car.x - Math.cos(car.angle) * 16, car.y - Math.sin(car.angle) * 16, car.angle);
    }
    const nx = car.x + Math.cos(car.angle) * car.speed * dt;
    const ny = car.y + Math.sin(car.angle) * car.speed * dt;
    car.x = nx; car.y = ny;
    const hit = solidForCar(car);
    if (hit) {
      if (Math.abs(car.speed) > 130) {
        const dmg = Math.round((Math.abs(car.speed) - 130) / 12);
        car.health -= dmg;
        state.shake = Math.min(14, state.shake + 6);
        spawnParticles(car.x, car.y, 10, '#c9c2ae', 180, 0.5, 5);
      }
      car.speed *= -0.22;
    }
    if (!onRoad(car.x, car.y) && Math.abs(car.speed) > 120 && random() < 0.5) {
      spawnParticles(car.x - Math.cos(car.angle) * 20, car.y - Math.sin(car.angle) * 20, 1, '#d8c49a', 40, 0.6, 5);
    }
    if (car.health <= 0 && car.smoke === 0) {
      car.smoke = 1;
      setBanner('Your car is wrecked — press E to get out');
    }
    if (car.health <= 0 && random() < 0.3) {
      spawnParticles(car.x, car.y - 8, 1, '#555', 30, 1.2, 6);
    }
    player.x = car.x; player.y = car.y; player.angle = car.angle;
    state.speed = car.speed;
  }

  function carVsCar(a, b, dt) {
    const d = dist(a.x, a.y, b.x, b.y);
    const min = CAR.radius + CAR.radius - 4;
    if (d >= min || d < 0.001) return 0;
    const nx = (b.x - a.x) / d;
    const ny = (b.y - a.y) / d;
    const overlap = min - d;
    a.x -= nx * overlap * 0.5; a.y -= ny * overlap * 0.5;
    b.x += nx * overlap * 0.5; b.y += ny * overlap * 0.5;
    const rel = Math.abs(a.speed - b.speed);
    let events = 0;
    if (rel > 140) {
      const dmg = Math.round((rel - 140) / 18);
      // Ramming a police car hurts the police car more than the player's car,
      // and a police car cannot chain-ram every frame: it needs a moment to
      // recover, or the getaway mission would be unwinnable.
      const playerCar = player.inCar ? cars[player.carId] : null;
      const policeRam = (a.kind === 'police' && b === playerCar) || (b.kind === 'police' && a === playerCar);
      const policeCar = a.kind === 'police' ? a : b.kind === 'police' ? b : null;
      if (policeRam && policeCar && policeCar.ramTimer > 0) {
        // Still separate the cars, but no damage this hit.
      } else if (policeRam) {
        policeCar.health -= dmg * 2;
        (policeCar === a ? b : a).health -= Math.max(1, Math.round(dmg / 2));
        policeCar.ramTimer = 1.5;
      } else {
        a.health -= dmg; b.health -= dmg;
      }
      state.shake = Math.min(14, state.shake + 5);
      spawnParticles((a.x + b.x) / 2, (a.y + b.y) / 2, 8, '#c9c2ae', 160, 0.5, 5);
      events |= EVENT_CRASH;
      if ((a === playerCar || b === playerCar) && (a.kind === 'police' || b.kind === 'police') && state.ramCooldown <= 0) {
        events |= raiseWanted(1);
        state.ramCooldown = 3;
      }
    }
    const avg = (a.speed + b.speed) / 2;
    a.speed = avg * 0.6; b.speed = avg * 0.6;
    return events;
  }

  function updateTraffic(dt) {
    for (const t of traffic) {
      const car = cars[t.carId];
      if (!car || !car.active) continue;
      let target = t.cruise;
      // Stop for whatever is ahead in this lane (cars, including the player's).
      for (const other of cars) {
        if (other === car || !other.active) continue;
        let ahead = 0; let lateral = 0;
        if (t.axis === 'h') { ahead = (other.x - car.x) * t.dir; lateral = Math.abs(other.y - car.y); }
        else { ahead = (other.y - car.y) * t.dir; lateral = Math.abs(other.x - car.x); }
        if (ahead > 0 && ahead < TRAFFIC.stopGap && lateral < 30) { target = 0; break; }
      }
      car.speed += clamp(target - car.speed, -520 * dt, 280 * dt);
      if (t.axis === 'h') car.x += t.dir * car.speed * dt;
      else car.y += t.dir * car.speed * dt;
      t.turnTimer -= dt;
      if (t.turnTimer <= 0) {
        // At a crossing road: sometimes turn onto it.
        if (t.axis === 'h') {
          for (const rx of ROADS_X) {
            if (Math.abs(car.x - rx) < 9 && random() < TRAFFIC.turnChance) {
              const ndir = random() < 0.5 ? 1 : -1;
              t.axis = 'v'; t.road = rx; t.dir = ndir;
              car.x = rx - ndir * 28; car.y = car.y;
              car.angle = ndir > 0 ? Math.PI / 2 : -Math.PI / 2;
              t.turnTimer = 2;
              break;
            }
          }
        } else {
          for (const ry of ROADS_Y) {
            if (Math.abs(car.y - ry) < 9 && random() < TRAFFIC.turnChance) {
              const ndir = random() < 0.5 ? 1 : -1;
              t.axis = 'h'; t.road = ry; t.dir = ndir;
              car.y = ry + ndir * 28; car.x = car.x;
              car.angle = ndir > 0 ? 0 : Math.PI;
              t.turnTimer = 2;
              break;
            }
          }
        }
      }
      // World edge: turn around.
      if (t.axis === 'h' && (car.x < 40 || car.x > WORLD.width - 40)) {
        t.dir *= -1; car.angle = t.dir > 0 ? 0 : Math.PI; car.y = t.road + t.dir * 28;
        car.x = clamp(car.x, 40, WORLD.width - 40); t.turnTimer = 1;
      }
      if (t.axis === 'v' && (car.y < 40 || car.y > BEACH_Y - 40)) {
        t.dir *= -1; car.angle = t.dir > 0 ? Math.PI / 2 : -Math.PI / 2; car.x = t.road - t.dir * 28;
        car.y = clamp(car.y, 40, BEACH_Y - 40); t.turnTimer = 1;
      }
      const hit = solidForCar(car);
      if (hit) car.speed *= 0.5;
    }
  }

  function updatePeds(dt) {
    const playerCar = player.inCar ? cars[player.carId] : null;
    for (const ped of peds) {
      if (ped.state === 'down') {
        ped.timer -= dt;
        if (ped.timer <= 0) {
          const spot = randomSidewalkSpot();
          ped.x = spot.x; ped.y = spot.y; ped.axis = spot.axis; ped.road = spot.road;
          ped.dir = spot.dir; ped.side = spot.side; ped.state = 'walk';
          ped.speed = range(random, PED.walkMin, PED.walkMax);
        }
        continue;
      }
      if (ped.state === 'walk') {
        // Flee from fast cars and from a punch.
        let threat = null;
        for (const car of cars) {
          if (!car.active || Math.abs(car.speed) < 200) continue;
          if (dist(ped.x, ped.y, car.x, car.y) < 130) { threat = car; break; }
        }
        if (!threat && player.punchTimer > 0 && dist(ped.x, ped.y, player.x, player.y) < 80) threat = player;
        if (threat) {
          ped.state = 'flee'; ped.timer = 1.6;
          const a = Math.atan2(ped.y - threat.y, ped.x - threat.x);
          ped.fleeX = Math.cos(a); ped.fleeY = Math.sin(a);
        }
      }
      if (ped.state === 'flee') {
        ped.timer -= dt;
        ped.x += ped.fleeX * PED.fleeSpeed * dt;
        ped.y += ped.fleeY * PED.fleeSpeed * dt;
        ped.angle = Math.atan2(ped.fleeY, ped.fleeX);
        solidForPed(ped);
        if (ped.timer <= 0) {
          ped.state = 'walk';
          const spot = randomSidewalkSpot();
          ped.axis = spot.axis; ped.road = spot.road; ped.dir = spot.dir; ped.side = spot.side;
          ped.x = spot.x; ped.y = spot.y;
        }
        continue;
      }
      // Walking along a sidewalk.
      if (ped.axis === 'h') {
        ped.x += ped.dir * ped.speed * dt;
        ped.y = ped.road + ped.side * 78;
        ped.angle = ped.dir > 0 ? 0 : Math.PI;
        if (random() < 0.002) {
          for (const rx of ROADS_X) {
            if (Math.abs(ped.x - rx) < 12) {
              ped.axis = 'v'; ped.road = rx; ped.side = random() < 0.5 ? -1 : 1;
              ped.x = rx + ped.side * 78; ped.dir = random() < 0.5 ? -1 : 1;
              break;
            }
          }
        }
        if (ped.x < 40 || ped.x > WORLD.width - 40) { ped.dir *= -1; ped.x = clamp(ped.x, 40, WORLD.width - 40); }
      } else {
        ped.y += ped.dir * ped.speed * dt;
        ped.x = ped.road + ped.side * 78;
        ped.angle = ped.dir > 0 ? Math.PI / 2 : -Math.PI / 2;
        if (random() < 0.002) {
          for (const ry of ROADS_Y) {
            if (Math.abs(ped.y - ry) < 12) {
              ped.axis = 'h'; ped.road = ry; ped.side = random() < 0.5 ? -1 : 1;
              ped.y = ry + ped.side * 78; ped.dir = random() < 0.5 ? -1 : 1;
              break;
            }
          }
        }
        if (ped.y < 40 || ped.y > BEACH_Y - 40) { ped.dir *= -1; ped.y = clamp(ped.y, 40, BEACH_Y - 40); }
      }
      // Hit by a fast car: the player (or a police car) running someone over.
      let pedEvents = 0;
      for (const car of cars) {
        if (!car.active || car.kind === 'traffic' || car.kind === 'parked') continue;
        if (Math.abs(car.speed) < 120) continue;
        if (dist(ped.x, ped.y, car.x, car.y) < CAR.radius + 12) {
          ped.state = 'down'; ped.timer = PED.downTime;
          spawnParticles(ped.x, ped.y, 8, '#e5534b', 140, 0.5, 4);
          if (car === playerCar) pedEvents |= EVENT_CRASH | raiseWanted(1);
          break;
        }
      }
      if (pedEvents) return pedEvents;
    }
    return 0;
  }

  function spawnPoliceCar() {
    // A road point 550-800 away from the player.
    const horizontal = random() < 0.5;
    let x; let y; let angle;
    for (let tries = 0; tries < 8; tries += 1) {
      if (horizontal) {
        const ry = pick(random, ROADS_Y);
        x = clamp(player.x + (random() < 0.5 ? -1 : 1) * range(random, 550, 800), 60, WORLD.width - 60);
        y = ry + 28; angle = 0;
      } else {
        const rx = pick(random, ROADS_X);
        x = rx - 28;
        y = clamp(player.y + (random() < 0.5 ? -1 : 1) * range(random, 550, 800), 60, BEACH_Y - 60);
        angle = Math.PI / 2;
      }
      if (dist(x, y, player.x, player.y) > 500) break;
    }
    const car = makeCar(x, y, angle, '#e8e8e8', 'police');
    car.health = 60;
    return car;
  }

  function updatePolice(dt) {
    state.policeSpawnTimer -= dt;
    const active = cars.filter((c) => c.active && c.kind === 'police');
    // Heat off: the police stand down and the pursuit ends.
    if (state.wanted === 0) {
      for (const car of active) car.active = false;
      for (const cop of cops) cop.state = 'gone';
      return 0;
    }
    if (state.wanted > 0 && active.length < Math.min(state.wanted, POLICE.maxActive) && state.policeSpawnTimer <= 0) {
      spawnPoliceCar();
      state.policeSpawnTimer = POLICE.spawnInterval;
    }
    for (const car of active) {
      if (car.health <= 0) {
        car.active = false;
        spawnParticles(car.x, car.y, 16, '#888', 200, 0.8, 6);
        continue;
      }
      const copOut = cops.find((c) => c.carId === car.id && c.state !== 'gone');
      if (copOut) {
        car.speed = 0;
        continue;
      }
      // Chase the player: follow the road grid toward them (re-routed every 1.5 s),
      // switching to a direct pursuit only once close. Pure pursuit gets stuck on
      // buildings; the road route does not.
      const d = dist(car.x, car.y, player.x, player.y);
      car.routeTimer -= dt;
      if (!car.route || car.routeTimer <= 0) {
        car.route = roadRoute(car, player);
        car.routeIdx = 0;
        car.routeTimer = 1.5;
      }
      let desired;
      if (d < 150) {
        // Close in: aim at a point beside the player, alternating sides by car
        // id, so the police cars spread out instead of all piling onto one spot
        // and pinning the player's car in place.
        const side = car.id % 2 === 0 ? 70 : -70;
        const baseAngle = Math.atan2(player.y - car.y, player.x - car.x);
        const tx = player.x + Math.cos(baseAngle + Math.PI / 2) * side;
        const ty = player.y + Math.sin(baseAngle + Math.PI / 2) * side;
        desired = Math.atan2(ty - car.y, tx - car.x);
      } else {
        const wp = car.route[car.routeIdx];
        if (wp && Math.hypot(wp.x - car.x, wp.y - car.y) < 70) {
          car.routeIdx = Math.min(car.routeIdx + 1, car.route.length - 1);
        }
        const target = car.route[car.routeIdx] || player;
        desired = Math.atan2(target.y - car.y, target.x - car.x);
      }
      const diff = angleDiff(desired, car.angle);
      car.angle += clamp(diff, -2.4 * dt, 2.4 * dt);
      // Ease off as they close in: a police car that slams into a slow player
      // at full speed every time makes the getaway unwinnable. They pull up
      // alongside and match speed instead, and ram only when the player is
      // moving fast.
      const target = d < 60 ? 0 : d < 200 ? Math.min(POLICE.cruise, d * 1.5) : POLICE.cruise;
      // Stuck against a building: reverse briefly to get free. (Speed-based: at
      // low speed a car legitimately covers under 2 px a step.)
      if (Math.abs(car.speed) < 40 && target > 100) car.stuck += dt;
      else car.stuck = 0;
      if (car.stuck > 1.0) { car.reverseTimer = 0.7; car.stuck = 0; }
      if (car.reverseTimer > 0) {
        car.reverseTimer -= dt;
        car.speed = -160;
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        solidForCar(car);
      } else {
        car.speed += clamp(target - car.speed, -600 * dt, 380 * dt);
        car.x += Math.cos(car.angle) * car.speed * dt;
        car.y += Math.sin(car.angle) * car.speed * dt;
        const hit = solidForCar(car);
        if (hit) car.speed *= 0.4;
      }
      // On foot and close: a cop gets out and chases on foot.
      if (!player.inCar && d < 110 && !cops.some((c) => c.carId === car.id && c.state !== 'gone')) {
        cops.push({ x: car.x + 30, y: car.y, angle: 0, health: POLICE.copHealth, carId: car.id, state: 'chase', timer: 0, punchTimer: 0, punchCooldown: 0, lastX: car.x, lastY: car.y, stuck: 0, slideTimer: 0, slideDir: 1 });
      }
    }
    // Cops on foot.
    for (const cop of cops) {
      if (cop.state === 'gone') continue;
      if (cop.state === 'down') {
        cop.timer -= dt;
        if (cop.timer <= 0) { cop.state = 'gone'; }
        continue;
      }
      const car = cars[cop.carId];
      if (cop.state === 'return') {
        if (!car || !car.active) { cop.state = 'gone'; continue; }
        const a = Math.atan2(car.y - cop.y, car.x - cop.x);
        cop.x += Math.cos(a) * POLICE.copSpeed * dt;
        cop.y += Math.sin(a) * POLICE.copSpeed * dt;
        cop.angle = a;
        if (dist(cop.x, cop.y, car.x, car.y) < 42) cop.state = 'gone';
        continue;
      }
      // Chase. If a building blocks the direct line, slide along it for a moment
      // instead of pressing into the wall forever.
      if (player.inCar) { cop.state = 'return'; continue; }
      let a = Math.atan2(player.y - cop.y, player.x - cop.x);
      const moved = Math.hypot(cop.x - cop.lastX, cop.y - cop.lastY);
      if (moved < 2) cop.stuck += dt;
      else cop.stuck = 0;
      cop.lastX = cop.x; cop.lastY = cop.y;
      if (cop.stuck > 0.8) { cop.slideTimer = 0.6; cop.slideDir = cop.slideDir * -1; cop.stuck = 0; }
      if (cop.slideTimer > 0) {
        cop.slideTimer -= dt;
        a += cop.slideDir * Math.PI / 2;
      }
      cop.x += Math.cos(a) * POLICE.copSpeed * dt;
      cop.y += Math.sin(a) * POLICE.copSpeed * dt;
      cop.angle = Math.atan2(player.y - cop.y, player.x - cop.x);
      solidForPed(cop);
      const d = dist(cop.x, cop.y, player.x, player.y);
      if (d < POLICE.bustDistance) {
        state.bustTimer += dt;
        if (state.bustTimer >= POLICE.bustTime) return EVENT_BUSTED;
      } else if (d < 60) {
        state.bustTimer = Math.max(0, state.bustTimer - dt * 0.5);
      }
      // A cop close enough throws a punch.
      cop.punchCooldown -= dt;
      if (d < 34 && cop.punchCooldown <= 0 && player.invuln <= 0) {
        cop.punchCooldown = 1.1;
        state.health -= 10;
        player.invuln = 0.8;
        player.damageTimer = 0;
        spawnParticles(player.x, player.y, 6, '#ffe14d', 120, 0.4, 4);
        if (state.health <= 0) return EVENT_WASTED;
      }
    }
    return 0;
  }

  function missionTarget() {
    if (state.mission >= MISSIONS.length) return null;
    const stageDef = MISSIONS[state.mission].stages[state.stage];
    if (!stageDef || stageDef.kind !== 'goto') return null;
    if (stageDef.target === 'paint') return { x: PAINT_SHOP.x, y: PAINT_SHOP.y, label: "Pay 'n Spray" };
    if (stageDef.target === 'docks') return { x: DOCKS.x, y: DOCKS.y, label: 'Docks' };
    if (stageDef.target === 'club') return { x: CLUB.x, y: CLUB.y, label: 'Neon Palms' };
    if (stageDef.target === 'safehouse') return { x: SAFEHOUSE.x, y: SAFEHOUSE.y, label: 'Safehouse' };
    return null;
  }

  function updateMissions(dt) {
    let events = 0;
    if (state.mission < MISSIONS.length) {
      const def = MISSIONS[state.mission];
      const stageDef = def.stages[state.stage];
      if (stageDef.kind === 'steal') {
        if (player.inCar) {
          state.stage = 1;
          addDialog('Jax: "Nice. Now get it painted before anyone notices."');
        }
      } else if (stageDef.kind === 'goto') {
        const target = missionTarget();
        state.marker = target;
        if (target && dist(player.x, player.y, target.x, target.y) < 95) {
          if (stageDef.target === 'paint' && !player.inCar) {
            // Must drive in.
          } else {
            if (stageDef.target === 'docks') { state.hasPackage = true; events |= EVENT_PICKUP | raiseWanted(1); addDialog('Jax: "Package secured. Now the Palms — and the cops noticed."'); }
            if (stageDef.target === 'club') state.hasPackage = false;
            if (state.stage + 1 < def.stages.length) {
              state.stage += 1;
            } else {
              state.cash += def.reward;
              setBanner(`MISSION COMPLETE — ${def.name}  +$${def.reward}`);
              addDialog(def.done);
              state.mission += 1;
              state.stage = 0;
              events |= EVENT_MISSION;
              if (state.mission === 2) {
                state.wanted = Math.max(state.wanted, 3);
                state.policeSpawnTimer = 0;
                addDialog(MISSIONS[2].briefing);
              } else if (state.mission < MISSIONS.length) {
                addDialog(MISSIONS[state.mission].briefing);
              }
            }
          }
        }
      }
    } else {
      // Free roam: repeatable side delivery jobs.
      state.sideJobCooldown -= dt;
      if (!state.sideJob && state.sideJobCooldown <= 0) {
        const from = pick(random, SIDE_JOB_SPOTS);
        let to = pick(random, SIDE_JOB_SPOTS);
        let guard = 0;
        while (to === from && guard < 8) { to = pick(random, SIDE_JOB_SPOTS); guard += 1; }
        state.sideJob = { phase: 'pickup', from, to };
        state.marker = { x: from.x, y: from.y, label: `Pickup — ${from.name}` };
        addDialog(`Side job: pick up a package at ${from.name}.`);
      } else if (state.sideJob) {
        const job = state.sideJob;
        if (job.phase === 'pickup') {
          state.marker = { x: job.from.x, y: job.from.y, label: `Pickup — ${job.from.name}` };
          if (dist(player.x, player.y, job.from.x, job.from.y) < 95) {
            job.phase = 'dropoff';
            addDialog(`Package collected — deliver it to ${job.to.name}.`);
          }
        } else {
          state.marker = { x: job.to.x, y: job.to.y, label: `Deliver — ${job.to.name}` };
          if (dist(player.x, player.y, job.to.x, job.to.y) < 95) {
            state.cash += SIDE_JOB_REWARD;
            setBanner(`DELIVERY DONE  +$${SIDE_JOB_REWARD}`);
            state.sideJob = null;
            state.sideJobCooldown = 3;
            events |= EVENT_MISSION;
          }
        }
      }
    }
    if (state.mission < MISSIONS.length && MISSIONS[state.mission].stages[state.stage].kind === 'steal') {
      state.marker = null;
    }
    return events;
  }

  function updateSpray(dt) {
    state.sprayCooldown -= dt;
    if (!player.inCar || state.wanted === 0) return 0;
    const car = cars[player.carId];
    if (!car) return 0;
    // Driving up to the shop counts: the trigger is the same 100 px radius the
    // mission uses, not just the garage's own rect — a car that stops on the
    // road outside still gets the fresh coat.
    if (dist(car.x, car.y, PAINT_SHOP.x, PAINT_SHOP.y) >= 100) {
      state.sprayWarned = false;
      return 0;
    }
    if (state.sprayCooldown > 0) return 0;
    if (state.cash < ECONOMY.sprayCost) {
      // Warn once per visit, not every step — and no cooldown, so the spray
      // fires on the step the player can finally afford it (mission 0 pays
      // out while the car is still sitting at the shop).
      if (!state.sprayWarned) {
        setBanner("Pay 'n Spray: you need $100 to clear the heat");
        state.sprayWarned = true;
      }
      return 0;
    }
    state.cash -= ECONOMY.sprayCost;
    state.wanted = 0;
    state.decayTimer = 0;
    car.color = pick(random, CAR_COLORS);
    setBanner("Pay 'n Spray — fresh paint, clean record!");
    state.sprayCooldown = 3;
    state.sprayWarned = false;
    return EVENT_SPRAY;
  }

  function updateDialog(dt) {
    if (state.dialog) {
      state.dialog.timer -= dt;
      if (state.dialog.timer <= 0) state.dialog = null;
    }
    if (!state.dialog && state.dialogQueue.length > 0) {
      state.dialog = { text: state.dialogQueue.shift(), timer: 4.2 };
    }
    if (state.banner) {
      state.banner.timer -= dt;
      if (state.banner.timer <= 0) state.banner = null;
    }
  }

  function updateParticles(dt) {
    for (const p of particles) {
      if (p.life <= 0) continue;
      p.life -= dt;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= 0.96; p.vy *= 0.96;
    }
    for (const s of skids) if (s.life > 0) s.life -= dt;
    state.shake = Math.max(0, state.shake - 30 * dt);
    state.ramCooldown = Math.max(0, state.ramCooldown - dt);
  }

  /**
   * One fixed step. `controls` is the held keys plus one-shot enter/punch flags.
   * With `harmless` set (the title screen's backdrop) traffic and pedestrians move
   * but nothing touches the player, no police spawn and no mission runs.
   */
  function step(dt, controls, harmless) {
    state.time += dt;
    let events = 0;
    if (state.mode !== 'play') {
      state.modeTimer -= dt;
      updateParticles(dt);
      if (state.modeTimer <= 0) respawn(state.mode);
      return 0;
    }
    updateDialog(dt);
    updateParticles(dt);
    updateTraffic(dt);
    events |= updatePeds(dt);

    if (harmless) return events;

    // Player.
    player.punchTimer = Math.max(0, player.punchTimer - dt);
    player.punchCooldown = Math.max(0, player.punchCooldown - dt);
    player.invuln = Math.max(0, player.invuln - dt);
    player.damageTimer += dt;

    if (player.inCar) {
      if (controls.enter) events |= exitCar();
      else drivePlayerCar(dt, controls);
      // A wrecked car cannot be driven; the player must bail out.
      const car = cars[player.carId];
      if (car && car.health <= 0) car.speed = 0;
    } else {
      state.speed = 0;
      let mx = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
      let my = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
      if (mx !== 0 || my !== 0) {
        const len = Math.hypot(mx, my);
        mx /= len; my /= len;
        const speed = controls.sprint ? PLAYER.sprint : PLAYER.walk;
        player.x += mx * speed * dt;
        player.y += my * speed * dt;
        player.angle = Math.atan2(my, mx);
        solidForPed(player);
        if (random() < 0.12) {
          spawnParticles(player.x, player.y + 10, 1, '#d8c49a', 20, 0.4, 3);
        }
      }
      if (controls.enter) {
        const car = nearestCar(player.x, player.y, 78);
        if (car) events |= enterCar(car);
      }
      if (controls.punch && player.punchCooldown <= 0) events |= doPunch();
    }

    // Car-on-car collisions.
    for (const car of cars) car.ramTimer = Math.max(0, car.ramTimer - dt);
    for (let i = 0; i < cars.length; i += 1) {
      const a = cars[i];
      if (!a.active) continue;
      for (let j = i + 1; j < cars.length; j += 1) {
        const b = cars[j];
        if (!b.active) continue;
        events |= carVsCar(a, b, dt);
      }
    }
    // Un-driven cars coast to a stop.
    for (const car of cars) {
      if (!car.active) continue;
      if (car.kind !== 'player' || !player.inCar || cars[player.carId] !== car) {
        if (car.kind !== 'traffic' && car.kind !== 'police') {
          car.speed -= Math.sign(car.speed) * Math.min(Math.abs(car.speed), 300 * dt);
          car.x += Math.cos(car.angle) * car.speed * dt;
          car.y += Math.sin(car.angle) * car.speed * dt;
          solidForCar(car);
        }
      }
    }

    // Hit by a car while on foot.
    if (!player.inCar && player.invuln <= 0) {
      for (const car of cars) {
        if (!car.active || car.kind === 'parked' || Math.abs(car.speed) < 150) continue;
        if (dist(player.x, player.y, car.x, car.y) < CAR.radius + PLAYER.radius) {
          state.health -= 25;
          player.invuln = 1.0;
          player.damageTimer = 0;
          const a = Math.atan2(player.y - car.y, player.x - car.x);
          player.x += Math.cos(a) * 40; player.y += Math.sin(a) * 40;
          solidForPed(player);
          events |= EVENT_CRASH;
          state.shake = Math.min(14, state.shake + 6);
          if (state.health <= 0) { state.mode = 'wasted'; state.modeTimer = 2.5; return EVENT_WASTED; }
          break;
        }
      }
    }

    events |= updatePolice(dt);
    if (events & EVENT_BUSTED) {
      state.mode = 'busted'; state.modeTimer = 2.5;
      setBanner('BUSTED!');
      return EVENT_BUSTED;
    }
    if (events & EVENT_WASTED) {
      state.mode = 'wasted'; state.modeTimer = 2.5;
      setBanner('WASTED!');
      return EVENT_WASTED;
    }

    // Wanted decay out of police sight.
    const policeNear = cars.some((c) => c.active && c.kind === 'police' && dist(c.x, c.y, player.x, player.y) < WANTED.decayRange);
    if (state.wanted > 0 && !policeNear) {
      state.decayTimer += dt;
      if (state.decayTimer >= WANTED.decaySeconds) {
        state.wanted -= 1;
        state.decayTimer = 0;
      }
    } else {
      state.decayTimer = 0;
    }

    events |= updateSpray(dt);
    events |= updateMissions(dt);

    // Health regenerates when the heat is off.
    if (state.wanted === 0 && state.health < 100 && player.damageTimer > 4) {
      state.health = Math.min(100, state.health + 6 * dt);
    }
    return events;
  }

  reset();
  return { state, reset, step, nearestCar };
}
