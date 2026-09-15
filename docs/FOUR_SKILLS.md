# Four active skills per class

Implementation in `codex/four-skills-backend`, 15 September 2026. All twelve skills are available from level 1. Q/E are unchanged; new skills occupy Z/X. Server owns mana, cooldown, contact, hit chance, line of sight, target caps, slow duration, damage and kill credit. Client sends only `skillId` and finite yaw. Skill cooldowns remain private in hero saves and owner snapshots.

| Class | Z | X |
|---|---|---|
| Warrior | Выпад, `warrior-thrust`: one target in a 0.33 rad forward half-sector, 3 m; 2.15× damage, 14 MP, 6 s | Ударная волна, `warrior-shockwave`: narrow 0.36 rad sector, 4.2 m, up to 4 targets; 1.5× damage, 22 MP, 9 s |
| Archer | Морозная стрела, `archer-frost-shot`: one 7.2 m projectile, 1.55× damage; successful contact slows 2.5 s, 18 MP, 6 s | Дождь стрел, `archer-rain`: server center 3.975 m forward, radius 1.75 m, up to 4 targets after 0.45 s; 1.18× damage, 26 MP, 10 s |
| Mage | Цепная молния, `mage-lightning`: first target within 5.2 m forward, then up to two nearest unique targets within 1.9 m of the previous successful hit, with a clear path between targets; 1.55× then 0.72× per jump, 30 MP, 7 s | Метеор, `mage-meteor`: server center 3.825 m forward, radius 1.9 m, up to 5 targets after 0.7 s; 1.72× center damage falling to 0.68× at edge, 38 MP, 12 s |

`hitFraction` and `durationScale` are explicit in shared skill definitions. Area damage follows cast contact only if center is walkable, outside camp and unobstructed. `skillImpact` for rain/meteor emits `phase:'warning'` with `delay` and `radius` at cast contact, then `phase:'impact'` at server damage time, both at the same authoritative center. Lightning emits one arc event per attempted unique target with `from` pointing to the caster or prior successful target. A miss emits the separate `miss` event and stops the chain; later jumps also need an unobstructed path from the prior hit target. Projectile contact emits the existing `skillImpact`; no client particle causes damage. A cancelled AFK action cannot land a pending area hit. Pending areas are world memory and do not resume after server restart; cooldown and mana are saved.

This is an initial balance set. It needs browser animation QA and sustained class balance sampling after UI integration; measured production balance is not claimed.
