// Design directions: complete visual identities the studio engine can choose from.
// Each one has its own type pairing, shape language, light/dark default, motion
// personality and preferred section variants, so sites don't look interchangeable.

export const DIRECTIONS = {
  atelier: {
    name: 'Atelier editorial',
    mode: 'light',
    fonts: { display: 'Cormorant Garamond', displayWeight: 600, body: 'Manrope', query: 'family=Cormorant+Garamond:ital,wght@0,500;0,600;1,500&family=Manrope:wght@400;500;600;700' },
    radius: { sm: '2px', md: '4px', lg: '6px', pill: '2px' },
    displayTracking: '-0.01em', displayScale: 1.12, displayLeading: 1.02, headingTransform: 'none',
    hero: ['editorial', 'fullbleed', 'collage'],
    services: ['hoverList', 'bento', 'tabs'],
    about: ['statement', 'splitParallax'],
    process: ['timeline', 'steps'],
    cta: ['bigType', 'imageBand'],
    footer: ['wordmark', 'columns'],
    motion: { preloader: true, cursor: false, magnetic: true, tilt: false, grain: false, blobs: false, aurora: false, marquee: false, imageReveal: true },
    tint: 0.008, lightBgL: 0.975, darkBgL: 0.16, accentShift: 40,
    natures: { portfolio: 5, professional: 3, care: 2, hospitality: 3, property: 4, event: 2, commerce: 2 },
    tones: { luxury: 4, creative: 2, calm: 1, professional: 1 },
    defaultPrimary: '#5b4636'
  },
  serene: {
    name: 'Serene soft',
    mode: 'light',
    fonts: { display: 'Fraunces', displayWeight: 500, body: 'Figtree', query: 'family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Figtree:wght@400;500;600;700' },
    radius: { sm: '12px', md: '22px', lg: '36px', pill: '999px' },
    displayTracking: '-0.02em', displayScale: 1, displayLeading: 1.06, headingTransform: 'none',
    hero: ['split', 'fullbleed', 'collage'],
    services: ['bento', 'cards', 'tabs'],
    about: ['splitParallax', 'statement'],
    process: ['steps', 'timeline'],
    cta: ['softPanel', 'imageBand'],
    footer: ['columns', 'wordmark'],
    motion: { preloader: false, cursor: false, magnetic: false, tilt: true, grain: false, blobs: true, aurora: false, marquee: false, imageReveal: true },
    tint: 0.016, lightBgL: 0.982, darkBgL: 0.18, accentShift: 55,
    natures: { care: 6, education: 4, service: 2, hospitality: 1, civic: 3, property: 2 },
    tones: { calm: 4, warm: 2, professional: 1 },
    defaultPrimary: '#2a7f8f'
  },
  kinetic: {
    name: 'Kinetic bold',
    mode: 'light',
    fonts: { display: 'Archivo', displayWeight: 800, body: 'Archivo', query: 'family=Archivo:wdth,wght@62..125,400;62..125,500;62..125,600;125,800;125,900' },
    radius: { sm: '0px', md: '0px', lg: '0px', pill: '999px' },
    displayTracking: '-0.035em', displayScale: 1.18, displayLeading: 0.92, headingTransform: 'none', displayStretch: '125%',
    hero: ['kinetic', 'fullbleed', 'split'],
    services: ['marqueeCards', 'bento', 'hoverList'],
    about: ['statement', 'splitParallax'],
    process: ['steps', 'timeline'],
    cta: ['bigType', 'marqueeCta'],
    footer: ['wordmark'],
    motion: { preloader: true, cursor: false, magnetic: true, tilt: false, grain: false, blobs: false, aurora: false, marquee: true, imageReveal: true },
    tint: 0.006, lightBgL: 0.97, darkBgL: 0.14, accentShift: 160,
    natures: { fitness: 6, event: 5, commerce: 4, portfolio: 3, trades: 2, software: 2 },
    tones: { bold: 5, creative: 2 },
    defaultPrimary: '#e0412b'
  },
  noir: {
    name: 'Noir luxe',
    mode: 'dark',
    fonts: { display: 'DM Serif Display', displayWeight: 400, body: 'Outfit', query: 'family=DM+Serif+Display:ital@0;1&family=Outfit:wght@300;400;500;600' },
    radius: { sm: '2px', md: '3px', lg: '4px', pill: '999px' },
    displayTracking: '-0.015em', displayScale: 1.08, displayLeading: 1, headingTransform: 'none',
    hero: ['fullbleed', 'editorial', 'collage'],
    services: ['hoverList', 'tabs', 'bento'],
    about: ['statement', 'splitParallax'],
    process: ['timeline'],
    cta: ['imageBand', 'bigType'],
    footer: ['wordmark', 'columns'],
    motion: { preloader: true, cursor: true, magnetic: true, tilt: false, grain: true, blobs: false, aurora: false, marquee: false, imageReveal: true },
    tint: 0.01, lightBgL: 0.97, darkBgL: 0.13, accentShift: 30,
    natures: { hospitality: 4, professional: 3, portfolio: 3, event: 3, commerce: 2, property: 2 },
    tones: { luxury: 6, bold: 1 },
    defaultPrimary: '#c8a24a'
  },
  aurora: {
    name: 'Aurora tech',
    mode: 'dark',
    fonts: { display: 'Sora', displayWeight: 600, body: 'Plus Jakarta Sans', query: 'family=Sora:wght@500;600;700&family=Plus+Jakarta+Sans:wght@400;500;600;700' },
    radius: { sm: '10px', md: '16px', lg: '24px', pill: '999px' },
    displayTracking: '-0.035em', displayScale: 1.02, displayLeading: 1.02, headingTransform: 'none',
    hero: ['aurora', 'split'],
    services: ['bento', 'tabs', 'cards'],
    about: ['statement', 'splitParallax'],
    process: ['steps', 'timeline'],
    cta: ['auroraPanel', 'bigType'],
    footer: ['columns'],
    motion: { preloader: false, cursor: true, magnetic: true, tilt: true, grain: false, blobs: false, aurora: true, marquee: true, imageReveal: false },
    tint: 0.012, lightBgL: 0.98, darkBgL: 0.15, accentShift: 70,
    natures: { software: 7, professional: 1, education: 1, event: 1 },
    tones: { bold: 2, professional: 1 },
    defaultPrimary: '#6d5dfc'
  },
  craft: {
    name: 'Craft organic',
    mode: 'light',
    fonts: { display: 'Young Serif', displayWeight: 400, body: 'Work Sans', query: 'family=Young+Serif&family=Work+Sans:wght@400;500;600;700' },
    radius: { sm: '10px', md: '18px', lg: '30px', pill: '999px' },
    displayTracking: '-0.015em', displayScale: 1.02, displayLeading: 1.05, headingTransform: 'none',
    hero: ['collage', 'split', 'fullbleed'],
    services: ['cards', 'bento', 'marqueeCards'],
    about: ['splitParallax', 'statement'],
    process: ['steps'],
    cta: ['softPanel', 'imageBand'],
    footer: ['columns', 'wordmark'],
    motion: { preloader: false, cursor: false, magnetic: false, tilt: true, grain: true, blobs: false, aurora: false, marquee: true, imageReveal: true },
    tint: 0.022, lightBgL: 0.968, darkBgL: 0.19, accentShift: 120,
    natures: { hospitality: 6, commerce: 3, trades: 3, care: 1, event: 1, service: 2 },
    tones: { warm: 5, creative: 1 },
    defaultPrimary: '#a4462a'
  },
  swiss: {
    name: 'Swiss precision',
    mode: 'light',
    fonts: { display: 'Schibsted Grotesk', displayWeight: 700, body: 'Schibsted Grotesk', query: 'family=Schibsted+Grotesk:wght@400;500;600;700;800' },
    radius: { sm: '0px', md: '2px', lg: '4px', pill: '4px' },
    displayTracking: '-0.04em', displayScale: 1.05, displayLeading: 0.98, headingTransform: 'none',
    hero: ['split', 'editorial', 'fullbleed'],
    services: ['hoverList', 'tabs', 'bento'],
    about: ['splitParallax', 'statement'],
    process: ['timeline', 'steps'],
    cta: ['bigType', 'imageBand'],
    footer: ['columns'],
    motion: { preloader: false, cursor: false, magnetic: false, tilt: false, grain: false, blobs: false, aurora: false, marquee: false, imageReveal: true },
    tint: 0.005, lightBgL: 0.985, darkBgL: 0.16, accentShift: 180,
    natures: { professional: 6, property: 5, trades: 5, civic: 3, software: 2, service: 4, education: 2 },
    tones: { professional: 4 },
    defaultPrimary: '#1d3fbb'
  },
  pop: {
    name: 'Playful pop',
    mode: 'light',
    fonts: { display: 'Bricolage Grotesque', displayWeight: 800, body: 'DM Sans', query: 'family=Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800&family=DM+Sans:wght@400;500;600;700' },
    radius: { sm: '14px', md: '24px', lg: '40px', pill: '999px' },
    displayTracking: '-0.03em', displayScale: 1.06, displayLeading: 0.98, headingTransform: 'none',
    hero: ['kinetic', 'collage', 'split'],
    services: ['cards', 'bento', 'marqueeCards'],
    about: ['splitParallax', 'statement'],
    process: ['steps'],
    cta: ['softPanel', 'marqueeCta'],
    footer: ['wordmark', 'columns'],
    motion: { preloader: false, cursor: false, magnetic: true, tilt: true, grain: false, blobs: true, aurora: false, marquee: true, imageReveal: true },
    tint: 0.02, lightBgL: 0.98, darkBgL: 0.18, accentShift: 150,
    natures: { education: 4, event: 4, fitness: 2, commerce: 2, hospitality: 2, care: 1 },
    tones: { creative: 3, warm: 2, bold: 2 },
    defaultPrimary: '#ff5a36'
  }
};

export const DIRECTION_IDS = Object.keys(DIRECTIONS);

/** Deterministic PRNG so one seed always reproduces the same design decisions. */
export function seededRandom(seedText) {
  let h = 2166136261;
  for (const char of String(seedText)) h = Math.imul(h ^ char.charCodeAt(0), 16777619);
  return () => {
    h += 0x6d2b79f5;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function pick(list, random) {
  return list[Math.floor(random() * list.length) % list.length];
}

/**
 * Choose a direction. Scores every direction for the business nature, the tone and
 * words in the prompt, adds the AI's suggestion, then picks randomly among the best
 * few so repeated prompts still get fresh designs.
 */
export function chooseDirection({ nature, tone, prompt = '', aiDirection = '', random }) {
  const lower = String(prompt).toLowerCase();
  const explicit = [
    ['noir', /\b(dark|moody|noir|luxur\w*|opulent|speakeasy|cocktail|black and gold|after dark)\b/],
    ['aurora', /\b(futuristic|gradients?|neon|glass\w*|tech startup|saas|ai[- ]powered|cutting[- ]edge)\b/],
    ['kinetic', /\b(bold|loud|energetic|brutal\w*|sporty|street|high[- ]energy|punchy|edgy)\b/],
    ['atelier', /\b(editorial|elegant|refined|magazine|sophisticated|timeless|understated)\b/],
    ['serene', /\b(calm|soft|gentle|reassuring|airy|soothing|tranquil|peaceful)\b/],
    ['craft', /\b(rustic|handmade|hand[- ]made|artisan\w*|organic|cosy|cozy|homely|earthy)\b/],
    ['swiss', /\b(corporate|swiss|precise|structured|no[- ]nonsense)\b/],
    ['pop', /\b(playful|fun|colou?rful|kids|children'?s|vibrant|quirky|cheerful)\b/]
  ];
  const scored = DIRECTION_IDS.map((id) => {
    const d = DIRECTIONS[id];
    let score = (d.natures[nature] || 0) * 2 + (d.tones[tone] || 0) * 1.5;
    for (const [target, pattern] of explicit) if (target === id && pattern.test(lower)) score += 12;
    if (aiDirection === id) score += 5;
    return { id, score: score + random() * 3 };
  }).sort((a, b) => b.score - a.score);
  const top = scored.filter((item) => item.score >= scored[0].score - 4).slice(0, 3);
  return pick(top, random).id;
}
