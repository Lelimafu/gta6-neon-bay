// Drawing only: the world's state and the current screen in, pixels out. The camera
// follows the player across the 2560x1920 city; everything is drawn on canvas — no
// image files. The HUD (cash, health, wanted stars, objective, minimap, speed) is
// drawn on top, then the title / pause / busted / wasted panels.
import {
  BEACH_Y, CAR, CLUB, DOCKS, FONT, HARBOUR, MISSIONS, OCEAN_Y, PAINT_SHOP,
  PARK, PLAYER, ROADS_X, ROADS_Y, ROAD_W, SAFEHOUSE, WORLD,
} from './config.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';

const MINIMAP = { w: 220, h: 150, margin: 16 };

function clamp(value, min, max) {
  return value < min ? min : value > max ? max : value;
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.round(window.innerWidth * ratio);
    canvas.height = Math.round(window.innerHeight * ratio);
  }

  function text(value, x, y, size, color, align, baseline) {
    const key = `${size}`;
    if (!fonts.has(key)) fonts.set(key, `${size}px ${FONT}`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.textBaseline = baseline || 'alphabetic';
    context.fillText(value, x, y);
  }

  function roundRect(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawRoads() {
    // Sidewalks first (a pale border around each road), then asphalt.
    context.fillStyle = '#b9b3a4';
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_W / 2 - 14, 0, ROAD_W + 28, WORLD.height);
    for (const ry of ROADS_Y) context.fillRect(0, ry - ROAD_W / 2 - 14, WORLD.width, ROAD_W + 28);
    context.fillStyle = '#33333d';
    for (const rx of ROADS_X) context.fillRect(rx - ROAD_W / 2, 0, ROAD_W, WORLD.height);
    for (const ry of ROADS_Y) context.fillRect(0, ry - ROAD_W / 2, WORLD.width, ROAD_W);
    // Centre dashes.
    context.fillStyle = '#e8c84a';
    for (const rx of ROADS_X) {
      for (let y = 20; y < WORLD.height; y += 64) context.fillRect(rx - 3, y, 6, 32);
    }
    for (const ry of ROADS_Y) {
      for (let x = 20; x < WORLD.width; x += 64) context.fillRect(x, ry - 3, 32, 6);
    }
    // Crosswalks at every intersection.
    context.fillStyle = '#d8d8d0';
    for (const rx of ROADS_X) {
      for (const ry of ROADS_Y) {
        for (let i = -3; i <= 3; i += 1) {
          context.fillRect(rx - 52 + i * 15, ry - ROAD_W / 2 - 12, 8, 10);
          context.fillRect(rx - 52 + i * 15, ry + ROAD_W / 2 + 2, 8, 10);
          context.fillRect(rx - ROAD_W / 2 - 12, ry - 52 + i * 15, 10, 8);
          context.fillRect(rx + ROAD_W / 2 + 2, ry - 52 + i * 15, 10, 8);
        }
      }
    }
  }

  function drawGround(state) {
    // Grass base.
    context.fillStyle = '#7fae62';
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    // City blocks: a slightly lighter lawn between the roads.
    context.fillStyle = '#8fb573';
    const xs = [0, 260, 380, 900, 1020, 1540, 1660, 2180, 2300];
    const ys = [0, 240, 360, 700, 820, 1160, 1280, 1460, 1580];
    for (let i = 0; i < xs.length - 1; i += 2) {
      for (let j = 0; j < ys.length - 1; j += 2) {
        context.fillRect(xs[i], ys[j], xs[i + 1] - xs[i], ys[j + 1] - ys[j]);
      }
    }
    // Park.
    context.fillStyle = '#5d9c4e';
    context.fillRect(PARK.x, PARK.y, PARK.w, PARK.h);
    context.fillStyle = '#4d94c4';
    context.beginPath();
    context.ellipse(1280, 1010, 120, 60, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#8a6f4d';
    context.fillRect(PARK.x + 40, PARK.y + PARK.h - 24, PARK.w - 80, 10);
    // Beach and ocean.
    context.fillStyle = '#e3c98f';
    context.fillRect(0, BEACH_Y, WORLD.width, OCEAN_Y - BEACH_Y);
    context.fillStyle = '#256b92';
    context.fillRect(0, OCEAN_Y, WORLD.width, WORLD.height - OCEAN_Y);
    context.fillStyle = '#2f7fa8';
    context.fillRect(0, OCEAN_Y, WORLD.width, 40);
    // Animated wave lines.
    context.strokeStyle = 'rgba(255,255,255,0.35)';
    context.lineWidth = 3;
    for (let row = 0; row < 3; row += 1) {
      context.beginPath();
      const yBase = OCEAN_Y + 24 + row * 36;
      for (let x = 0; x <= WORLD.width; x += 32) {
        const y = yBase + Math.sin(x * 0.012 + state.time * 1.6 + row * 2) * 5;
        if (x === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      }
      context.stroke();
    }
    // Harbour water + docks.
    context.fillStyle = '#256b92';
    context.fillRect(HARBOUR.x, HARBOUR.y, HARBOUR.w, HARBOUR.h);
    context.fillStyle = '#8a6f4d';
    context.fillRect(HARBOUR.x - 46, HARBOUR.y, 46, HARBOUR.h);
    context.fillStyle = '#6e5638';
    for (let y = HARBOUR.y + 20; y < HARBOUR.y + HARBOUR.h; y += 60) {
      context.fillRect(HARBOUR.x - 46, y, 46, 4);
    }
  }

  function drawBuildings(state) {
    for (const b of state.buildings) {
      context.fillStyle = '#4a4038';
      context.fillRect(b.x - 3, b.y - 3, b.w + 6, b.h + 6);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      // Rooftop details: AC box + skylight.
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + 12, b.y + 12, Math.min(34, b.w - 24), Math.min(22, b.h - 24));
      context.fillStyle = 'rgba(255,255,255,0.35)';
      context.fillRect(b.x + b.w - 46, b.y + b.h - 34, 30, 20);
      if (b.club) {
        context.strokeStyle = '#ff4fd8';
        context.lineWidth = 4;
        context.strokeRect(b.x + 4, b.y + 4, b.w - 8, b.h - 8);
        text('NEON PALMS', b.x + b.w / 2, b.y + b.h / 2 + 7, 20, '#ff4fd8', 'center');
      }
      if (b.garage) {
        context.fillStyle = '#222831';
        context.fillRect(b.x + 14, b.y + 10, b.w - 28, b.h - 20);
        text("PAY 'N SPRAY", b.x + b.w / 2, b.y - 12, 16, '#ffe14d', 'center');
      }
      if (b.house) {
        context.strokeStyle = '#7a5a34';
        context.lineWidth = 5;
        context.strokeRect(b.x + 8, b.y + 8, b.w - 16, b.h - 16);
        text('SAFEHOUSE', b.x + b.w / 2, b.y - 12, 15, '#ffe14d', 'center');
      }
      if (b.container) {
        context.fillStyle = 'rgba(0,0,0,0.3)';
        for (let y = b.y + 14; y < b.y + b.h; y += 24) context.fillRect(b.x + 4, y, b.w - 8, 3);
      }
    }
  }

  function drawVegetation(state) {
    for (const t of state.trees) {
      context.fillStyle = '#3f7d33';
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#57a047';
      context.beginPath();
      context.arc(t.x - t.r * 0.25, t.y - t.r * 0.25, t.r * 0.55, 0, Math.PI * 2);
      context.fill();
    }
    for (const p of state.palms) {
      context.strokeStyle = '#7a5a34';
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(p.x, p.y);
      context.lineTo(p.x + 4, p.y - 16);
      context.stroke();
      context.strokeStyle = '#4d8a3a';
      context.lineWidth = 3;
      for (let i = 0; i < 5; i += 1) {
        const a = -Math.PI / 2 + (i - 2) * 0.55;
        context.beginPath();
        context.moveTo(p.x + 4, p.y - 16);
        context.quadraticCurveTo(p.x + 4 + Math.cos(a) * 12, p.y - 16 + Math.sin(a) * 12 - 4, p.x + 4 + Math.cos(a) * 20, p.y - 16 + Math.sin(a) * 20 + 6);
        context.stroke();
      }
    }
    for (const l of state.lamps) {
      context.strokeStyle = '#3a3a44';
      context.lineWidth = 3;
      context.beginPath();
      context.moveTo(l.x, l.y);
      context.lineTo(l.x, l.y - 14);
      context.stroke();
      context.fillStyle = '#ffe14d';
      context.beginPath();
      context.arc(l.x, l.y - 15, 4, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawCar(car, state) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // Shadow.
    context.fillStyle = 'rgba(0,0,0,0.3)';
    roundRect(-CAR.length / 2 + 2, -CAR.width / 2 + 3, CAR.length, CAR.width, 8);
    context.fill();
    // Body.
    context.fillStyle = car.color;
    roundRect(-CAR.length / 2, -CAR.width / 2, CAR.length, CAR.width, 8);
    context.fill();
    if (car.kind === 'police') {
      context.fillStyle = '#222831';
      context.fillRect(-6, -CAR.width / 2, 12, CAR.width);
      // Flashing light bar.
      const phase = Math.floor(state.time * 6) % 2 === 0;
      context.fillStyle = phase ? '#ff2e2e' : '#2e7bff';
      context.fillRect(-4, -CAR.width / 2 - 2, 8, 6);
      context.fillStyle = phase ? '#2e7bff' : '#ff2e2e';
      context.fillRect(-4, CAR.width / 2 - 4, 8, 6);
    }
    // Windshield + roof + rear window.
    context.fillStyle = 'rgba(20,30,45,0.85)';
    context.fillRect(CAR.length / 2 - 14, -CAR.width / 2 + 3, 7, CAR.width - 6);
    context.fillRect(-CAR.length / 2 + 7, -CAR.width / 2 + 3, 7, CAR.width - 6);
    context.fillStyle = 'rgba(0,0,0,0.2)';
    context.fillRect(-8, -CAR.width / 2 + 3, 16, CAR.width - 6);
    // Headlights.
    context.fillStyle = '#fff8c9';
    context.fillRect(CAR.length / 2 - 2, -CAR.width / 2 + 2, 3, 5);
    context.fillRect(CAR.length / 2 - 2, CAR.width / 2 - 7, 3, 5);
    context.restore();
    if (car.health <= 0) {
      context.fillStyle = 'rgba(60,60,60,0.8)';
      context.beginPath();
      context.arc(car.x, car.y - 6, 8 + Math.sin(state.time * 5) * 2, 0, Math.PI * 2);
      context.fill();
    }
  }

  function drawPed(ped, state) {
    if (ped.state === 'down') {
      context.fillStyle = ped.shirt;
      context.beginPath();
      context.ellipse(ped.x, ped.y, 14, 8, ped.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    const bob = Math.sin(state.time * 9 + ped.x) * 1.5;
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(ped.x, ped.y + 10, 9, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = ped.shirt;
    context.beginPath();
    context.arc(ped.x, ped.y + bob * 0.3, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 3, ped.y + Math.sin(ped.angle) * 3 - 2, 6, 0, Math.PI * 2);
    context.fill();
  }

  function drawCop(cop, state) {
    if (cop.state === 'down') {
      context.fillStyle = '#1c2f5e';
      context.beginPath();
      context.ellipse(cop.x, cop.y, 14, 8, cop.angle, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(cop.x, cop.y + 10, 9, 4, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#1c2f5e';
    context.beginPath();
    context.arc(cop.x, cop.y, 11, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(cop.x + Math.cos(cop.angle) * 3, cop.y + Math.sin(cop.angle) * 3 - 2, 6, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#ffd94d';
    context.fillRect(cop.x - 7, cop.y + 2, 14, 3);
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.inCar) return;
    const bob = Math.sin(state.time * 10) * 1.5;
    context.fillStyle = 'rgba(0,0,0,0.3)';
    context.beginPath();
    context.ellipse(player.x, player.y + 11, 10, 4, 0, 0, Math.PI * 2);
    context.fill();
    // Body (blue shirt) + head.
    context.fillStyle = '#2e86ff';
    context.beginPath();
    context.arc(player.x, player.y + bob * 0.3, 12, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b98a';
    context.beginPath();
    context.arc(player.x + Math.cos(player.angle) * 3, player.y + Math.sin(player.angle) * 3 - 2, 6.5, 0, Math.PI * 2);
    context.fill();
    // Hair.
    context.fillStyle = '#2b2118';
    context.beginPath();
    context.arc(player.x + Math.cos(player.angle) * 1 - Math.sin(player.angle) * 1, player.y + Math.sin(player.angle) * 1 - Math.cos(player.angle) * 1 - 3, 5, 0, Math.PI * 2);
    context.fill();
    // Punch swing.
    if (player.punchTimer > 0) {
      context.strokeStyle = '#ffe14d';
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(player.x + Math.cos(player.angle) * 10, player.y + Math.sin(player.angle) * 10);
      context.lineTo(player.x + Math.cos(player.angle) * 34, player.y + Math.sin(player.angle) * 34);
      context.stroke();
    }
    // Direction tick.
    context.strokeStyle = 'rgba(255,255,255,0.7)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(player.x + Math.cos(player.angle) * 12, player.y + Math.sin(player.angle) * 12);
    context.lineTo(player.x + Math.cos(player.angle) * 18, player.y + Math.sin(player.angle) * 18);
    context.stroke();
  }

  function drawMarker(state) {
    const marker = state.marker;
    if (!marker) return;
    const pulse = 1 + Math.sin(state.time * 4) * 0.15;
    const x = marker.x;
    const y = marker.y - 46 * pulse;
    context.fillStyle = '#ffe14d';
    context.beginPath();
    context.moveTo(x, y + 26 * pulse);
    context.lineTo(x - 12, y);
    context.lineTo(x - 12, y - 14);
    context.arc(x, y - 14, 12, Math.PI, 0);
    context.lineTo(x + 12, y);
    context.closePath();
    context.fill();
    context.fillStyle = '#333';
    context.beginPath();
    context.arc(x, y - 14, 5, 0, Math.PI * 2);
    context.fill();
    // Ground ring at the destination.
    context.strokeStyle = 'rgba(255,225,77,0.8)';
    context.lineWidth = 3;
    context.beginPath();
    context.ellipse(marker.x, marker.y, 34 + Math.sin(state.time * 4) * 6, 20 + Math.sin(state.time * 4) * 3, 0, 0, Math.PI * 2);
    context.stroke();
    text(marker.label, marker.x, marker.y - 62, 16, '#ffe14d', 'center');
  }

  function drawWorld(state, viewW, viewH) {
    const player = state.player;
    let camX = clamp(player.x - viewW / 2, 0, Math.max(0, WORLD.width - viewW));
    let camY = clamp(player.y - viewH / 2, 0, Math.max(0, WORLD.height - viewH));
    if (state.shake > 0) {
      camX += (Math.random() - 0.5) * state.shake;
      camY += (Math.random() - 0.5) * state.shake;
    }
    context.save();
    context.translate(-camX, -camY);
    drawGround(state);
    drawRoads();
    drawBuildings(state);
    drawVegetation(state);
    // Skid marks.
    for (const s of state.skids) {
      if (s.life <= 0) continue;
      context.strokeStyle = `rgba(20,20,20,${Math.min(0.55, s.life / 6 * 0.55)})`;
      context.lineWidth = 5;
      context.beginPath();
      context.moveTo(s.x - Math.cos(s.angle) * 12, s.y - Math.sin(s.angle) * 12);
      context.lineTo(s.x + Math.cos(s.angle) * 12, s.y + Math.sin(s.angle) * 12);
      context.stroke();
    }
    // Docks + club labels on the map.
    text('DOCKS', DOCKS.x - 40, DOCKS.y - 60, 15, '#c9c2ae', 'left');
    text('NEON PALMS', CLUB.x - 60, CLUB.y - 70, 15, '#ff4fd8', 'left');
    for (const car of state.cars) {
      if (car.active) drawCar(car, state);
    }
    for (const ped of state.peds) drawPed(ped, state);
    for (const cop of state.cops) {
      if (cop.state !== 'gone') drawCop(cop, state);
    }
    drawPlayer(state);
    // Particles.
    for (const p of state.particles) {
      if (p.life <= 0) continue;
      context.globalAlpha = clamp(p.life / p.maxLife, 0, 1);
      context.fillStyle = p.color;
      context.beginPath();
      context.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      context.fill();
    }
    context.globalAlpha = 1;
    drawMarker(state);
    context.restore();
    return { camX, camY };
  }

  function drawMinimap(state, viewW) {
    const x0 = viewW - MINIMAP.w - MINIMAP.margin;
    const y0 = MINIMAP.margin;
    const sx = MINIMAP.w / WORLD.width;
    const sy = MINIMAP.h / WORLD.height;
    context.fillStyle = 'rgba(12, 14, 24, 0.72)';
    roundRect(x0 - 6, y0 - 6, MINIMAP.w + 12, MINIMAP.h + 12, 8);
    context.fill();
    context.save();
    context.beginPath();
    roundRect(x0, y0, MINIMAP.w, MINIMAP.h, 4);
    context.clip();
    context.fillStyle = '#5d8a4a';
    context.fillRect(x0, y0, MINIMAP.w, MINIMAP.h);
    context.fillStyle = '#2f7fa8';
    context.fillRect(x0, y0 + OCEAN_Y * sy, MINIMAP.w, MINIMAP.h - OCEAN_Y * sy);
    context.fillRect(x0 + HARBOUR.x * sx, y0 + HARBOUR.y * sy, HARBOUR.w * sx, HARBOUR.h * sy);
    context.strokeStyle = '#3a3a44';
    context.lineWidth = 3;
    for (const rx of ROADS_X) {
      context.beginPath();
      context.moveTo(x0 + rx * sx, y0);
      context.lineTo(x0 + rx * sx, y0 + MINIMAP.h);
      context.stroke();
    }
    for (const ry of ROADS_Y) {
      context.beginPath();
      context.moveTo(x0, y0 + ry * sy);
      context.lineTo(x0 + MINIMAP.w, y0 + ry * sy);
      context.stroke();
    }
    // Mission marker.
    if (state.marker) {
      const pulse = 5 + Math.sin(state.time * 5) * 2;
      context.fillStyle = '#ffe14d';
      context.beginPath();
      context.arc(x0 + state.marker.x * sx, y0 + state.marker.y * sy, pulse, 0, Math.PI * 2);
      context.fill();
    }
    // Police blips.
    for (const car of state.cars) {
      if (!car.active || car.kind !== 'police') continue;
      const blink = Math.floor(state.time * 4) % 2 === 0;
      context.fillStyle = blink ? '#ff2e2e' : '#2e7bff';
      context.beginPath();
      context.arc(x0 + car.x * sx, y0 + car.y * sy, 4, 0, Math.PI * 2);
      context.fill();
    }
    // Player arrow.
    const p = state.player;
    context.save();
    context.translate(x0 + p.x * sx, y0 + p.y * sy);
    context.rotate(p.angle);
    context.fillStyle = '#ff8c2e';
    context.beginPath();
    context.moveTo(8, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
  }

  function drawHud(state, viewW, viewH) {
    // Top-left: cash + health.
    context.fillStyle = 'rgba(12, 14, 24, 0.72)';
    roundRect(14, 14, 240, 66, 8);
    context.fill();
    text(`$${state.cash.toLocaleString('en-US')}`, 28, 44, 28, '#59d867', 'left');
    context.fillStyle = '#333';
    context.fillRect(28, 56, 212, 12);
    context.fillStyle = state.health > 30 ? '#59d867' : '#e5534b';
    context.fillRect(28, 56, 212 * clamp(state.health / 100, 0, 1), 12);
    // Wanted stars, top centre.
    const starY = 34;
    const starW = 34;
    const totalW = 5 * starW;
    const x0 = viewW / 2 - totalW / 2;
    for (let i = 0; i < 5; i += 1) {
      text('★', x0 + i * starW + starW / 2, starY, 30, i < state.wanted ? '#ffd94d' : '#5a5a66', 'center');
    }
    // Objective banner under the stars.
    let objective = '';
    if (state.mission < MISSIONS.length) {
      const def = MISSIONS[state.mission];
      objective = `${def.name}: ${def.stages[state.stage].text}`;
    } else if (state.sideJob) {
      objective = state.sideJob.phase === 'pickup'
        ? `Side job: pick up the package at ${state.sideJob.from.name}`
        : `Side job: deliver to ${state.sideJob.to.name}`;
    } else {
      objective = 'Free roam — a side job is coming up';
    }
    const objW = context.measureText(objective).width + 32;
    context.fillStyle = 'rgba(12, 14, 24, 0.72)';
    roundRect(viewW / 2 - objW / 2, 52, objW, 30, 8);
    context.fill();
    text(objective, viewW / 2, 73, 17, '#f4f1e6', 'center');
    drawMinimap(state, viewW);
    // Speed when driving.
    if (state.player.inCar) {
      const mph = Math.round(Math.abs(state.speed) * 0.14);
      context.fillStyle = 'rgba(12, 14, 24, 0.72)';
      roundRect(viewW - 150, viewH - 66, 136, 52, 8);
      context.fill();
      text(`${mph}`, viewW - 96, viewH - 28, 30, '#f4f1e6', 'center');
      text('mph', viewW - 40, viewH - 28, 15, '#c9c2ae', 'center');
    }
    // Controls hint, bottom-left.
    text('WASD drive/walk · Shift sprint · E enter car · F punch · Space handbrake · M mute · P pause', 16, viewH - 14, 14, 'rgba(244,241,230,0.75)', 'left');
    // Dialog box.
    if (state.dialog) {
      const dw = Math.min(viewW - 80, 640);
      const dx = (viewW - dw) / 2;
      const dy = viewH - 118;
      context.fillStyle = 'rgba(12, 14, 24, 0.82)';
      roundRect(dx, dy, dw, 52, 8);
      context.fill();
      context.strokeStyle = '#37e6ff';
      context.lineWidth = 2;
      roundRect(dx, dy, dw, 52, 8);
      context.stroke();
      text(state.dialog.text, viewW / 2, dy + 33, 17, '#f4f1e6', 'center');
    }
    // Mission banner.
    if (state.banner) {
      const alpha = clamp(state.banner.timer / 0.5, 0, 1);
      context.globalAlpha = alpha;
      text(state.banner.text, viewW / 2, viewH / 2 - 140, 34, '#ffe14d', 'center');
      context.globalAlpha = 1;
    }
    // Busted warning while a cop is closing in.
    if (state.bustTimer > 0.3) {
      const remain = Math.max(0, 2 - state.bustTimer).toFixed(1);
      text(`BUSTED IN ${remain}s — RUN!`, viewW / 2, 120, 26, '#ff5a4d', 'center');
    }
  }

  function drawPanel(title, lines, prompt, accent) {
    const width = 680;
    const lineH = 30;
    const height = 150 + lines.length * lineH + 70;
    const x = (canvas.width - width) / 2;
    const y = (canvas.height - height) / 2;
    context.fillStyle = 'rgba(10, 12, 22, 0.88)';
    roundRect(x, y, width, height, 12);
    context.fill();
    context.strokeStyle = accent || '#37e6ff';
    context.lineWidth = 2;
    roundRect(x, y, width, height, 12);
    context.stroke();
    text(title, canvas.width / 2, y + 72, 52, accent || '#37e6ff', 'center');
    for (let i = 0; i < lines.length; i += 1) {
      text(lines[i], canvas.width / 2, y + 128 + i * lineH, 19, '#c9c2ae', 'center');
    }
    text(prompt, canvas.width / 2, y + height - 30, 21, '#ffe14d', 'center');
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen the game is on. */
  function draw(state, screen, saveInfo) {
    const viewW = canvas.width;
    const viewH = canvas.height;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#0b0e18';
    context.fillRect(0, 0, viewW, viewH);
    // Scale the world view so a 1280x720 window shows a sensible area; bigger
    // windows see more of the city instead of stretching it.
    const scale = Math.max(0.75, Math.min(1.15, viewW / 1280));
    context.setTransform(scale, 0, 0, scale, 0, 0);
    const vw = viewW / scale;
    const vh = viewH / scale;
    drawWorld(state, vw, vh);
    context.setTransform(1, 0, 0, 1, 0, 0);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(8, 10, 20, 0.55)';
      context.fillRect(0, 0, viewW, viewH);
      const lines = [
        'Neon Bay, 1986. The sun never sets on the bay — and neither does the heat.',
        'Jax Moreno, wheelman, is back in town with $50 and a borrowed reputation.',
        'Steal a car. Run the jobs. Stay out of the cells.',
        '',
        'WASD / arrows — walk & drive      Shift — sprint      Space — handbrake',
        'E — enter / exit car      F — punch      M — mute      P — pause',
      ];
      const prompt = saveInfo ? 'ENTER — Start new game      C — Continue (save found)' : 'ENTER or click — Start';
      // Title with a neon glow.
      context.save();
      context.shadowColor = '#ff4fd8';
      context.shadowBlur = 34;
      text('NEON BAY', viewW / 2, viewH / 2 - 190, 84, '#ff4fd8', 'center');
      context.restore();
      text('a top-down open-world crime story', viewW / 2, viewH / 2 - 148, 22, '#37e6ff', 'center');
      for (let i = 0; i < lines.length; i += 1) {
        text(lines[i], viewW / 2, viewH / 2 - 96 + i * 30, 19, '#f4f1e6', 'center');
      }
      text(prompt, viewW / 2, viewH / 2 + 130, 22, '#ffe14d', 'center');
      if (saveInfo) {
        text(saveInfo, viewW / 2, viewH / 2 + 164, 16, '#c9c2ae', 'center');
      }
      return;
    }
    drawHud(state, viewW, viewH);
    if (screen === SCREEN_PAUSED) {
      context.fillStyle = 'rgba(8, 10, 20, 0.6)';
      context.fillRect(0, 0, viewW, viewH);
      drawPanel('Paused', ['The bay will wait for you.'], 'Press P to resume', '#37e6ff');
    } else if (state.mode === 'busted') {
      context.fillStyle = 'rgba(20, 10, 60, 0.72)';
      context.fillRect(0, 0, viewW, viewH);
      text('BUSTED!', viewW / 2, viewH / 2 - 10, 84, '#ff5a4d', 'center');
      text('The Neon Bay PD took your cash and dropped you at the safehouse.', viewW / 2, viewH / 2 + 44, 20, '#f4f1e6', 'center');
    } else if (state.mode === 'wasted') {
      context.fillStyle = 'rgba(40, 8, 8, 0.72)';
      context.fillRect(0, 0, viewW, viewH);
      text('WASTED!', viewW / 2, viewH / 2 - 10, 84, '#ff5a4d', 'center');
      text('You blacked out. The safehouse it is.', viewW / 2, viewH / 2 + 44, 20, '#f4f1e6', 'center');
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw };
}
