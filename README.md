# Skate Game

A 3D skateboarding web game: the laptop shows the scene, and your phone acts as the controller.

**Stack:** Three.js · React Three Fiber · Drei · Rapier (physics) · React Three Postprocessing · Vite · Node.js + Socket.IO

## Phase 1: phone tilt controller

- `/controller` (phone) shows a skateboard deck. Swipes on it (one or two fingers) are pushes and tricks; tilt (streamed at 50 Hz) steers and brakes. Gesture recognition lives in `src/controller/gestures.js`.
- `/` (laptop) shows **Level 1: Red Square (UW)**, built from OpenStreetMap data per `MAP.md`. The HUD shows live values and a QR code for the phone.
- Visual style follows `DESIGN.md` (golden hour). Add `?clean` to the laptop URL to hide the HUD for side-by-side comparison with the reference image.
- Keyboard fallback on the laptop: tap W = push, S = brake, A/D = steer, Space = ollie, F = kickflip, G = varial flip, T = tre flip, V = pop shove-it, E = frontside 180, Q = revert, B = get off / on (on foot: WASD to walk, Shift to run), R = reset.
- Bails depend on the move and your speed: leaning too far back in a manual drops you on your backside (fast: flat on your back while the board shoots ahead); landing a trick mid-rotation is a stumble onto hands and knees when slow, a tumbling slam when fast. The board rolls off on its own; once the skater is up you walk to it with the joystick; within about 1 m they pick it up, then tap Get on (`src/display/choreo.js`).
- On the board the skater plays the Mixamo skating clip (`art/scripts/14_skate_anim.py` -> `public/models/skater/anims/Skateboarding.glb`, animation only), with the board foot pinned to the deck and the steering lean on top; tricks, air and manuals blend to the coded pose.
- On-foot animation is Mixamo motion capture (`src/display/mocap.js`): put `Idle.fbx`, `Walking.fbx`, `Jogging.fbx`, `Running.fbx` and `Pick Up.fbx` (In Place, Without Skin, FBX) in `public/models/skater/anims/`. They're retargeted onto the skater by bone direction, blended by speed with the stride matched to ground speed. The browser console lists what loaded (with each clip's measured speed) and which files are missing; without them the procedural walk stands in.
- Dev only: `?play` skips the menu (keyboard), `?posetest=back:0.8` (or `side`, `slam`, `dismount`, `mount`, `pickup`, `walk:<speed>`) loops one off-board animation, add `:<seconds>` to freeze it; pair with `?sidecam`. In the console, `__skate.bail('back' | 'side' | 'slam')` triggers a fall.

```
phone ──HTTPS/WSS──▶ Vite dev server :5173 ──proxy──▶ Node Socket.IO :3001 ──▶ laptop display
```

The phone needs **HTTPS** because browsers only give tilt data to secure pages. Vite serves a self-signed certificate and proxies `/socket.io` to the Node server, so the phone only ever talks to one address.

## Run it

```bash
npm install        # first time only
npm run dev        # starts the Socket.IO server (3001) and Vite (5173) together
```

1. On the laptop, open **https://localhost:5173**. You'll see a certificate warning: click *Advanced → Continue to localhost*.
2. The QR panel shows an address like `https://10.x.x.x:5173/controller`. The terminal prints it too.

## Open it on your phone

1. Put the phone on the **same Wi-Fi network** as the laptop.
2. Scan the QR code, or type the address shown.
3. Accept the certificate warning:
   - **iPhone (Safari):** *Show Details → visit this website → Visit Website*
   - **Android (Chrome):** *Advanced → Proceed to 10.x.x.x (unsafe)*
4. Tap **Tap to start**. On iPhone, tap **Allow** when it asks for motion access.
5. Hold the phone flat-ish in portrait. The pose you're holding when you start is "neutral". Press **Calibrate tilt** to reset it, and **Sensitivity** to cycle Normal / High / Max (how far you tilt for full steering and how short a swipe still counts; remembered on the phone).

| Move | Gesture on the deck |
|---|---|
| Push | Swipe **down** |
| Ollie | **Down, then up** (one zig-zag stroke or two quick swipes) |
| Kickflip | Down, up, then **up-right** (up-left spins it the other way) |
| Varial flip | Down, up, then **up-right and down-left at the same time** (two fingers) |
| Tre flip | Down, up, **hold** a moment (keep the finger still), then **down-left**. Or rest another finger anywhere on the deck and swipe down, up, down-left |
| Pop shove-it | Swipe **right and down-left at the same time** (two fingers). Pops by itself |
| Revert | One finger draws a **half circle** (on the ground). You ride away fakie; revert again to go back |
| Frontside 180 | Down, up, then the **left finger half-circles down while the right finger half-circles up** (one counter-clockwise half circle also works; clockwise = backside 180) |
| Steer / brake | Tilt left / right; tilt the top edge toward you to brake |
| Get off / on | Tap **Get off**: the skater steps off and catches the board in the right hand, and the phone shows a joystick (15% dead zone, squared response: a little push walks, the edge runs; directions are relative to the camera). Tap **Get on** to drop the board and step on; the phone switches back to the deck. Both work on the move: Get on while running is a running jump onto the board (keeps your speed), Get off while rolling is a hop off into a run. After a fall the button reads **Go to board** until you walk to the board and pick it up |
| Respawn | Tap **Reset** on the phone (or the back-to-spawn key on the laptop, Space by default) |

Land before a trick finishes rotating and you bail. Ollies pop about 0.3–0.6 m depending on how hard you swipe.

The laptop opens on the **Skate UW** main menu. **Play** shows a QR code; scan it, tap Start on the phone, and the game begins. Sensitivity and airtime are in **Settings** (main menu, or the Settings button in game). If the phone drops out mid-game the laptop pauses with a red *Reconnect phone* card and carries on as soon as it's back; the phone's **Disconnect** button does the same on purpose. If the game closes, the phone shows a red *Reconnect device* card until it's open again.

## Troubleshooting

| Problem | Fix |
|---|---|
| Phone can't load the page | Campus/enterprise Wi-Fi (e.g. eduroam) often blocks device-to-device traffic. Use a home network, or turn on your **phone's hotspot** and join it from the laptop, then rescan the new QR. |
| Still can't connect | Windows Firewall: allow Node.js on *Private* networks when prompted. Also make sure the network profile is Private (Settings → Network → Wi-Fi → Network profile type). |
| QR shows the wrong IP | Click a different address under "Wrong network? Try:" on the QR screen. |
| "Tilt sensors need HTTPS" | You opened `http://`. Use `https://`. |
| iPhone: permission denied | Close the tab, reopen the page, and tap Allow. Or check Settings → Safari → Motion & Orientation Access. |
| Board doesn't move | Swipe down on the deck to push. If the laptop shows *Reconnect phone*, tap Start on the phone. |
| Stuck at the bottom of the Rainier Vista steps | You can't ride up stairs. Tap Reset on the phone (or press Space) to respawn. |

## The map: Red Square (MAP.md)

- Building footprints, the plaza outline and landmark positions come from **OpenStreetMap** (raw extracts in `public/map/`). `npm run map` converts them into `src/display/redSquare/osm.js` (meters, origin in Red Square, north = -z).
- `src/display/redSquare/layout.js` holds the hand-placed parts: spawn, the Rainier Vista and west stair sets, the lower ground they lead to, invisible boundaries, paved areas, lamps, benches, trees and people.
- Detail tiers: Suzzallo's west façade is the hero (`Suzzallo.jsx`); Kane, Odegaard, Meany and Gerberding are mid detail with real window depth; the rest of campus is a merged backdrop with painted windows. Landmarks: the three brick monoliths, *Broken Obelisk* (collision only), George Washington, Drumheller Fountain and Mount Rainier straight down Rainier Vista.
- Debug URLs: `?topdown` (map view from above, `?topdown=400` for height), `?spawn=x,z,headingDeg` (start anywhere; heading 0 = north, 180 = south).
- Still to verify on site (MAP.md §12): brick pattern, step count and handrails, monolith height (OSM says 42, read as feet), building materials. Map data © OpenStreetMap contributors (credit shown in the corner of the display).

## Tests

`npm test` runs the gesture recognizer against synthetic one- and two-finger paths (every trick, plus look-alikes such as a rounded ollie zig-zag that must not count as a half circle).

## Project layout

```
server/index.js            Socket.IO relay (display/controller rooms) + /api/info (LAN IPs)
vite.config.js             HTTPS (self-signed) + proxy to the relay, listens on LAN
src/main.jsx               Routes /controller → phone UI, else → 3D display
src/socket.js              Socket.IO client helper
src/state.js               Mutable shared state (tilt, board) read inside useFrame
src/controller/            Phone controller page
src/display/Display.jsx    Canvas, Physics, keyboard map, socket listeners
src/display/Skateboard.jsx Rapier body + steering/push/tricks/landing logic + board model
src/display/World.jsx      Level 1 (Red Square): composes the pieces below
src/display/redSquare/     OSM data, layout, ground/stairs, buildings, landmarks
scripts/                   osm-to-level.mjs (map converter), test-gestures.mjs
src/display/CameraRig.jsx  Chase camera
src/display/Effects.jsx    Bloom, tone mapping, vignette, SMAA
src/display/Hud.jsx        Status overlay + QR code
```

## Put it online

`npm run build` then `NODE_ENV=production npm start` runs the whole site (game, phone page and Socket.IO) from one Node server on `$PORT`. Any host that runs a Node web service with WebSockets works (Render, Railway, Fly.io); the host provides the real HTTPS certificate, so there are no warnings and no shared-Wi-Fi requirement.

- Build command: `npm ci && npm run build`
- Start command: `npm start` with `NODE_ENV=production`

Each laptop tab makes its own pairing code and puts it in the QR link (`/controller?room=CODE`), so every player's phone only controls their own game.
