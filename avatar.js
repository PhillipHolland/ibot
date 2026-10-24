/** Click-wheel center characters and beat timing. No DOM, no secrets. */

export const CHARACTERS = [
  { id: "ball", name: "Ball", fill: "#111111", eye: "#ffffff" },
  { id: "cloud", name: "Cloud", fill: "#ff6a00", eye: "#0a0500" },
  { id: "pill", name: "Pill", fill: "#2fbf5b", eye: "#0a0500" },
  { id: "blob", name: "Blob", fill: "#8a5a3c", eye: "#0a0500" },
  { id: "triangle", name: "Triangle", fill: "#2f6bff", eye: "#0a0500" },
  { id: "pumpkin", name: "Pumpkin", fill: "#ff6a00", eye: "#0a0500" },
];

export function nextCharacter(index) {
  const i = Number.isFinite(index) ? index : 0;
  return (Math.floor(i) + 1) % CHARACTERS.length;
}

/** Stable bpm in 84–132 from a track id when MusicKit has no tempo. */
export function pseudoTempo(trackId) {
  const s = String(trackId ?? "ipod");
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return 84 + (h >>> 0) % 49;
}

/** Milliseconds per beat. Unknown or bad tempo falls back to 100, or track id. */
export function beatIntervalMs(tempo, trackId) {
  const n = Number(tempo);
  const bpm = n > 20 && n < 400 ? n : (trackId != null && trackId !== "" ? pseudoTempo(trackId) : 100);
  return 60000 / bpm;
}

/** Tall rounded pills, low and centered. Shared by every character. */
const EYES = `<g class="eyes">
  <rect class="eye eye-l" x="32" y="50" width="12" height="26" rx="6"/>
  <rect class="eye eye-r" x="56" y="50" width="12" height="26" rx="6"/>
</g>`;

/** Tap under 400ms and under 8px is a press. Longer or farther cycles the character. */
export function centerGesture({ dt, dist }) {
  const moved = Number(dist) || 0;
  const held = Number(dt) || 0;
  if (moved >= 24 || held >= 600) return "cycle";
  return "press";
}

const BODIES = {
  ball: `<circle class="body" cx="50" cy="50" r="50" fill="#111111"/>`,
  cloud: `<path class="body" fill="#ff6a00" d="M22 62c0-8 6-13 12-14 1-10 10-16 19-14 6-8 18-9 26-2 8 2 12 9 11 16 7 2 12 9 10 16-2 8-10 12-18 11-3 6-12 9-20 7-9 5-20 2-26-5-8 1-16-5-14-15z"/>`,
  pill: `<rect class="body" x="30" y="16" width="40" height="72" rx="20" fill="#2fbf5b"/>`,
  blob: `<path class="body" fill="#8a5a3c" d="M28 58c-2-14 8-28 22-30 12-2 24 4 28 16 6 2 12 12 8 22-3 12-14 18-26 18-14 4-28-2-32-14-2-4-1-8 0-12z"/>`,
  triangle: `<path class="body" fill="#2f6bff" d="M50 16c4 0 8 2 10 6l24 42c4 8 0 18-8 20H24c-8-2-12-12-8-20l24-42c2-4 6-6 10-6z"/>`,
  pumpkin: `<path class="stem" fill="#3a3a3a" d="M48 28c0-10 4-16 8-20 3-2 6 0 6 3-1 6-2 10-1 14-4 2-9 2-13 3z"/><path class="body" fill="#ff6a00" d="M18 62c0-18 12-32 32-34 18-1 34 12 34 30 0 16-12 28-28 30-4 2-10 2-14 0C26 86 18 76 18 62z"/>`,
};

/** One flat silhouette plus the shared eyes. */
export function characterMarkup(id) {
  const body = BODIES[id] || BODIES.ball;
  const eye = (CHARACTERS.find((c) => c.id === id) || CHARACTERS[0]).eye;
  return `<svg viewBox="0 0 100 100" class="avatar avatar-${id}" aria-hidden="true">${body}${EYES.replaceAll('class="eye', `fill="${eye}" class="eye`)}</svg>`;
}
