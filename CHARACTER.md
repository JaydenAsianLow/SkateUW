# CHARACTER.md — Me as the skater

How to turn my own outfit into a rigged, animated, game-ready skater for the Three.js game.
Based on the "Blender + Opus" workflow: **generator for the body, code for everything else.**
Run every prompt below in **Claude Code** (VS Code), in this project folder.

Pipeline: **photos → clean turnaround sheet → Hunyuan3D (free, Kaggle) → clean in Blender → split parts → joints → weights → pose test → skate clips → export → game**

---

## 0. One-time setup ✅ done

1. **Blender 4.5.3 LTS** is installed at `C:\Program Files\Blender Foundation\Blender 4.5\blender.exe`.
   Claude Code runs it **in the background with no window** (`-b`), so the Blender window never has to open.
   Tested: `art/scripts/00_smoke_test.py` renders with Workbench and Cycles (CPU). Don't use EEVEE in scripts
   (it needs the GPU window context); use Workbench for check renders and Cycles CPU for bakes.
   **Me:** 5'5" = **1.65 m**.
2. The Blender path and the character rules are in **CLAUDE.md** (Claude Code reads it every session):

```
# Blender
Run Blender as: "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b file.blend --python script.py
Keep every Blender step as its own .py file in art/scripts/ so it can be rerun.
Renders go to art/renders/, 768 px.

# Character rules
- Units: metres. Feet on 0. Forward is -Y in Blender (+Z in Three.js after export).
- Triangle budget for the skater: 25,000 (web game).
- Mixamo bone names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, and Right* versions).
- Max 4 bones per vertex.
- Max 3 fix rounds per step, then stop and show me.
```

3. Folders:

```
art/
  reference/   ← photo_front/back/left/right.jpg (hallway photos) + the turnaround sheet
  character/   ← model.glb from the generator, cleaned versions
  scripts/     ← one .py per step
  renders/     ← check images
public/models/skater/  ← final export the game loads
```

---

## 1. Make a clean turnaround sheet of me

My hallway photos are in perspective, with my arms touching my sides, and the hoodie has Disney graphics that **can't** go in a public game. So first make a clean sheet from them.

Use an image tool that accepts photos (e.g. ChatGPT image editing). Upload my front, side and back photos with this prompt:

```
Using these photos of me as reference, make a character turnaround sheet:
front, right side, back. Orthographic, same height, no perspective.
A-pose: arms angled down and away from the body at about 45 degrees,
legs apart with a clear gap between them, shoes fully visible.
Empty hands.
Light grey background, flat even light, no shadows.

Clothing (keep my face, hair and body shape):
- maroon/burgundy baseball cap
- blonde hair, purple underneath, shoulder-length mullet
- plain white zip-up hoodie, pink lining inside the hood, NO graphics or text anywhere
- very wide light-wash blue jeans, cuffed at the bottom
- white sneakers
```

Check it before moving on:
- [ ] No Disney (or any other brand) graphics or text
- [ ] Arms away from the body, legs apart, shoes visible
- [ ] Front, side and back are **true views**, not mirrored copies
- [ ] It actually looks like me

Save it as `art/reference/turnaround.png`.

---

## 2. Split the sheet into views

```
Cut art/reference/turnaround.png into view_front.png, view_right.png and view_back.png
in art/reference/, one view per file, same height, centred, grey background kept.
```

---

## 3. Generate the 3D model (free)

**What was used (2026-11-08):** `art/scripts/03_generate_hf.py` sends front/back/right to the free Hunyuan3D-2mv
Hugging Face Space for the **shape** only (its texture step is broken: PyMeshLabException). Then
`art/scripts/03c_project_texture.py` colours it in Blender by projecting the three views onto it
(→ `art/character/model.glb`, vertex colours). Check render: `art/scripts/03b_render_check.py`.

**Alternative:** the Kaggle notebook below does shape + texture on a free GPU. No paid exports either way. Use `scripts/hunyuan3d-kaggle.ipynb` (free Kaggle GPU, see the notebook's first cell for setup).

1. Rename the step 2 views for the notebook: `view_front.png` → `front.png`, `view_right.png` → `right.png`,
   `view_back.png` → `back.png`. Upload them as a Kaggle dataset.
2. Run All. Download `skater_textured.glb` → save as `art/character/model.glb`.
3. Ask Claude: *"Render art/character/model.glb front and back and tell me which render has the face."*

> If the model comes out mirrored or with a face on the back of the head, set `SWAP_LEFT_RIGHT = True`
> in the notebook's cell 4 and re-run cells 4–6.

Backup if Kaggle is busy: the free **Hunyuan3D-2mv** Space on huggingface.co (same model, daily GPU limit).

---

## 4. Clean the mesh

```
Clean art/character/model.glb with a Blender script (art/scripts/04_clean.py, done 2026-11-08):
1. Turn it to face forward (check the face render from step 3), feet on 0, height 1.65 m, apply transforms.
2. Merge vertices by distance; print the number of loose parts.
3. Recalculate normals; list flipped faces, holes and zero-length normals.
4. Decimate a copy to 25,000 triangles, keep UVs, bake base colour and a normal map
   from the original onto it.
5. Render front, side and back with a 5 cm grid and open them.
```

---

## 5. Split the body into parts

The generator welds everything together. Wide jeans are the big risk: the two legs can be **fused in the middle**.

**Done 2026-11-08** with `art/scripts/05_parts.py` → `art/character/parts.blend` (face attribute `part`),
check image `art/renders/05_parts.png`. Cross-sections showed the legs separate below 0.59 m and the arms
separate from the torso from 1.15 m to the fingertips, so no seams needed splitting. Parts: head, hair, cap,
torso (shirt, hem at 0.86 m), hips (jeans top + belt), arm/hand/leg/shoe L and R.

```
Tag every face as one part: head, hair, cap, torso (hoodie body), hood, arm L/R,
hand L/R, jeans leg L/R, shoe L/R. Use texture colour AND position on the body.
Split the inner seam between the two jeans legs so they are separate.
Split where hands touch the hoodie cuffs.
Render one flat colour per part, front and back, and open it.
```

---

## 6. Place the joints

```
Render the model orthographic, front and side, 5 cm grid, labelled axes.
Write Hips, Spine, Spine1, Spine2, Neck, Head, shoulders, elbows, wrists, knees,
ankles and toes to art/character/joints.json in metres, using Mixamo bone names.
Draw them as dots on the renders and open them.
```

Check the dots yourself. A shoulder 3 cm too high stretches the whole sleeve.

**Done 2026-11-08** with `art/scripts/06_joints.py` → `art/character/joints.json` (27 joints, Blender axes),
check image `art/renders/06_joints.png`. Spine on the centre line; limb joints at the centre of each part's
cross-section. Arm: shoulder → elbow 0.29 m, elbow → wrist 0.19 m, hand 0.17 m. Knees 0.47 m, ankles 0.085 m.
To move a joint, change its height/offset at the top of the script and rerun.

---

## 7–10. Rig, weights, pose test, export, game ✅ done 2026-11-08

| Step | Script | Result |
|---|---|---|
| 7 Rig + weights | `art/scripts/07_rig.py` → `art/character/rig.blend` | 22 Mixamo bones on joints.json. Weights by rules per part (no automatic weights): shirt 0 on arm bones (shares the clavicle with the sleeve at the armpit), chin-up 100% Head, hands 100% Hand, jeans top hands over to each UpLeg, hem ring follows the foot. Max 3 bones per vertex. |
| 8 Pose test | `art/scripts/08_pose_test.py` → `art/renders/08_pose_*.png` | Stance, ollie tuck, push/lean. After 3 fix rounds: ollie max stretch 5x; remaining stretch is the shoe/hem junction at extreme ankle bends and a little neck twist at a 60° head turn. |
| 9 Clips | — (live in the game instead) | No baked clips: `src/display/RiderModel.jsx` poses the skeleton every frame from the board physics (stance, push, ollie snap/tuck/land, flip flick, carve lean, bail), feet locked to the deck with leg IK, so it always matches the board. |
| 10 Export | `art/scripts/10_export.py` → `public/models/skater/skater.glb` | 1.5 MB, 25,000 triangles, 22 bones, 1.65 m, feet at 0. Re-import checked. |

In the game: `?oldskater` shows the old primitive skater, `?sidecam` views the rider from the toe side.
If the GLB fails to load, the game falls back to the primitive skater automatically.

To change the character later: edit the turnaround sheet and rerun the scripts in order
(02 → 03 → 03c → 04 → 05 → 06 → 07 → 08 → 10). Each step reads the previous step's file.

<details><summary>Original plan for steps 7–10</summary>

## 7. Weights (so the hoodie doesn't stretch)

```
Build the armature on joints.json and bind with automatic weights, then fix in code
(art/scripts/11_weights.py):
- hoodie torso and hood: 0 on every arm bone
- cap and hair: 100% on Head
- each hand: 100% on its hand bone
- each jeans leg: only on its own leg chain (UpLeg, Leg), never the other leg
- shoes: 100% on Foot/ToeBase
- smooth weights only around shoulders, elbows and knees, inside one part, never across parts
- max 4 bones per vertex, then normalize
If automatic weights fail, bind a voxel-remeshed copy and transfer weights back.
```

## 8. Pose test (skate poses)

```
Pose test: skate stance (knees bent, hips down 25 cm, body turned 80° sideways,
front foot forward), arms out for balance at 60°, deep crouch for an ollie,
lean left and right 20°, head turned 60° toward the direction of travel.
Render each pose front and side. Print the longest stretched edge vs. rest pose
and the 10 worst vertices with their bone. Fix and rerun, max 3 rounds.
```

## 9. Skate clips (written in code)

The skateboard deck is the floor for the feet: a plane at deck height (~10 cm).

```
Store the rest pose; every clip starts from it. Limits: knees/elbows bend one way,
wrists max 60°, spine max 30° per bone, head max 70° left/right. 30 fps.
Feet locked to the deck plane with IK unless the clip says otherwise.
Write, one .py each in art/scripts/clips/:
- ride_idle.py: 2 s loop, skate stance, small knee bob, arms relaxed
- push.py: 1 s loop, back foot leaves the deck, pushes along the ground, returns
- ollie.py: 0.8 s, crouch → pop → tuck knees up → extend → land crouch
- land.py: 0.4 s, absorb with knees, back to stance
- bail.py: 1.2 s, lose balance, step off the board forward, stumble, stand
- lean_left.py / lean_right.py: 0.5 s poses for carving (the game blends these with phone tilt)
Loops: last frame must match the first. Render a frame sheet of each and open it.
```

Then check by numbers:

```
For every clip print: foot slide on the deck (cm), lowest vertex (above floor/deck),
hips height range, first-vs-last frame difference for loops. Mark every failure.
```

## 10. Export to the game

```
Export public/models/skater/skater.glb (and skater.fbx as a backup): mesh, armature
and all clips. Apply Transform off, Add Leaf Bones off, scale 1. Re-import into an
empty scene, play every clip, print bone count, triangle count and height.
Then update the game to load skater.glb instead of the box skater: AnimationMixer,
0.2 s crossfades, lean clips blended by the phone's steer value.
```

> The game uses **GLB** (Three.js loads it natively). FBX is only a backup.


</details>

---

## Bonus: the skateboard, built in code (free)

```
Build a skateboard from these measurements, one part per prompt:
- deck: 81 cm × 21 cm, 1.2 cm thick, kicked nose and tail (15° up, last 15 cm each end),
  natural maple sides, black grip tape on top
- trucks: raw aluminium, 13 cm axles, 2 per board, 14 cm in from each end
- wheels: 54 mm diameter, 32 mm wide, off-white
Origin at the centre of the deck's underside. Under 2,000 triangles, max 3 materials.
Export public/models/skateboard.glb.
```

Later, the **Red Square buildings** follow the same "code, not generator" rule. Use MAP.md with a `buildings.py` generator.

---

## When it breaks

| Problem | Cause → fix |
|---|---|
| Second face on the back of the head | Left/right views swapped → `SWAP_LEFT_RIGHT` in step 3 |
| Legs move together like one blob | Jeans legs fused → split the inner seam, step 5 |
| Hoodie stretches when arms move | Torso weighted to arm bones → step 7 |
| Spike out of the hoodie or jeans | Weights smoothed across parts → step 7 |
| Feet slide on the board | IK not locked to the deck → step 9 |
| Twisted knees in a clip | Clip made on a different rest pose → step 9 |
| White discs / black triangles | Zero-length normals → step 4 |
| Logos or text missing | Generators drop them; add in code if wanted (original designs only) |
