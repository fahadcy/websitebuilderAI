// Studio engine: turns a brief + content into a complete, animated, multi-layout website.
//
// 1. chooseDirection()  -> one of 8 visual identities (fonts, shapes, motion, light/dark)
// 2. buildPalette()     -> contrast-safe light/dark palettes from prompt/AI/brand colours
// 3. plan               -> seeded choice of section variants + section order per page
// 4. render             -> static, editor-safe HTML + CSS + jQuery runtime

import { DIRECTIONS, chooseDirection, seededRandom, pick } from './directions.js';
import { buildPalette, css as oklchCss } from './palette.js';
import { buildCss } from './styles.js';
import { buildRuntime } from './runtime.js';
import * as S from './sections.js';

const IMAGE_KEYS = {
  hero: ['heroSeed', 'hero'],
  about: ['about story', 'about'],
  band: ['bandSeed', 'band', 'textureSeed'],
  detail: ['detailSeed', 'detail', 'textureSeed', 'productSeed'],
  service: ['serviceSeed', 'service', 'workSeed']
};

export function planDesign({ brief, content, prompt = '', seed, aiDesign = {} }) {
  const random = seededRandom(`${seed}|${brief.business_name}`);
  const directionId = DIRECTIONS[aiDesign.direction] && aiDesign.lock ? aiDesign.direction : chooseDirection({ nature: brief.project_nature, tone: brief.tone, prompt, aiDirection: aiDesign.direction, random });
  const direction = DIRECTIONS[directionId];
  const wantsDark = /\b(dark (?:theme|mode|background|site|website|design|look)|black background|dark,? moody|moody|noir|after dark)\b/i.test(prompt);
  const wantsLight = /\b(light (?:theme|mode|background)|white background|bright and airy)\b/i.test(prompt);
  const mode = wantsDark ? 'dark' : wantsLight ? 'light' : aiDesign.mode === 'dark' || aiDesign.mode === 'light' ? (direction.mode === 'dark' && aiDesign.mode === 'light' ? 'dark' : aiDesign.mode) : direction.mode;
  const palette = buildPalette({ primaryHex: brief.colours?.primary || aiDesign.primary, accentHex: brief.colours?.accent || aiDesign.accent, direction, mode });
  const variants = {
    hero: pick(direction.hero, random),
    services: pick(direction.services, random),
    about: pick(direction.about, random),
    process: pick(direction.process, random),
    cta: pick(direction.cta, random),
    footer: pick(direction.footer, random)
  };
  // Aurora heroes need dark; software on a light direction should not get aurora.
  if (variants.hero === 'aurora' && palette.defaultMode !== 'dark') variants.hero = 'split';
  const altServices = direction.services.filter((variant) => variant !== variants.services);
  const onePage = Boolean(content.onePage);
  const useBand = random() > 0.25 && variants.hero !== 'fullbleed';
  return { directionId, direction, palette, variants, altServices: altServices[0] || variants.services, onePage, useBand, random, seed };
}

function homeSections(plan, content) {
  const middle = ['about', 'band', 'process', 'team', 'gallery', 'pricing', 'testimonials'].filter((key) => {
    if (key === 'band') return plan.useBand;
    if (key === 'team') return content.team?.length;
    if (key === 'gallery') return content.gallery;
    if (key === 'pricing') return content.pricing?.length && plan.onePage;
    if (key === 'testimonials') return content.testimonials?.length;
    return true;
  });
  // Light shuffle: keep "about" early, everything else can move.
  const rest = middle.filter((key) => key !== 'about');
  for (let i = rest.length - 1; i > 0; i -= 1) {
    const j = Math.floor(plan.random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  const ordered = plan.random() > 0.5 ? ['about', ...rest] : [rest[0], 'about', ...rest.slice(1)].filter(Boolean);
  const list = ['hero', ['fullbleed', 'editorial', 'kinetic'].includes(plan.variants.hero) ? 'proof' : null, 'services', ...ordered, 'faq', 'cta'];
  if (plan.onePage || content.contactOnHome) list.push('contact');
  return list.filter(Boolean);
}

function innerSections(page, content) {
  const lower = page.toLowerCase();
  if (/^contact/.test(lower)) return ['pageHero', 'contact'];
  if (/faq|question/.test(lower)) return ['pageHero', 'faq', 'cta'];
  if (/gallery|before|results|portfolio|our work|^work$/.test(lower)) return ['pageHero', 'gallery', 'pageSections', 'cta'];
  if (/pric|fees|cost|rates|membership|packages|tickets/.test(lower)) return ['pageHero', content.pricing?.length ? 'pricing' : 'servicesAlt', 'pageSections', 'faq', 'cta'];
  if (/team|people|staff|practitioner|dentists|doctors|tutors|coaches|trainers|meet/.test(lower)) return ['pageHero', content.team?.length ? 'team' : 'about', 'pageSections', 'cta'];
  if (/about|story|who we are/.test(lower)) return ['pageHero', 'about', 'pageSections', 'process', 'cta'];
  if (/service|treatment|menu|bakes|product|shop|collection|classes|courses|features|what we do|properties|solutions|programme|cakes/.test(lower)) return ['pageHero', 'servicesAlt', 'pageSections', 'process', 'cta'];
  if (/new patient|first visit|getting started|how it works|process/.test(lower)) return ['pageHero', 'pageSections', 'process', 'faq', 'cta'];
  if (/emergenc|urgent/.test(lower)) return ['pageHero', 'pageSections', 'contact'];
  return ['pageHero', 'pageSections', 'cta'];
}

/**
 * Render every page. `pages` = [{ page, slug, data }] where data has h1, subheadline,
 * sections, metaTitle, metaDescription. `headFor(page)` returns SEO/schema markup.
 */
export function renderStudioSite({ brief, content, site, plan, pages, headFor, logo }) {
  const contactPage = pages.find((item) => /^contact/i.test(item.page))?.slug;
  const servicesPage = pages.find((item) => item.page !== 'Home' && /service|treatment|menu|bakes|product|shop|collection|classes|courses|features|properties|cakes/i.test(item.page));
  const navLinks = (current) => plan.onePage
    ? [['Services', '#services'], ['About', '#about'], content.team?.length ? ['Team', '#team'] : null, content.pricing?.length ? ['Prices', '#pricing'] : null, content.faqs?.length ? ['FAQ', '#faq'] : null, ['Contact', '#contact']].filter(Boolean).map(([label, href]) => ({ label, href: current === 'Home' ? href : `index.html${href}`, current: false }))
    : pages.filter((item) => !item.utility).map((item) => ({ label: item.page, href: item.slug, current: item.page === current }));

  const img = (purpose) => {
    const map = site.assetMap || {};
    for (const key of IMAGE_KEYS[purpose] || [purpose]) if (map[key]) return map[key];
    for (const keys of Object.values(IMAGE_KEYS)) for (const key of keys) if (map[key]) return map[key];
    return 'assets/images/01-hero.svg';
  };

  const html = {};
  pages.forEach((item, pageIndex) => {
    const ctx = {
      brief, content, site, page: item.page, pageData: item.data, pageIndex, isHome: item.page === 'Home',
      onePage: plan.onePage, servicesPage: servicesPage?.slug, contactPage, slug: item.slug, logo,
      motion: plan.direction.motion, img, pageImage: ['detail', 'service', 'about', 'band'][pageIndex % 4],
      navLinks: navLinks(item.page),
      variant: (kind) => plan.variants[kind]
    };
    const altCtx = { ...ctx, variant: (kind) => (kind === 'services' ? plan.altServices : plan.variants[kind]) };
    const keys = item.page === 'Home' ? homeSections(plan, content) : item.utility ? ['pageHero', 'utility'] : innerSections(item.page, content);
    const body = keys.map((key) => {
      switch (key) {
        case 'hero': return S.hero(ctx);
        case 'proof': return S.proof(ctx);
        case 'services': return S.services(ctx);
        case 'servicesAlt': return S.services(altCtx, { title: item.data.h1 === item.page ? S.servicesHeading(brief) : `${item.page} at ${brief.business_name}` });
        case 'about': return S.about(ctx);
        case 'band': return S.parallaxBand(ctx);
        case 'process': return S.processSection(ctx);
        case 'team': return S.team(ctx);
        case 'pricing': return S.pricing(ctx);
        case 'gallery': return S.gallery(ctx);
        case 'testimonials': return S.testimonials(ctx);
        case 'faq': return S.faq(ctx);
        case 'cta': return S.cta(ctx);
        case 'contact': return S.contact(ctx);
        case 'pageHero': return S.pageHero(ctx);
        case 'pageSections': return S.pageSections(ctx);
        case 'utility': return S.utilityBody(ctx, item.utility);
        default: return '';
      }
    }).join('\n');
    const overlayHero = item.page === 'Home' && plan.variants.hero === 'fullbleed';
    html[item.slug] = document({ ctx, plan, brief, head: headFor(item), body, overlayHero, isHome: item.page === 'Home' });
  });

  return {
    html,
    css: buildCss({ direction: plan.direction, directionId: plan.directionId, palette: plan.palette }),
    js: buildRuntime({ motion: plan.direction.motion })
  };
}

function document({ ctx, plan, brief, head, body, overlayHero, isHome }) {
  const d = plan.direction;
  const navCount = ctx.navLinks.length;
  const navChars = ctx.navLinks.reduce((sum, link) => sum + link.label.length, 0);
  const navMode = navCount > 7 || navChars > 70 ? 'nav-overlay' : navCount > 5 || navChars > 48 ? 'nav-dense' : '';
  const classes = [overlayHero ? 'has-overlay-hero' : '', d.motion.grain ? 'grain' : '', navMode].filter(Boolean).join(' ');
  return `<!doctype html>
<html lang="en-GB" data-theme="${plan.palette.defaultMode}" data-direction="${plan.directionId}"${classes ? ` class="${classes}"` : ''}>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
${head}
<meta name="theme-color" content="${oklchCss(plan.palette[plan.palette.defaultMode].primary)}">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?${d.fonts.query}&display=swap">
<link rel="stylesheet" href="assets/css/styles.css">
</head>
<body id="top">
<a class="skip-link" href="#main-content">Skip to content</a>
${d.motion.preloader && isHome ? `<div class="preloader" aria-hidden="true"><span><i>${S.esc(brief.business_name)}</i></span></div>` : ''}
<div class="scroll-progress" aria-hidden="true"></div>
${S.header(ctx)}
<main id="main-content">
${body}
</main>
${S.footer(ctx)}
<script src="https://code.jquery.com/jquery-3.7.1.min.js" integrity="sha256-/JqT3SQfawRcv/BIHPThkBvs0OEvtFFmqPF/lYI/Cxo=" crossorigin="anonymous"></script>
<script src="assets/js/app.js" defer></script>
</body>
</html>`;
}

export { DIRECTIONS };
