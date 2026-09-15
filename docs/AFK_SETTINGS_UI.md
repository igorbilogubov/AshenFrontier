# AFK settings panel

The client inserts a settings button beside AFK and opens a compact, nonmodal "Автоохота" panel. Opening it closes the character and inventory panels, leaves the AFK mode and combat state alone, and does not clear held input. Escape closes this panel. Form inputs use native keyboard handling; the rest of the page remains available.

The form controls pickup of personal gold and white/green/blue items, HP and MP potion thresholds (5–95%), an ordered selected subset of the class's four skills, ordinary attack fallback, and hunting radius (25–100%, default 100%). The loot helper text says pickup is limited to the configured radius and full bags leave items on the ground. These settings apply to online AFK play; the panel makes no offline promise.

`bindAfkSettings(game, toast)` returns `{update, onEvent, isOpen}` for the scene loop. `update` hydrates from `self.afkPreferences` on hero change and when the first snapshot arrives, while preserving an edited draft across frequent snapshots. Save sends `{type:'afkPreferences', preferences}`. Only a private `preferencesSaved` event with `ok:true` reports success. While awaiting the event, Save is disabled. After an eight-second timeout, the panel compares the saved snapshot with the sent value and offers a retry without reporting false success. The client keeps a matching local structural type until the backend's shared contract is integrated.

This branch adds `afk-settings-ui.ts`, `afk-settings.css`, and the stylesheet link in `index.html`. The parent integration binds the returned callbacks in `scene.ts` and verifies the real browser layout after merging the server preference contract.
