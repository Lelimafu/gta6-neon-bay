// Keyboard and pointer input. Held keys give the driving/walking controls; one-shot
// presses (enter/exit car, punch, confirm, pause, mute) are queued as bit flags and taken
// once by the loop, so a press between two frames is never lost and never counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;
export const ACTION_CONTINUE = 32;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);
const HANDBRAKE = new Set(['Space']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const PUNCH = new Set(['KeyF']);
const MUTE = new Set(['KeyM']);
const CONTINUE = new Set(['KeyC']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, sprint: false, handbrake: false };
  let actions = 0;

  function setHeld(code, value) {
    if (UP.has(code)) held.up = value;
    else if (DOWN.has(code)) held.down = value;
    else if (LEFT.has(code)) held.left = value;
    else if (RIGHT.has(code)) held.right = value;
    else if (SPRINT.has(code)) held.sprint = value;
    else if (HANDBRAKE.has(code)) held.handbrake = value;
  }

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)
      || SPRINT.has(event.code) || HANDBRAKE.has(event.code)) {
      setHeld(event.code, true);
    } else if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
    } else if (ENTER.has(event.code)) {
      if (!event.repeat) actions |= ACTION_ENTER;
    } else if (PUNCH.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PUNCH;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (CONTINUE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONTINUE;
    } else {
      return;
    }
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => setHeld(event.code, false));
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.sprint = held.handbrake = false;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** The held controls, as a fresh plain object the world can read. */
    controls() {
      return {
        up: held.up,
        down: held.down,
        left: held.left,
        right: held.right,
        sprint: held.sprint,
        handbrake: held.handbrake,
        enter: false,
        punch: false,
      };
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}

/** A blank controls object (no keys held, no one-shot presses). */
export function blankControls() {
  return { up: false, down: false, left: false, right: false, sprint: false, handbrake: false, enter: false, punch: false };
}
