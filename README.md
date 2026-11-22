# Neon Bay

[![make.fun](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/Lelimafu/gta6-neon-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/Lelimafu/gta6-neon-bay/reward.svg)](https://make.fun/bounty/gta6-01)

An original top-down 2D open-world crime game, built for the [make.fun bounty "Make GTA 6"](https://make.fun/bounty/gta6-01). No Rockstar IP, no copied assets: every building, palm and police car is drawn on canvas, and every sound is synthesised with WebAudio. It runs entirely from static files — no network requests, no libraries.

## Story

Neon Bay, 1986. The sun never sets on the bay — and neither does the heat. Jax Moreno, wheelman, is back in town with $50 and a borrowed reputation. Steal a car, run the jobs, stay out of the cells.

**Three-mission story:**

1. **First Wheels** — steal any car on the street, then drive it to the Pay 'n Spray for a fresh coat.
2. **The Pickup** — collect a package at the docks and deliver it to the Neon Palms club while police attention rises.
3. **The Getaway** — escape a 3-star wanted level and reach the safehouse.

After the story: free roam with repeatable side delivery jobs for cash all over town.

## The world

A 2560×1920 coastal city: a road grid with lane dashes, sidewalks and crosswalks, downtown towers, suburbs, a park with a pond, a beach and animated ocean on the south edge, and a harbour with docks and containers on the east. Traffic drives the lanes, pedestrians walk the sidewalks and flee from fast cars and fights, palms and streetlights line the roads.

## How to play

- **On foot:** WASD / arrows to walk, Shift to sprint, **E** to enter the nearest car, **F** to punch.
- **In a car:** WASD / arrows to drive (up accelerates, down brakes/reverses, left/right steer), **Space** handbrake, **E** to get out.
- **Steal** parked cars or stopped traffic cars — stealing raises your wanted level.
- **Wanted 0–5 stars:** stealing a car, hitting a pedestrian, punching a cop or ramming a police car all raise the heat. Police cars chase you; if a cop touches you on foot for ~2 seconds you're **BUSTED** (respawn at the safehouse, wanted cleared, lose some cash). Wanted decays when you're out of police sight, and driving through the Pay 'n Spray clears it for $100.
- **Money:** earn cash from missions and side jobs. Health regenerates when the heat is off.
- **M** mute, **P** pause. Progress auto-saves to localStorage on mission complete; **C** on the title screen continues a save.

## Run it

Serve `game/` with any static server and open `game/index.html` in a desktop browser — for example, from this repo:

```
node serve.ts
# open http://localhost:8080
```

Staged screenshot scenes (deterministic, seeded): `?shot=start&seed=1`, `?shot=play&seed=1`, `?shot=chase&seed=1`, `?shot=mission&seed=1`.

## Files

- `game/index.html` — the page; loads `game/src/main.js`.
- `game/src/config.js` — tuning, palette, map constants, mission definitions.
- `game/src/random.js` — seeded RNG (mulberry32) for deterministic scenes.
- `game/src/input.js` — keyboard + pointer input.
- `game/src/world.js` — city generation, driving, traffic, pedestrians, police, wanted, missions.
- `game/src/audio.js` — WebAudio synth: engine hum, siren, bassline, effects.
- `game/src/render.js` — canvas drawing: city, HUD, minimap, screens.
- `game/src/shots.js` — staged screenshot scenes with a road-following autopilot.
- `game/src/main.js` — boot, game loop, save/load, shot mode.
- `main.ts` — the make.fun hand-in: copies `game/` + `screenshots/` to the output and writes `dossier.json`.
