// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s
// steps (several in a slow frame, none in a fast one), and the renderer paints what is
// there. The game moves between three screens: title, play and paused; busted/wasted
// are overlays the world itself times out. Progress saves to localStorage on mission
// complete and when the tab hides; Continue on the title screen loads it.
//
// ?seed=N fixes the city. ?shot=start|play|chase|mission (with &seed=N) stages that
// scene instead of running the loop, paints it twice and sets window.__shotReady for
// a screenshot.
import { ECONOMY, SAVE_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_BUSTED, EVENT_CRASH, EVENT_ENTER_CAR, EVENT_MISSION, EVENT_PICKUP, EVENT_PUNCH, EVENT_SPRAY, EVENT_STEAL, EVENT_WANTED, EVENT_WASTED } from './world.js';
import { ACTION_CONFIRM, ACTION_CONTINUE, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, ACTION_PUNCH, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

// Debug/test handle: lets an automated browser check live state (is the player
// in a car? what is the wanted level?). Harmless in normal play.
window.__neonBay = world;

function readSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const save = JSON.parse(raw);
    if (typeof save !== 'object' || save === null) return null;
    return save;
  } catch {
    return null;
  }
}

function saveGame() {
  try {
    const s = world.state;
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      mission: s.mission,
      stage: s.stage,
      cash: s.cash,
      x: s.player.x,
      y: s.player.y,
      health: s.health,
      hasPackage: s.hasPackage,
    }));
  } catch {
    // Storage can be off (private windows): the save then lasts this visit only.
  }
}

function applySave(save) {
  const s = world.state;
  s.mission = Math.min(3, Math.max(0, save.mission | 0));
  s.stage = Math.max(0, save.stage | 0);
  s.cash = Math.max(0, save.cash | 0);
  s.health = Math.min(100, Math.max(1, save.health | 0));
  s.hasPackage = !!save.hasPackage;
  if (typeof save.x === 'number' && typeof save.y === 'number') {
    s.player.x = save.x;
    s.player.y = save.y;
  }
  s.sideJob = null;
  s.sideJobCooldown = 3;
}

function saveSummary(save) {
  if (!save) return null;
  const missionNames = ['First Wheels', 'The Pickup', 'The Getaway', 'Free roam'];
  const name = missionNames[Math.min(3, save.mission | 0)];
  return `Save: ${name} · $${(save.cash | 0).toLocaleString('en-US')} · health ${save.health | 0}`;
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.saveInfo);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let save = readSave();
  let accumulator = 0;
  let last = performance.now();
  // One-shot E/F presses survive until the next world step consumes them; the
  // action flags themselves are taken once per frame by handleActions().
  const pending = { enter: false, punch: false };

  // Screen readers (and anyone watching the page's text) hear the screen changes.
  function announce(message) {
    status.textContent = message;
  }

  function startGame(continued) {
    world.reset();
    if (continued && save) applySave(save);
    accumulator = 0;
    screen = SCREEN_PLAY;
    audio.unlock();
    if (!continued) {
      world.state.dialogQueue.push('Jax: "I need wheels. Any car on this street will do."');
    }
    announce(continued ? 'Continuing Neon Bay.' : 'Playing Neon Bay. Steal a car to start.');
  }

  function handleEvents(events) {
    if (events & EVENT_MISSION) {
      audio.jingle();
      saveGame();
    }
    if (events & EVENT_PICKUP) audio.pickup();
    if (events & EVENT_CRASH) audio.crash();
    if (events & EVENT_PUNCH) audio.punch();
    if (events & EVENT_ENTER_CAR) audio.enterCar();
    if (events & EVENT_SPRAY) {
      audio.spray();
      saveGame(); // the spray changes cash and wanted right after a mission save
    }
    if (events & EVENT_WANTED) audio.wantedUp();
    if (events & EVENT_STEAL) announce('You stole a car — the cops noticed.');
    if (events & EVENT_BUSTED) { audio.busted(); saveGame(); }
    if (events & EVENT_WASTED) { audio.busted(); saveGame(); }
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_MUTE) {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    if (actions & ACTION_ENTER) pending.enter = true;
    if (actions & ACTION_PUNCH) pending.punch = true;
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_CONTINUE && save) startGame(true);
      else if (actions & ACTION_CONFIRM) startGame(false);
      return;
    }
    if (actions & ACTION_PAUSE && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    } else if (actions & (ACTION_PAUSE | ACTION_CONFIRM) && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, input.controls(), true);
      return;
    }
    const controls = input.controls();
    controls.enter = pending.enter;
    controls.punch = pending.punch;
    pending.enter = false;
    pending.punch = false;
    const events = world.step(STEP, controls, false);
    handleEvents(events);
    audio.update(STEP, world.state.speed, world.state.wanted, world.state.player.inCar);
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, saveSummary(save));
  }

  // Leaving the tab pauses a running game and saves progress.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
      saveGame();
    }
  });

  announce('Neon Bay. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
