# Snow fauna v1

16 September 2026. Four original game creatures authored with the project's Blender geometry and skeleton helpers. No third-party model, image, texture or animation downloads. Existing forest assets and the wolf reference are untouched.

`build.py` is the source of truth. It creates each named `.blend`, runtime `public/game/creatures/<type>.glb`, `<type>-report.json`, and `renders/<type>.png`. It reuses the project's `build_creatures.py` sculpt/binding/IK helpers and `build_bear.py` quadruped locomotion, with entirely new geometry. Generator output overwrites those four assets; move manual edits into the generator before rebuilding. `.blend1` files are automatic backups and are excluded from Git.

- `lynx`: compact feline head and cheek ruff, tall pointed ears with black tufts, bobtail, large snow paws and mottled light coat. Four grounded legs and a raised paw swipe.
- `yak`: broad back and shoulders, long layered flank hair, beard and swept horns. Four grounded legs; weight transfer and foreleg attack.
- `frost-spider`: low crystalline abdomen, eight articulated legs, forward fangs and small glowing eyes. Alternating four-foot support groups; forward bite.
- `ice-golem`: broad faceted torso, exposed cold heart, shoulder shards and two heavy fists. Alternating two-legged walk; raised right-fist slam.

All use one joined skinned mesh and 3–5 material primitives; no transparent hair cards, external textures or runtime geometry generation. Vertex colour carries animal coat variation. Frozen-core emissive accents are baked material settings, without dynamic lights.

Eight in-place clips: Idle 2.8 s, Walk 1.6 s, Run 0.9 s, Attack 1.2 s, Hit 0.5 s, Death 1.6 s, Turn_Left and Turn_Right 1.6 s. Baked at 30 FPS with quaternion rotations. Server contact corresponds to 68% Attack. Root translation remains local; server owns movement/damage. Walk/Run runtime phase uses measured travel with authored stride lengths in the reports. Foot targets stay fixed during support, with a smooth lifted recovery. Turn cycles solve foot targets around the model origin.

Rebuild from repository root:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b -t 4 --python art/creatures/snow-v1/build.py
# Or rebuild selected species:
/Applications/Blender.app/Contents/MacOS/Blender -b -t 4 --python art/creatures/snow-v1/build.py -- lynx
```

`test/snow-creatures.test.mjs` reads the real exported GLBs and checks skeleton/clip/triangle/material budgets, finite animated geometry, loop closure and every support foot against the renderer's stride. Runtime culling boxes are sampled over the exported clips. PNGs are Blender references; the coordinator separately checks the exported GLBs in the browser after integration. This document does not claim deployment or final population FPS. Animation is authored stylization; there is no terrain IK or physics-based fur, and abrupt network turns/blending can still show small slips.

After exporting, run `node art/creatures/snow-v1/measure.mjs` to regenerate `animation-bounds.json` from 61 samples per clip in the shipped GLBs. Runtime boxes round these outward and add at least 0.13 m clearance. The full creature culling test checks both forest and snow species against those runtime boxes.

Final GLB validation: 3 tests passed on the four exports. Support-foot drift is below 0.015 m on every leg in Walk/Run. Death poses: lynx/yak settle onto the side, spider folds down while retaining foot support, and golem falls forward. Geometry budgets measured by the exporters:

| Type | Triangles | Bones | Material groups | GLB bytes |
| --- | ---: | ---: | ---: | ---: |
| lynx | 10472 | 24 | 3 | 588360 |
| yak | 15256 | 24 | 4 | 772548 |
| frost-spider | 3840 | 28 | 4 | 432392 |
| ice-golem | 1232 | 14 | 3 | 198660 |
