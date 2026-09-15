# HUD cleanup

The bottom HUD keeps the HP and mana orbs beside seven equal action cells: attack, four class skills (1–4), HP potion (Q), and mana potion (W). The XP bar directly above the actions shows current and required XP. AFK, run/walk, and camp return controls sit above it. Gold remains visible in inventory only. The former footer help, save text, and FPS readout are removed; the existing `performance` node is hidden in the header until the scene writer is removed.

Inventory no longer shows a persistent selected-item detail card or sword/axe switching controls. Equipment and bag items still use the existing hover tooltip, right-click, and drag interactions. Opening character or inventory releases any held physical input once, while panel updates no longer clear input. Panel-open CSS no longer changes the position, display, opacity, or pointer handling of the combat HUD, hero shortcuts, or chat.

The shared DOM contract adds `hud-experience`, `hud-xp-text`, `mana-potion`, and `mana-potions`. The scene should stop writing `gold` and `xp`, and bind `mana-potion` to the server potion command and `mana-potions` to its count. This branch links `camp-ui.css` and `target-presentation.css` supplied by sibling work. The browser layout will be checked after integration into main.
