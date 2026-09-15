# Class combat animation library

Mixamo motion sources downloaded through the user's signed-in account, 15 September 2026, FBX Binary, Without Skin, 30 FPS, no keyframe reduction. Motions are retargeted in Mixamo onto Paladin J Nordstrom to match the established 67-bone game rig. Sources remain separate from equipment model generators.

The build script writes only this folder's Blender scene/report and `public/game/characters/class-combat-v1.glb`. Planar root motion is removed; server position/yaw remain authoritative. Runtime aligns each clip's release frame with the actual server skill hitFraction.

Source motion names and timing are recorded in build-report.json after import. Existing warrior Slash clips stay in the character models. Assets are used as part of the game under the source terms documented in ASSETS.md; this library is not a standalone asset product.

| FBX | Mixamo motion | Runtime |
|---|---|---|
| bow-recoil.fbx | Standing Aim Recoil | Bow_Recoil |
| bow-draw.fbx | Standing Aim Overdraw | Bow_Draw |
| mage-cast.fbx | Standing 1H Magic Attack 01 | Mage_Cast |
| mage-pulse.fbx | Standing 2H Magic Area Attack 02 | Mage_Pulse |

Rebuild: `/Applications/Blender.app/Contents/MacOS/Blender -b -t 2 --python scripts/blender/build_combat_animations.py`. This overwrites this library's `.blend`, `.glb`, report. Mixamo options remain 50 Overdrive / 50 Arm-Space, full source range, not mirrored. Runtime samples the first .85 seconds of overdraw for preparation, then recoil for release; mage source contacts are .45 and .60 of their clips. The game time is taken from `HeroAttack` and `SKILLS.hitFraction`. Cloth remains skinned, without physics.

Validation: real exported models are sampled through all six skills in `test/combat-animation.test.mjs`: finite skins, bounded extents, grounded hips, recovery after attack/death. Browser workshop verifies archer draw/release and both mage casts. These tests do not replace testing the shared world or long-run FPS.
