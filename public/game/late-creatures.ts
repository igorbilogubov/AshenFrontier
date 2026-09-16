import type {LateMobType} from './late-world.js';
// Measured from every exported GLB clip at 33 samples, plus 0.16m safety margin.
export const LATE_CREATURE_STRIDES:Readonly<Record<LateMobType,{walk:number;run:number}>>=Object.freeze({
  "basalt-brute": {
    "walk": 0.64,
    "run": 0.92
  },
  "bog-spider": {
    "walk": 0.62,
    "run": 0.9
  },
  "bonehound": {
    "walk": 0.72,
    "run": 1
  },
  "cave-bat": {
    "walk": 0.64,
    "run": 0.92
  },
  "cave-crawler": {
    "walk": 0.52,
    "run": 0.76
  },
  "crystal-beetle": {
    "walk": 0.54,
    "run": 0.78
  },
  "ember-crab": {
    "walk": 0.52,
    "run": 0.76
  },
  "gargoyle": {
    "walk": 0.64,
    "run": 0.92
  },
  "hellhound": {
    "walk": 0.72,
    "run": 1
  },
  "iron-warden": {
    "walk": 0.64,
    "run": 0.92
  },
  "lava-elemental": {
    "walk": 0.64,
    "run": 0.92
  },
  "marsh-crocodile": {
    "walk": 0.58,
    "run": 0.82
  },
  "plague-mosquito": {
    "walk": 0.54,
    "run": 0.78
  },
  "stone-guardian": {
    "walk": 0.64,
    "run": 0.92
  },
  "swamp-frog": {
    "walk": 0.58,
    "run": 0.82
  },
  "void-stalker": {
    "walk": 0.72,
    "run": 1
  }
});
export const LATE_CREATURE_BOUNDS:Readonly<Record<LateMobType,{min:readonly [number,number,number];max:readonly [number,number,number]}>>=Object.freeze({
  "basalt-brute": {
    "min": [
      -1.27,
      -0.16,
      -0.81
    ],
    "max": [
      1.27,
      2.47,
      2.42
    ]
  },
  "bog-spider": {
    "min": [
      -1.52,
      -0.17,
      -1.24
    ],
    "max": [
      1.52,
      1.22,
      1.4
    ]
  },
  "bonehound": {
    "min": [
      -1.56,
      -0.17,
      -1.55
    ],
    "max": [
      0.76,
      1.67,
      1.58
    ]
  },
  "cave-bat": {
    "min": [
      -2.35,
      -0.04,
      -1.12
    ],
    "max": [
      2.35,
      3.36,
      2.66
    ]
  },
  "cave-crawler": {
    "min": [
      -1.33,
      -0.15,
      -0.97
    ],
    "max": [
      1.33,
      1.02,
      1.63
    ]
  },
  "crystal-beetle": {
    "min": [
      -1.33,
      -0.15,
      -1.07
    ],
    "max": [
      1.33,
      1.68,
      1.23
    ]
  },
  "ember-crab": {
    "min": [
      -1.33,
      -0.16,
      -0.95
    ],
    "max": [
      1.33,
      1.09,
      1.95
    ]
  },
  "gargoyle": {
    "min": [
      -1.94,
      -0.18,
      -1.08
    ],
    "max": [
      1.96,
      2.59,
      2.57
    ]
  },
  "hellhound": {
    "min": [
      -1.99,
      -0.17,
      -1.55
    ],
    "max": [
      0.76,
      2.06,
      1.58
    ]
  },
  "iron-warden": {
    "min": [
      -1.27,
      -0.18,
      -0.81
    ],
    "max": [
      1.46,
      3.34,
      2.61
    ]
  },
  "lava-elemental": {
    "min": [
      -1.27,
      -0.13,
      -0.74
    ],
    "max": [
      1.27,
      2.5,
      2.42
    ]
  },
  "marsh-crocodile": {
    "min": [
      -1.35,
      -0.18,
      -2.32
    ],
    "max": [
      1.35,
      0.99,
      1.44
    ]
  },
  "plague-mosquito": {
    "min": [
      -1.39,
      -0.14,
      -1.16
    ],
    "max": [
      1.39,
      2.05,
      1.56
    ]
  },
  "stone-guardian": {
    "min": [
      -1.27,
      -0.16,
      -0.74
    ],
    "max": [
      1.27,
      2.47,
      2.42
    ]
  },
  "swamp-frog": {
    "min": [
      -1.36,
      -0.18,
      -1.08
    ],
    "max": [
      1.36,
      1.05,
      1.26
    ]
  },
  "void-stalker": {
    "min": [
      -2.07,
      -0.17,
      -1.55
    ],
    "max": [
      0.76,
      2.09,
      1.44
    ]
  }
});
export const LATE_CREATURE_HEIGHTS:Readonly<Record<LateMobType,number>>=Object.freeze({
  "basalt-brute": 2.53,
  "bog-spider": 1.28,
  "bonehound": 1.73,
  "cave-bat": 3.42,
  "cave-crawler": 1.08,
  "crystal-beetle": 1.74,
  "ember-crab": 1.15,
  "gargoyle": 2.65,
  "hellhound": 2.12,
  "iron-warden": 3.4,
  "lava-elemental": 2.56,
  "marsh-crocodile": 1.05,
  "plague-mosquito": 2.11,
  "stone-guardian": 2.53,
  "swamp-frog": 1.11,
  "void-stalker": 2.15
});
