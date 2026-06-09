# GTA Fable — Low-Poly Open-World Prototype

A GTA-inspired 3D prototype that runs in mobile browsers. Built with
**Vite + TypeScript + Three.js**, every asset is generated procedurally
(primitive shapes + flat hex palette) — zero textures, zero downloads,
instant load.

## Play it locally

```bash
npm install && npm run dev
```

Then open the printed URL (e.g. `http://localhost:5173/GTA-Fable/`). To test
on a phone on the same network, use the LAN URL Vite prints (`--host` is
enabled by default in this config).

## Controls

| Input | On foot | Driving |
| --- | --- | --- |
| **Left half of screen** | virtual joystick — walk (camera-relative, analog) | steer left/right |
| **GAS** (green) | — | accelerate |
| **BRAKE** (red) | — | brake, then reverse |
| **ENTER / EXIT** (blue) | enter a nearby car (pulses when in range) | exit (below ~20 km/h) |
| Keyboard fallback | WASD / arrows, `E`/`Enter` = action, `Space` = brake | same |

## What's inside

- **Procedural city** — seeded 8×8 block grid: low-poly towers with window
  bands and rooftop clutter, sidewalks, dashed lanes, crosswalks, lampposts,
  trees, benches, hydrants, a park and a fountain plaza.
- **Dual-state player** — walk up to any parked (or jacked!) car and switch
  seamlessly between pedestrian and driver.
- **Custom vehicle physics** — vector-based: tapered acceleration curve, top
  speed cap, rolling friction + drag, brake/reverse logic, speed-scaled
  turning radius and grip-budget drifting on hard, fast corners.
- **Traffic AI** — kinematic cars cruise the right-hand lanes, turn at random
  intersections, and brake for obstacles. Ram one hard and it's yours.
- **Chase camera** — spring-damped boom with speed-based FOV, look-ahead and
  2D wall avoidance.
- **Mobile-first rendering** — Lambert materials, two lights, no shadow maps,
  capped pixel ratio, merged vertex-colored geometry + instancing
  (the whole city is a handful of draw calls), strict disposal on teardown.
- **Synth audio** — engine hum and tire screech from raw oscillators/noise,
  unlocked on first touch, mutable from the HUD.

## Deploying to GitHub Pages

`vite.config.ts` sets `base: '/GTA-Fable/'` so the build resolves correctly
at `https://<username>.github.io/GTA-Fable/`.

A ready-made workflow lives at `.github/workflows/deploy.yml`: enable
**Settings → Pages → Source: GitHub Actions** in the repository, then every
push to `main` builds and deploys automatically.

Manual alternative:

```bash
npm run build   # type-checks (strict) then bundles to dist/
```

and publish the `dist/` folder with any static host.

## Project layout

```
src/
├── main.ts              # bootstrap + lifecycle
├── Game.ts              # fixed-timestep loop, ON_FOOT/DRIVING state machine
├── core/                # renderer, clock, disposal, shared GPU caches
├── input/               # virtual joystick, touch buttons, keyboard merge
├── world/               # seeded layout, buildings, roads, props, palette
├── physics/             # car model, pedestrian, AABB spatial hash collision
├── entities/            # procedural cars, pedestrian, traffic AI
├── camera/              # spring-damped chase rig
├── ui/                  # HUD + circular minimap
└── audio/               # synthesized engine/skid audio
```
