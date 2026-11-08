# Skate game

Three.js (React Three Fiber + Rapier) skate game: the laptop shows the level, a phone is the controller.
Run with `npm run dev`, open https://localhost:5173. Gesture tests: `npm test`.
Design notes: DESIGN.md (look), MAP.md (Red Square level), CHARACTER.md (making the player character).

# Blender
Run Blender as: "C:\Program Files\Blender Foundation\Blender 4.5\blender.exe" -b file.blend --python script.py
(Blender 4.5.3 LTS. With no .blend yet, leave out the file: `blender.exe -b --python script.py`.)
Keep every Blender step as its own .py file in art/scripts/ so it can be rerun.
Renders go to art/renders/, 768 px.

# Character rules
- Units: metres. Feet on 0. Forward is -Y in Blender (+Z in Three.js after export).
- Triangle budget for the skater: 25,000 (web game).
- Mixamo bone names (Hips, Spine, Spine1, Spine2, Neck, Head, LeftArm, LeftForeArm, LeftHand, LeftUpLeg, LeftLeg, LeftFoot, LeftToeBase, and Right* versions).
- Max 4 bones per vertex.
- Max 3 fix rounds per step, then stop and show me.
- No Disney or other brand graphics on the character (the game may be shared). Original designs only.
