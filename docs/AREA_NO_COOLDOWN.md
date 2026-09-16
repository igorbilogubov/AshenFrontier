# Large-area skill cadence

`warrior-earthquake`, `archer-arrow-storm` and `mage-arcane-nova` have no individual cooldown. Their mana costs, five-metre areas, damage values, target caps and full attack animations are unchanged.

The server still accepts only one attack at a time. A second cast during the animation is rejected without spending mana; the same skill can start again as soon as that animation finishes and its mana cost is available.

On load, a remaining positive cooldown saved by an earlier version for one of these three skills is normalized to zero. Other skill cooldowns are preserved. This changes no database schema or saved build layout.
