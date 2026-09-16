# Late-world fauna v1

Sixteen original creatures authored for the four outdoor regions on 16 September 2026. No external models or downloads. `build.py` generates only this directory's sixteen `.blend`, JSON reports/renders and the sixteen corresponding `public/game/creatures/*.glb`. Rebuilding overwrites these named outputs. Existing fauna and immutable wolf comparison remain untouched.

Distinct anatomical groups: swamp toad/crocodile/winged mosquito/eight-leg spider; flying bat/many-legged crawler/crystal beetle/stone guardian; horned hound/floating lava elemental/broad clawed crab/basalt brute; skeletal hound/winged gargoyle/long-limbed stalker/armored iron warden. Skin palettes are not the only distinction: each has independently authored silhouette geometry and proportions.

Shared project rig and IK helpers are imported from snow/wasteland fauna. All exports have eight in-place clips, Idle/Walk/Run/Attack/Hit/Death/Turn_Left/Turn_Right. Planted legs use distance strides; flying forms use flapping wings with separately animated torso. Damage and collision remain server-owned. No dynamic lights or translucent fur.

Build from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -t 4 --python art/creatures/late-world-v1/build.py
# Optional subset after --
```

The generated reports count actual exported meshes. Browser GLB inspection and runtime integration are documented separately in docs/LATE_WORLD.md. This is the first authored gameplay set; it is not a claim of hand-sculpted high-resolution production art.
