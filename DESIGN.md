# DESIGN.md — Campus Plaza (Golden Hour)

> **Source of truth:** `references/campus-plaza-golden-hour.png` (Concept 1).
> Every in-game frame of the default level should match that image as closely as possible: same camera, same light, same place, same skater. When this document and the image disagree, **the image wins**.

---

## 1. The shot in one sentence

A low, over-the-shoulder chase camera follows a lone skateboarder rolling away from us across a wide red-brick university plaza at golden hour, with the low sun flaring at the top right, long shadows stretching back toward the camera, Collegiate Gothic brick buildings framing both sides, and students walking in soft-focus silhouette in the distance.

**Mood:** calm, warm, nostalgic, end-of-day. A real place, not an arcade. Quiet confidence, not extreme sports.

---

## 2. Frame and composition

| Property | Value |
|---|---|
| Aspect ratio | 16:9 (reference is 1536 × 864) |
| Horizon line | ~44% down from the top of the frame |
| Skater position | Left of center: body centered at ~40% across, from ~10% (hat top) to ~88% (wheels) of frame height |
| Skater scale | Fills ~75% of frame height. The skater is **big** in frame, close to camera |
| Sun position | Upper right, ~88% across, ~25% down, partly behind tree branches |
| Leading lines | Lighter stone bands in the paving run diagonally from lower-left toward upper-right, pulling the eye toward the sun and the tower |
| Left third | Large brick building + planter wall, close and tall, cut off by the top of frame |
| Center | Distant Gothic tower building (focal background landmark) directly above the skater's right shoulder |
| Right third | Open plaza, lawn edge, bare trees, sun flare, walking students |

The skater should never be centered perfectly. Keep them left of center so the right side breathes and the sun has room.

---

## 3. Camera

| Property | Value |
|---|---|
| Type | Third-person chase camera, **behind and slightly right** of the skater |
| Height | ~1.1 m above ground (around the skater's hip/waist height). Low and grounded |
| Distance | ~2.5–3 m behind the skater |
| Pitch | Nearly level, tilted down ~3–5° |
| Field of view | ~50° vertical (≈ 75° horizontal at 16:9), slightly wide but not fisheye |
| Look target | A point ~4 m ahead of the skater at chest height, so the skater sits low-left and the world opens ahead |
| Follow behavior | Smooth damped follow (lerp ≈ 0.08–0.12 per frame at 60 fps). Lags slightly on turns so carving feels physical |
| Roll | Very slight roll into turns (max ±3°), mirroring the phone tilt |
| Depth of field | Subtle. Skater sharp; far buildings and people slightly soft |
| Motion blur | On the ground near the bottom of frame and on the wheels only, scaled with speed |

---

## 4. Lighting

### 4.1 Sun (key light)
| Property | Value |
|---|---|
| Type | Directional light |
| Elevation | Very low: ~8–12° above the horizon |
| Direction | Coming **toward** the camera from the front-right (backlight / rim light on the skater) |
| Color | Warm amber `#FFB66B` |
| Intensity | High; this is the only strong light |
| Shadows | On, soft edges, **very long**: shadows of the skater, trees, lamps and people stretch back toward the bottom-left of the frame |

### 4.2 Sky / fill
| Property | Value |
|---|---|
| Ambient / hemisphere | Sky color `#F3D9B5` (warm pale peach), ground color `#5A2E28` (deep brick) |
| Fill strength | Low. Faces and the skater's back are in soft shade, readable but not bright |
| Environment map | Golden-hour HDRI with the sun low on one side (e.g., a Poly Haven sunset/park HDRI) for reflections and ambient color |

### 4.3 Light behavior to match
- The skater's **back is in shadow**; edges of the jacket, hat brim, and shoulders catch a warm **rim light**.
- The brick plaza shows **bright warm patches** where sun hits and **deep red-brown shadow** where buildings and trees block it.
- A soft **sun flare / bloom** glows around the sun and spills into the upper-right sky and tree branches.
- Lamp posts are **on** (small warm glows) but do not light the scene. They're decoration at this time of day.
- Slight **atmospheric haze** toward the sun, warming and lightening distant buildings.

---

## 5. Color palette

| Role | Hex | Notes |
|---|---|---|
| Sunlit brick ground | `#B8705A` | Warm terracotta where sun hits |
| Mid brick ground | `#8A4A3C` | Dominant plaza color |
| Shadowed brick ground | `#5A2E28` | Inside long shadows |
| Stone paving bands | `#B9A08A` | Lighter diagonal stripes in the plaza |
| Building brick | `#7A3A2C` | Slightly darker and redder than ground |
| Limestone trim | `#BFAE96` | Window frames, arches, wall caps |
| Sky near sun | `#F7C47C` | Hot gold |
| Upper sky | `#F1E3CF` | Pale cream, almost white |
| Sun core | `#FFF2D6` | Blown-out highlight |
| Tree silhouettes | `#3B2E26` | Bare branches, dark brown-black |
| Hedges / lawn | `#4E5B34` | Muted olive green, warmed by sun |
| Lamp posts | `#1E1E1E` | Black cast iron |
| Skater jacket | `#E6DCCB` | Cream canvas |
| Skater pants | `#5B5E3C` | Olive drab |
| Skater hat | `#46502F` | Dark olive bucket hat |
| Sneakers | `#F2F1EC` | Off-white leather |
| Deck | `#D8C6A4` | Natural maple |
| Wheels | `#E8E3D6` | Off-white urethane |
| Trucks | `#8E8E8E` | Raw aluminum |

**Overall grade:** warm. Highlights pushed toward gold, shadows toward red-brown (never blue or gray). Saturation moderate, not punchy.

---

## 6. Environment

### 6.1 Ground: the plaza
- Large open plaza of **red clay brick pavers** laid in a running bond, bricks ~20 × 10 cm.
- **Lighter stone/concrete bands** (~40 cm wide) cross the plaza diagonally, forming large rectangles.
- Surface: matte with very slight sheen where the sun grazes it (roughness ≈ 0.75–0.85).
- Subtle color variation brick-to-brick (±8% lightness) so it doesn't look tiled.
- The plaza is **huge and flat**, extending ~80–100 m toward the background buildings.

### 6.2 Left side (near)
- A large **Collegiate Gothic building**: red brick walls, limestone trim, tall multi-pane windows in stone frames, and a **pointed stone arch doorway** with a dark wooden door.
- In front of it, a **raised planter wall** (~0.8 m tall) of red brick with a flat **limestone cap**, filled with dense green hedges.
- **3–4 students sitting** on the planter wall, in shade.
- A **black cast-iron lamp post** (~4 m tall, single lantern globe on top, lit warm) right next to the planter, close to the camera.
- The building is cut off by the top of the frame; it feels tall and close.

### 6.3 Center (background)
- A tall **Gothic tower building** (~30–40 m) in red brick with stone tracery windows and crenellated top, framed above the skater's right shoulder.
- A row of lower Gothic campus buildings extending right, with a **pointed spire/gable** on the far right.
- Several more **lamp posts** receding along the plaza edge.

### 6.4 Right side
- Open lawn edge with **benches**.
- Tall **bare deciduous trees** (late autumn/early spring, no leaves), branches silhouetted against the bright sky, the sun shining through them.

### 6.5 People (background NPCs)
- **8–12 students** walking at different depths, mostly away from or across the camera view.
- Casual clothes: hoodies, jeans, backpacks.
- Mostly **silhouetted / backlit** with long shadows; nearest one is ~8–10 m ahead, right of the skater.
- Simple walking loops. They should never block the skater's path.

### 6.6 Scale and density
- Feels **spacious and calm**: lots of open ground between the skater and everything else.
- No cars, no signs, no text, no logos anywhere in the scene.

---

## 7. The skater

### 7.1 Look
| Part | Description |
|---|---|
| Build | Average height (~1.75 m), slim |
| Head | Short dark hair, seen from behind; **dark olive bucket hat** |
| Jacket | **Cream canvas work/trucker jacket**, relaxed fit, sleeves slightly bunched, collar up a little; white tee peeking at the hem |
| Pants | **Olive cargo pants**, loose/baggy, side cargo pockets, slightly cuffed over shoes |
| Shoes | **Plain white low-top leather sneakers** |
| Hands | Bare, relaxed |

### 7.2 Pose (default cruising)
- Seen **from behind**, body angled very slightly to the right.
- **Front foot** on the board near the front bolts, **back foot** near the tail. Shoes visible.
- Knees **softly bent**, weight slightly forward.
- Arms hanging loose at the sides, hands near the thighs.
- Head tilted slightly down-forward, as if looking at the ground ahead.

### 7.3 Board
- **Plain natural-maple deck**, no graphic, standard popsicle shape (~80 × 21 cm).
- Black grip tape on top (barely visible from this angle).
- Raw aluminum trucks, **off-white wheels**.
- The board sits slightly angled, the nose pointing up-right into the frame.

---

## 8. Post-processing

| Effect | Setting / goal |
|---|---|
| Tone mapping | ACES Filmic, exposure slightly bright (~1.1) |
| Color space | sRGB output |
| Bloom | Moderate, strong only around the sun and lamp globes |
| Lens flare / sun glow | Soft, warm, upper-right |
| Depth of field | Light; background softly out of focus |
| Motion blur | On ground near camera and on wheels, scales with speed |
| Vignette | Subtle, darkening the corners ~10% |
| Color grade | Warm: lift shadows toward red-brown, highlights toward gold |
| Fog / haze | Light warm distance fog `#F0CFA8`, starting ~40 m out |

---

## 9. Implementation notes (Three.js)

These map the look above onto the planned stack: Three.js + React Three Fiber + Drei + Rapier + React Three Postprocessing.

- **Renderer:** `toneMapping = ACESFilmicToneMapping`, `outputColorSpace = SRGBColorSpace`, shadows enabled (soft shadows, e.g. PCFSoft), shadow map 2048 or higher for the sun.
- **Sun:** `DirectionalLight` positioned low and in front of the camera's view (front-right), color `#FFB66B`, shadow camera covering the play area.
- **Fill:** `HemisphereLight` (sky `#F3D9B5`, ground `#5A2E28`) at low intensity, plus a golden-hour **HDRI** via Drei `<Environment>` for reflections.
- **Sky:** Drei `<Sky>` with a low sun elevation, or the HDRI as background.
- **Fog:** `scene.fog = new Fog('#F0CFA8', 40, 160)`.
- **Ground:** a large plane with a **PBR red brick paver texture** (Poly Haven) at high tiling, plus decals or a second material for the lighter stone bands.
- **Buildings:** start as simple boxes with a **PBR brick texture** and stone-colored trim; swap in better models later (Sketchfab, checking licenses).
- **Trees:** bare-tree models or billboard cards with alpha; they only need to read as silhouettes against the sky.
- **Lamp posts:** simple black cast-iron model with an emissive warm globe (`#FFD9A0`) that blooms.
- **Skater:** rigged character (e.g., Mixamo) with the outfit colors above; animations for idle-ride, push, ollie, land, bail.
- **Board:** simple model, maple deck material, separate wheels that spin with speed.
- **NPCs:** low-detail walking characters on looping paths, slightly desaturated and backlit.
- **Postprocessing:** `<EffectComposer>` with Bloom, DepthOfField, Vignette, and optional motion blur / god rays from the sun.
- **Performance target:** 60 fps on a mid-range laptop. If needed, cut DOF and motion blur first, then shadow resolution. Never cut the warm lighting; it's the identity of the scene.

---

## 10. Do / Don't

**Do**
- Keep the sun low, warm, and in front of the camera.
- Keep shadows long and reddish-brown.
- Keep the skater large, left of center, seen from behind.
- Keep the plaza open, calm, and real.

**Don't**
- Don't use blue or gray shadows.
- Don't add neon, graphics, logos, or on-screen text in the world.
- Don't put the camera high up or far away; it must feel grounded at hip height.
- Don't fill the plaza with obstacles in this default shot. It's a cruising space.
- Don't use a branded or recognizable real-world skate game character, board graphic, or logo.

---

## 11. Match checklist

Before calling a scene "done," compare a screenshot side by side with the reference and check:

- [ ] Camera height and angle match (hip height, behind, slightly right)
- [ ] Skater is left of center and ~75% of frame height
- [ ] Sun is upper right, partly through branches, with bloom
- [ ] Shadows are long and point back toward the bottom-left
- [ ] Ground is red brick with lighter diagonal bands
- [ ] Left side: brick Gothic building, arched doorway, planter wall with people, lamp post
- [ ] Center: Gothic tower above the skater's right shoulder
- [ ] Right side: bare trees, lawn, walking students
- [ ] Outfit: cream jacket, olive cargo pants, olive bucket hat, white sneakers, plain maple board
- [ ] Overall grade is warm gold and red-brown, never cold
