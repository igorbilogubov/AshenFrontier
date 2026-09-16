# Wasteland fauna v1

Four original Blender creatures, 16 September 2026. `build.py` is the authored source; it creates each named `.blend`, `renders/<type>.png`, `<type>-report.json` and runtime `public/game/creatures/<type>.glb`. Rebuilding overwrites only these four new species. Prior fauna, snow and wolf reference stay unchanged. No third-party assets or downloads.

Ash jackal: narrow chest, long dark muzzle, tall ears and long bushy tail. Monitor lizard: low wide body, splayed articulated legs, broad head, claws and long tapered tail. Scorpion: eight planted legs, paired articulated pincers, segmented raised stinger. Scarab: six legs, split armored shell, neck shield and forward horn.

All are joined skinned meshes with 3–4 material primitives, vertex colors and eight in-place clips: Idle/Walk/Run/Attack/Hit/Death/Turn_Left/Turn_Right. Walk/run use planted support targets and lifted recovery, with distance-driven gait in the renderer. Attack contact is 68%. Collision and damage stay server-owned; there is no root-motion authority or physics fur.

Rebuild from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -t 4 --python art/creatures/wasteland-v1/build.py
# Optional species filter after --
node art/creatures/wasteland-v1/measure.mjs
```

The reports describe actual exported GLBs. Browser inspection is recorded separately in docs/WASTELANDS.md after integration; Blender renders alone do not confirm runtime appearance.
