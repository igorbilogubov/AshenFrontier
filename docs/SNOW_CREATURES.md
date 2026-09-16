# Snow creature implementation — 16 September 2026

Local source and assets for `lynx`, `yak`, `frost-spider` and `ice-golem` are prepared in `codex/snow-creatures`. Source/provenance, rebuild rules and movement details: [snow-v1](../art/creatures/snow-v1/README.md).

The runtime loads each type's GLB through the existing skeleton-clone cache. `createMob(type, assets, eliteId?)` resolves full server-compatible stats through `mobConfig({type, eliteId})`. Elite instances clone their materials, add a restrained cold emission for yak/golem or warm emission for forest variants, and use elite scale/HP/range; base cached materials stay unchanged. All eight-clip creatures use actual movement distance and turning angle for foot phase. Spider shadow/health height and golem shadow/health height match their distinct shapes. Fixed clip-sampled bounds preserve skinned-mesh camera/shadow culling.

The existing forest anatomical tests are scoped to wolf/boar/alpha/bear: those animals share the original 24-bone four-paw contract and textured coat. Separate snow tests verify their actual eight-leg/two-leg/four-leg anatomy and budgets. Shared stats, spawn locations, level requirements, respawn timers and loot belong to the snow-world change, not to the asset generator.

## Verification boundary

See final asset reports for measured triangle, bone, material and file-size counts. The snow test reads exported GLBs, samples every animation, measures support-foot drift against the exact runtime strides, checks death/loop stability, and constrains geometry budgets. Blender renders are reference images; browser inspection and full `npm run check`/`npm test` are integration checks performed by the coordinator once the new shared MobType/mobConfig contract is merged. No shared server restart, production deployment, push, database operation or native build is part of this asset branch.
