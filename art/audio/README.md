# Игровые звуки

18 сентября 2026. В клиент входят только выбранные короткие **MP3** (перекодировка из исходных OGG/WAV) из бесплатных CC0-паков. Полные архивы не хранятся. Safari и Chrome принимают MP3; исходный OGG Safari не играет.

| Файл в `public/game/sounds/` | Источник | Оригинал |
| --- | --- | --- |
| `swing-1/2/3.mp3` | Kenney RPG Audio | `knifeSlice`, `knifeSlice2`, `drawKnife1` |
| `whoosh.mp3` | artisticdude RPG Sound Pack | `battle/swing.wav`, сжато в mono MP3 |
| `hit-1/2/3.mp3` | Kenney Impact Sounds | `impactMetal_medium_000/001`, `impactPlate_heavy_000` |
| `hurt.mp3` | Kenney Impact Sounds | `impactGeneric_light_000` |
| `miss.mp3` | Kenney RPG Audio | `cloth1` |
| `gold-1/2.mp3` | Kenney RPG Audio | `handleCoins`, `handleCoins2` |
| `item.mp3` | Kenney RPG Audio | `dropLeather` |
| `heal.mp3` | Kenney Interface Sounds | `glass_004` |
| `potion.mp3` | artisticdude RPG Sound Pack | `inventory/bottle.wav` |
| `level.mp3`, `click.mp3`, `error.mp3`, `success.mp3`, `shop.mp3` | Kenney Interface Sounds | `confirmation_*`, `click_002`, `error_003`, `open_001` |
| `portal.mp3`, `camp.mp3`, `smith.mp3` | Kenney RPG Audio | `doorOpen_1`, `metalPot1`, `metalClick` |
| `step-1/2/3.mp3` | Kenney Impact Sounds | `footstep_grass_000…002` |
| `magic.mp3` | artisticdude RPG Sound Pack | `battle/magic1.wav`, обрезка 1,15 с |
| `kill.mp3`, `death.mp3` | artisticdude RPG Sound Pack | `NPC/gutteral beast/mnstr1.wav`, `mnstr3.wav` |

Лицензии: CC0. Тексты Kenney — рядом. artisticdude: [RPG Sound Pack](https://opengameart.org/content/rpg-sound-pack), CC0. Указывать Kenney.nl не обязательно, но вежливо.

Клиентский код: `public/game/sounds.ts`. Правила: [docs/AUDIO.md](../../docs/AUDIO.md).
