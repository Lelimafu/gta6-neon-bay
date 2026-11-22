// Neon Bay — every tuning number, colour and map constant in one place.
// The world is a fixed 2560x1920 coastal city; the renderer follows the player
// with a camera, so no rule below depends on the screen size.

export const WORLD = { width: 2560, height: 1920 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Road centrelines. Roads are 120 wide with sidewalks on each side. */
export const ROADS_X = [320, 960, 1600, 2240];
export const ROADS_Y = [300, 760, 1220, 1520];
export const ROAD_W = 120;
export const LANE = 28; // lane offset from a road centreline (drive on the right)

/** South edge: beach sand, then the ocean. East edge: the harbour inlet. */
export const BEACH_Y = 1640;
export const OCEAN_Y = 1780;
export const HARBOUR = { x: 2380, y: 360, w: 180, h: 880 };

/** Key places. */
export const SAFEHOUSE = { x: 170, y: 1370 };
export const PAINT_SHOP = { x: 1500, y: 1610, w: 150, h: 56 };
export const CLUB = { x: 700, y: 430 };
export const DOCKS = { x: 2280, y: 760 };
export const PARK = { x: 1020, y: 860, w: 520, h: 300 };
export const PLAYER_START = { x: 420, y: 1370 };

export const PLAYER = {
  radius: 13,
  walk: 175,
  sprint: 305,
  punchRange: 48,
  punchArc: 1.1, // radians either side of facing
  punchCooldown: 0.38,
};

export const CAR = {
  length: 46,
  width: 22,
  radius: 17,
  accel: 430,
  brake: 700,
  reverseAccel: 300,
  maxForward: 520,
  maxReverse: 210,
  offroadMax: 260,
  steerRate: 2.6, // radians per second at full lock, scaled down with speed
  grip: 6.0,
  handbrakeDecel: 900,
  health: 100,
};

export const TRAFFIC = {
  count: 10,
  cruiseMin: 130,
  cruiseMax: 190,
  turnChance: 0.22,
  stopGap: 95,
};

export const PED = {
  count: 24,
  walkMin: 42,
  walkMax: 72,
  fleeSpeed: 235,
  downTime: 3.0,
};

export const POLICE = {
  maxActive: 4,
  spawnInterval: 2.0,
  cruise: 500, // just under the player's top speed: a good getaway can outrun them
  bustDistance: 26,
  bustTime: 2.0,
  copSpeed: 255,
  copHealth: 3,
};

export const WANTED = {
  decaySeconds: 12, // out of police sight this long: -1 star
  decayRange: 700,
  max: 5,
};

export const MISSIONS = [
  {
    id: 0,
    name: 'First Wheels',
    briefing: 'Jax: "I need wheels. Any car on this street will do."',
    stages: [
      { text: 'Steal a car — walk up to one and press E', kind: 'steal' },
      { text: "Drive to the Pay 'n Spray", kind: 'goto', target: 'paint' },
    ],
    reward: 200,
    done: 'Paint shop: "Fresh coat, fresh start. That\'ll be on the house, kid."',
  },
  {
    id: 1,
    name: 'The Pickup',
    briefing: 'Rosa: "A package is waiting at the docks. Bring it to Neon Palms. Don\'t dawdle."',
    stages: [
      { text: 'Drive to the docks and collect the package', kind: 'goto', target: 'docks' },
      { text: 'Deliver the package to Neon Palms', kind: 'goto', target: 'club' },
    ],
    reward: 400,
    done: 'Rosa: "Clean delivery. The Palms owes you one."',
  },
  {
    id: 2,
    name: 'The Getaway',
    briefing: 'Rosa: "Cops are all over you. Lose them and get back to the safehouse!"',
    stages: [
      { text: 'Escape the police and reach the safehouse', kind: 'goto', target: 'safehouse' },
    ],
    reward: 600,
    done: 'Jax: "Neon Bay is mine now. Free roam — jobs pay cash all over town."',
  },
];

/** Side delivery jobs after the story (pickup -> dropoff, $150 each). */
export const SIDE_JOB_SPOTS = [
  { name: 'the docks', x: DOCKS.x, y: DOCKS.y },
  { name: 'Neon Palms', x: CLUB.x, y: CLUB.y },
  { name: 'the park', x: PARK.x + PARK.w / 2, y: PARK.y + PARK.h / 2 },
  { name: 'the paint shop', x: PAINT_SHOP.x, y: PAINT_SHOP.y },
  { name: 'the safehouse', x: SAFEHOUSE.x, y: SAFEHOUSE.y },
];
export const SIDE_JOB_REWARD = 150;

export const ECONOMY = {
  startCash: 50,
  sprayCost: 100,
  bustedFine: 100,
  wastedLoss: 50,
};

export const PALETTE = {
  grass: '#7fae62',
  grassDark: '#74a258',
  block: '#8fb573',
  road: '#33333d',
  roadEdge: '#2a2a32',
  sidewalk: '#b9b3a4',
  lane: '#e8c84a',
  laneWhite: '#d8d8d0',
  sand: '#e3c98f',
  ocean: '#2f7fa8',
  oceanDeep: '#256b92',
  buildingRoof: ['#c96f4a', '#b85c5c', '#7d8aa5', '#a5875e', '#6f9a7d', '#946b9e'],
  buildingEdge: '#4a4038',
  parkGreen: '#5d9c4e',
  pond: '#4d94c4',
  tree: '#3f7d33',
  palm: '#4d8a3a',
  player: '#ff8c2e',
  playerShirt: '#2e86ff',
  police: '#e8e8e8',
  text: '#f4f1e6',
  muted: '#c9c2ae',
  neonPink: '#ff4fd8',
  neonCyan: '#37e6ff',
  neonYellow: '#ffe14d',
  hudPanel: 'rgba(12, 14, 24, 0.72)',
  star: '#ffd94d',
  starEmpty: '#5a5a66',
  health: '#59d867',
  healthLow: '#e5534b',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the save is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-bay.save.v1';
