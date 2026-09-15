/** Authored, scalable skill illustrations. Each silhouette remains distinct at HUD size. */
const sword='<path d="M18 44 42 10 49 7 47 18 25 48Z" fill="#cad8d4"/><path d="m22 44 23-31-3 14-17 21Z" fill="#728f98"/><path d="m14 39 15 13-4 4-15-13Z" fill="#c49d52"/><path d="m16 49-8 10 5 3 8-10" fill="#78472e"/>';
const arrow='<path d="m12 54 37-42M39 13l12-3-3 12M10 47l-1 9 9-1" fill="none" stroke="#e2d6a7" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
const icons:Record<string,string>={
  warrior:sword,
  'warrior-cleave':'<path d="M8 12Q43 6 56 44L45 36Q32 16 8 12Z" fill="#dc944d"/><path d="M5 20Q30 11 51 39" fill="none" stroke="#ffe0a1" stroke-width="2"/>'+sword,
  'warrior-whirlwind':'<path d="M50 16C20-3 1 29 17 45c10 10 30 6 35-8M47 9l5 9-11 1M15 48c17 15 43-3 41-19" fill="none" stroke="#e9b777" stroke-width="4" stroke-linecap="round"/>'+sword,
  'warrior-thrust':'<path d="M5 42h25L45 18 57 8 52 25 33 48H5Z" fill="#7d998d"/><path d="m9 29 16-4M10 52l13-3" stroke="#efcc84" stroke-width="3"/>'+sword,
  'warrior-shockwave':'<path d="m5 53 10-14 7 14 11-18 9 18 11-13 7 13" fill="#b57948" stroke="#ffd197" stroke-width="2"/><path d="M6 58h52M9 31q23-15 47 0" fill="none" stroke="#f0ba6d" stroke-width="3"/><g transform="rotate(-45 32 32) translate(3 -7)">'+sword+'</g>',
  archer:'<path d="M16 9Q61 28 18 55L16 9Z" fill="none" stroke="#b99861" stroke-width="3"/><path d="m16 9 8 23-6 23" fill="none" stroke="#d9dcc5"/>'+arrow,
  'archer-piercing':'<path d="m8 43 31-28-7 21Z" fill="#6b9f7b"/><path d="m21 57 29-30M5 37l24-23" stroke="#8bae84" stroke-width="2"/>'+arrow,
  'archer-volley':'<g transform="translate(-13 0)">'+arrow+'</g>'+arrow+'<g transform="translate(11 3)">'+arrow+'</g>',
  'archer-frost-shot':'<path d="m38 8 16 4-3 17-16-2Z" fill="#709eb9"/><path d="M14 16v19M6 21l16 10M6 31l16-10" stroke="#c3eeff" stroke-width="2.5"/>'+arrow,
  'archer-rain':'<path d="M8 54q24-10 49 0M15 59h34" stroke="#b2cb80" stroke-width="3" fill="none"/><g transform="translate(-11 -3) rotate(92 32 32)">'+arrow+'</g><g transform="translate(5 3) rotate(92 32 32)">'+arrow+'</g><g transform="translate(20 -5) rotate(92 32 32)">'+arrow+'</g>',
  mage:'<circle cx="32" cy="31" r="17" fill="#586eb3"/><circle cx="32" cy="31" r="10" fill="#b8dbea"/><path d="m32 4 3 12-3 5-3-5ZM32 42l3 5-3 13-3-13ZM5 31l12-3 5 3-5 3ZM42 31l5-3 13 3-13 3Z" fill="#a8bcd3"/>',
  'mage-fireball':'<path d="M11 53C-1 36 25 23 34 5c-2 13 5 18 9 19l8-15c-1 21 18 24 3 43-10 11-32 12-43 1Z" fill="#cb5131"/><path d="M21 52c-9-12 8-25 15-32-3 13 7 11 6 0 19 22 8 37-10 37Z" fill="#ef9b45"/><path d="M29 52c-7-7 2-12 6-21-1 11 9 12 4 20Z" fill="#ffe6a7"/>',
  'mage-frost':'<circle cx="32" cy="32" r="25" fill="none" stroke="#6896a8" stroke-width="2"/><g stroke="#c7ebef" stroke-width="2.6" fill="none" stroke-linecap="round"><path d="M32 7v50M10 19l44 26M10 45l44-26M25 12l7 7 7-7M25 52l7-7 7 7M13 26l10-2-1-10M51 38l-10 2 1 10M13 38l10 2-1 10M51 26l-10-2 1-10"/></g><path d="m32 23 8 9-8 9-8-9Z" fill="#78b8d1"/>',
  'mage-lightning':'<path d="m38 4-25 31h16l-9 25 32-36H36L45 4Z" fill="#9590d4"/><path d="m36 8-15 23h13l-9 22 23-25H32Z" fill="#e8e2ff"/><path d="m10 9 5 8-5 6M49 43l5 5-6 8" fill="none" stroke="#bcaaf1" stroke-width="2"/>',
  'mage-meteor':'<path d="M59 3 48 40 23 51 8 33Z" fill="#a94b32"/><path d="m53 11-13 29-15 4-8-12Z" fill="#ea9545"/><circle cx="23" cy="40" r="14" fill="#5c554e" stroke="#ffd18a" stroke-width="3"/><path d="m15 37 8-6 8 6-5 9-9 1Z" fill="#94866b"/><path d="M6 60q22-16 48-1" fill="none" stroke="#df9460" stroke-width="3"/>',
  potion:'<path d="M25 8h14v13c0 5 13 14 13 24 0 18-40 18-40 0 0-10 13-19 13-24Z" fill="#8daba9"/><path d="M19 37q12 4 27 0c12 22-38 25-27 0Z" fill="#be493e"/><path d="M23 6h18v9H23Z" fill="#a88451"/><path d="M21 38q-4 8 0 12M29 20v5" stroke="#e6e8d8" stroke-width="3" stroke-linecap="round"/>',
  character:'<path d="M20 31V16L32 8l12 8v15l-12 9Z" fill="#91a8a5"/><path d="m21 23 9 3v9M43 23l-9 3v9" fill="none" stroke="#172924" stroke-width="4"/><path d="M8 57V45l14-7 10 9 10-9 14 7v12Z" fill="#bd9f64"/><path d="m15 54 3-9M49 54l-3-9" stroke="#e7d0a0" stroke-width="2"/>',
  inventory:'<path d="M23 16v-5q9-7 18 0v5M15 24q17-12 34 0v32H15Z" fill="none" stroke="#cdb57c" stroke-width="3"/><path d="M15 22h34v14q-17 9-34 0Z" fill="#91825c"/><path d="M20 43h24v10H20Z" fill="#637a67"/><path d="M29 31h6v11h-6Z" fill="#e2c99b"/>',
};
export function actionIcon(key:string){return `<svg viewBox="0 0 64 64" aria-hidden="true" focusable="false">${icons[key]||icons.warrior}</svg>`;}
