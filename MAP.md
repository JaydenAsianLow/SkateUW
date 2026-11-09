# MAP.md — Red Square (UW) · Level 1

> **Scope for now:** only Red Square (officially *Central Plaza*) at the University of Washington, Seattle.
> Everything beyond its edges is a backdrop, not a playable area.
> Visual style, lighting, and the skater come from **DESIGN.md**. This file covers **where things are**.

---

## 1. Goal

A playable, recognizable Red Square: when someone from UW sees the game, they should know where they are within a few seconds. **Layout and landmarks must be accurate. Small details can be simplified.**

Accuracy priority:
1. **Layout:** the shape of the plaza and which building sits on which side
2. **Landmarks:** Suzzallo, the three brick monoliths, *Broken Obelisk*, the Rainier Vista steps
3. **Materials:** red brick everywhere, Gothic stone on Suzzallo, modern brick/concrete on the others
4. **Small details:** benches, lamps, railings, trees (from photos; simplify freely)

---

## 2. Real-world layout

Red Square sits at the heart of campus, on top of an underground parking garage (which is why it is paved in brick instead of grass).

```
                         N
                         ↑
              ┌───────────────────────────┐
              │   THE QUAD (backdrop)     │
              └───────────────────────────┘
   ODEGAARD                                     KANE HALL
   LIBRARY     [3 brick                         [Broken Obelisk
   (NW)         monoliths]                       sculpture] (NE)
          ┌─────────────────────────────────────┐
          │                                     │
 W  ←     │          RED SQUARE                 │   SUZZALLO
 (George  │          (red brick plaza)          │   LIBRARY  (E)
 Washington│                                    │   ← hero building
 statue,  │                                     │
 below W  │                                     │
 entrance)└─────────────────────────────────────┘
   MEANY HALL                                   GERBERDING HALL
   (SW)                                         (SE)
                                  steps down ↘ RAINIER VISTA
                                               → Drumheller Fountain
                                               → Mount Rainier (backdrop)
```

| Side | Building / feature | Style (verify with photos) | Role in game |
|---|---|---|---|
| **East** | **Suzzallo Library** | Collegiate Gothic, stone and brick, tall arched windows | **Hero building.** Highest detail. Matches DESIGN.md's Gothic look |
| Northeast | **Kane Hall** | Modern brick (1970s) | Mid detail, solid wall to skate past |
| Northeast corner | ***Broken Obelisk*** (Barnett Newman sculpture) | Steel sculpture | Landmark. Collision only; **no grinding on the art** |
| Northwest | **Odegaard Undergraduate Library** | Modern brick (1970s) | Mid detail |
| Northwest area | **Three brick monoliths** (one is a garage vent, two are decorative) | Tall brick towers | Landmark + skate obstacle around their bases |
| North | **The Quad** | Gothic quadrangle, trees | Backdrop only (future level) |
| Southeast | **Gerberding Hall** | Older stone building | Mid detail |
| Southeast | **Steps down to Rainier Vista** | Wide stone/concrete steps | **Main skate spot:** stair set |
| Southwest | **Meany Hall** | Modern (1970s) | Mid detail |
| West, below the entrance | **George Washington statue** | Bronze, faces west | Small landmark at the west edge |
| Far southeast | **Drumheller Fountain + Mount Rainier** | Fountain, mountain | Backdrop at the end of Rainier Vista |

> Sources for layout: Wikipedia, *Red Square (University of Washington)*, plus OpenStreetMap data (step 6). Building **styles** above are from general knowledge; confirm each one with your own photos before modeling.

---

## 3. Playable area and boundaries

- **Playable:** the full brick plaza, from the building faces on every side, plus the **top of the Rainier Vista steps** and the steps themselves.
- **Soft boundary:** at the building walls and the edges of the plaza. Use invisible walls placed where real walls, railings, or planters already stop people, so the boundary never feels arbitrary.
- **Backdrop (not playable):** The Quad, Rainier Vista beyond the steps, Drumheller Fountain, Mount Rainier, and the trees and roofs beyond the surrounding buildings.
- **Respawn:** if the skater falls off the edge or gets stuck, press the back-to-spawn key (Space) or tap Reset on the phone to go back to the spawn point.

---

## 4. Scale

- Use **real-world meters** (1 Three.js unit = 1 meter).
- Take the plaza outline and building footprints from **OpenStreetMap** (section 6) so distances are correct.
- Building heights: use OSM `height` / `building:levels` tags where present (≈ 3.5–4 m per level); otherwise estimate from photos.
- The skater is ~1.75 m tall; a stair riser is ~15–18 cm. If those look wrong next to the buildings, the scale is off.

---

## 5. Spawn point and default camera

To match the **DESIGN.md** reference shot (Gothic building on the left, low sun on the upper right):

- **Spawn:** north part of the plaza, near the monoliths/Kane side.
- **Facing:** **south**. In this direction:
  - **Suzzallo Library (Gothic) is on the left** ✔
  - The **sun sets in the west → it sits on the right** ✔ (in autumn/winter it sets toward the southwest, so it lands upper-right, ahead of the skater)
  - **Gerberding Hall and the Rainier Vista steps** are ahead-left, giving the player an obvious first goal
- **Time of day:** golden hour (see DESIGN.md §4).

---

## 6. Getting the real layout: OpenStreetMap

OpenStreetMap (OSM) has free, community-made data for UW: building outlines, paths, plazas, steps and sometimes heights.

**Option A: openstreetmap.org (easiest)**
1. Go to **openstreetmap.org** and search "Red Square, University of Washington".
2. Zoom so Red Square **plus the buildings around it** (Suzzallo, Kane, Odegaard, Gerberding, Meany) and the top of Rainier Vista are visible.
3. Click **Export** (top bar) → **Manually select a different area** → drag the box around that area.
4. Click **Export** → save the `.osm` file.
5. Put it in your project at `public/map/red-square.osm`.

**Option B: Overpass Turbo (cleaner data)**
1. Go to **overpass-turbo.eu**, zoom to Red Square.
2. Use the **Wizard** with: `building=* or highway=* or area:highway=* or leisure=* in bbox`.
3. Run, then **Export → GeoJSON** → save as `public/map/red-square.geojson`.

**License:** OSM data is © OpenStreetMap contributors (ODbL). Add a visible credit in the game (e.g., on the title screen or settings): *"Map data © OpenStreetMap contributors"*.

---

## 7. Level of detail

| Tier | What | Detail |
|---|---|---|
| **Hero** | Suzzallo Library façade facing the square | Real Gothic detail: arched windows set into the wall, stone trim, buttresses, roofline. Model in Blender or with Blender MCP, using photos |
| **Mid** | Kane, Odegaard, Gerberding, Meany | Correct footprint and height from OSM, real window depth, correct brick/concrete materials. Simplified otherwise |
| **Landmarks** | Monoliths, *Broken Obelisk*, Rainier Vista steps, George Washington statue | Recognizable silhouettes, correct size and position |
| **Ground** | Red Square brick | PBR brick texture; match the **real pattern** from photos |
| **Backdrop** | The Quad, Rainier Vista, Drumheller, Mount Rainier, trees beyond | Low-poly shapes, painted skyline or image cards; Mount Rainier as a distant mountain silhouette |

---

## 8. Skate spots (v1)

Only use features that **actually exist**; confirm each one on site.

1. **Rainier Vista steps (SE):** the main stair set. Ollie down, later add grind rails if there are real handrails.
2. **Monolith bases (NW):** carve around the three towers; any real ledges/curbs at their bases become grind spots.
3. **Open brick plaza:** long flat runs for pushing, carving and flat-ground tricks (ollie, kickflip).
4. **Building-edge ledges, planters, benches:** only where they exist in photos.
5. ***Broken Obelisk:*** **no-skate.** It's an artwork; solid collision only.

---

## 9. Photo shot list (take these on campus)

Golden hour if possible. Hold the phone at about hip height (the game's camera height) for the "view" shots.

**Views (for matching the camera)**
- [ ] From the spawn point facing south (Suzzallo on the left, Gerberding/Rainier Vista ahead)
- [ ] From the center of the square facing each direction: N, E, S, W
- [ ] From the top of the Rainier Vista steps looking down toward Drumheller / Mount Rainier

**Buildings (for modeling)**
- [ ] Suzzallo façade: straight-on full shot + close-ups of a window, the entrance, stone trim, roofline
- [ ] Kane, Odegaard, Gerberding, Meany: one straight-on shot each + one close-up of the wall material

**Landmarks**
- [ ] The three monoliths (full height + base)
- [ ] *Broken Obelisk* (full + from the plaza's angle)
- [ ] George Washington statue
- [ ] Rainier Vista steps from the side (to count steps and see rails)

**Ground and details (for textures)**
- [ ] Brick paving straight down, in sun and in shade (shows the pattern)
- [ ] Any stone/concrete bands or borders in the paving
- [ ] Lamp posts, benches, trash cans, railings, planters, trees around the edges

Put them in `references/red-square/` with clear names, e.g. `suzzallo-facade.jpg`, `brick-closeup.jpg`, `view-spawn-south.jpg`.

---

## 10. Build order for Claude Code

1. **Ground + footprints:** load `public/map/red-square.osm` (or `.geojson`), convert lat/long to meters around a center point in Red Square, draw the plaza outline and extrude each building footprint to its height. Apply placeholder materials.
2. **Check against reality:** compare top-down and spawn views with `references/red-square/` photos; fix scale and positions.
3. **Landmarks:** add the monoliths, *Broken Obelisk* (collision only), Rainier Vista steps, George Washington statue.
4. **Ground material:** real brick pattern from photos, PBR textures.
5. **Mid buildings:** add window depth and correct materials.
6. **Hero building:** detailed Suzzallo façade.
7. **Backdrop:** Quad trees, Rainier Vista, Drumheller Fountain, Mount Rainier silhouette.
8. **Gameplay pass:** invisible boundaries, spawn point, colliders, skate spots from section 8.
9. **Lighting pass:** apply DESIGN.md golden hour with the sun in the west.

---

## 11. Prompt to start (paste into Claude Code)

> "Read MAP.md and DESIGN.md. Build Level 1: Red Square at UW. Start with section 10, steps 1–2: load the OpenStreetMap file in public/map/, convert it to meters (1 unit = 1 m) centered on Red Square, create the brick plaza and extruded building footprints with placeholder materials, and set the spawn point and camera from MAP.md section 5. Then show me a top-down debug view and the spawn view so I can compare them with my photos in references/red-square/. Add the OpenStreetMap credit."

---

## 12. To verify (open questions)

- [ ] Exact brick paving pattern and any stone bands
- [ ] Number of Rainier Vista steps and whether they have handrails
- [ ] Ledges, planters and benches around the edges
- [ ] Lamp post style
- [ ] Each building's exact style and materials (especially Gerberding and Meany)
- [ ] Whether OSM has heights for each building, or they need estimating from photos
