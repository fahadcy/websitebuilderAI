// Section library for the studio engine. Every section type has several layout
// variants; the layout planner picks variants per design direction and seed.
// Markup is static (editor-safe); all motion is attached by the runtime script.

export const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

const ICONS = {
  spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
  shield: '<path d="M12 3 5 6v6c0 4.5 3 7.5 7 9 4-1.5 7-4.5 7-9V6l-7-3Z"/><path d="m9 12 2 2 4-4"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  leaf: '<path d="M5 19c0-8 5-13 14-14-1 9-6 14-14 14Z"/><path d="M5 19 13 11"/>',
  star: '<path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9 6.8 19.6l1-5.8L3.5 9.7l5.9-.9L12 3.5Z"/>',
  chat: '<path d="M5 5h14v10H9l-4 4V5Z"/>',
  calendar: '<rect x="4" y="5.5" width="16" height="14" rx="2"/><path d="M4 10h16M9 3.5v4M15 3.5v4"/>',
  check: '<circle cx="12" cy="12" r="8.5"/><path d="m8.5 12 2.5 2.5 4.5-5"/>',
  pin: '<path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  bolt: '<path d="M13 3 5 13.5h6L10 21l9-11h-6l0-7Z"/>',
  smile: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14c1 1.4 2.2 2 3.5 2s2.5-.6 3.5-2M9 9.5h.01M15 9.5h.01"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.5a11 11 0 0 0 6 6l1.5-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2Z"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="2"/><path d="m4 7 8 6 8-6"/>'
};
const ICON_ORDER = ['spark', 'shield', 'heart', 'clock', 'leaf', 'star', 'chat', 'calendar', 'check', 'bolt', 'smile', 'pin'];

export function icon(name, cls = 'ico') {
  return `<svg class="${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name] || ICONS.spark}</svg>`;
}

function iconFor(text, index) {
  const t = String(text).toLowerCase();
  const map = [
    [/emergenc|urgent|fast|same.day|24\/7|callout/, 'bolt'], [/time|hour|evening|late|weekend|schedule/, 'clock'], [/safe|secure|insur|guarantee|accredit|regist|cqc|gdc/, 'shield'],
    [/care|gentle|nervous|comfort|love|family|child/, 'heart'], [/natural|organic|fresh|local|sourdough|plant/, 'leaf'], [/review|rating|award|star|best/, 'star'],
    [/consult|advice|talk|chat|support/, 'chat'], [/book|appoint|reserv|calendar|plan/, 'calendar'], [/smile|whiten|cosmetic|happy/, 'smile'], [/location|area|cover|visit|map/, 'pin']
  ];
  const found = map.find(([pattern]) => pattern.test(t));
  return found ? found[1] : ICON_ORDER[index % ICON_ORDER.length];
}

const tel = (phone) => String(phone || '').replace(/[^\d+]/g, '');
const words = (text, max) => String(text || '').split(/\s+/).slice(0, max).join(' ');

function button(ctx, label, href, variant = 'primary', extra = '') {
  return `<a class="btn btn-${variant}" href="${href}" data-magnetic${extra}><span>${esc(label)}</span>${icon('arrow', 'btn-ico')}</a>`;
}

function contactHref(ctx) {
  if (ctx.onePage) return ctx.isHome ? '#contact' : 'index.html#contact';
  return ctx.contactPage || 'contact.html';
}

function servicesHref(ctx) {
  if (ctx.onePage) return ctx.isHome ? '#services' : 'index.html#services';
  return ctx.servicesPage || contactHref(ctx);
}

function heading(tag, text, cls = '', attrs = '') {
  return `<${tag} class="${cls}"${attrs}>${esc(text)}</${tag}>`;
}

function kicker(text) {
  return text ? `<p class="kicker">${esc(text)}</p>` : '';
}

function image(ctx, purpose, alt, cls = '', attrs = '') {
  return `<img class="${cls}" src="${esc(ctx.img(purpose))}" alt="${esc(alt)}" loading="lazy" decoding="async"${attrs}>`;
}

// ---------------------------------------------------------------------------
// Header & footer
// ---------------------------------------------------------------------------

export function header(ctx) {
  const { brief } = ctx;
  const links = ctx.navLinks.map((link) => `<a href="${link.href}"${link.current ? ' aria-current="page"' : ''}>${esc(link.label)}</a>`).join('');
  const brandInner = ctx.logo ? `<img class="brand-logo" src="${esc(ctx.logo)}" alt="${esc(brief.business_name)} logo">` : `<span class="brand-mark" aria-hidden="true">${esc(monogram(brief.business_name))}</span><span class="brand-name">${esc(brief.business_name)}</span>`;
  return `<header class="site-header" data-header>
  <div class="header-inner">
    <a class="brand" href="${ctx.onePage && ctx.isHome ? '#top' : 'index.html'}" aria-label="${esc(brief.business_name)} home">${brandInner}</a>
    <nav class="site-nav" id="site-nav" aria-label="Primary navigation">${links}</nav>
    <div class="header-actions">
      <button class="theme-toggle" type="button" data-theme-toggle aria-label="Switch colour theme">${icon('spark')}</button>
      <a class="btn btn-primary btn-sm header-cta" href="${contactHref(ctx)}" data-magnetic><span>${esc(ctx.content.home.primaryCta)}</span></a>
      <button class="menu-toggle" type="button" aria-expanded="false" aria-controls="mobile-menu" data-menu-toggle><span></span><span></span><span class="sr-only">Menu</span></button>
    </div>
  </div>
</header>
<div class="mobile-menu" id="mobile-menu" data-mobile-menu hidden>
  <nav aria-label="Mobile navigation">${ctx.navLinks.map((link, index) => `<a href="${link.href}" style="--i:${index}">${esc(link.label)}</a>`).join('')}</nav>
  <div class="mobile-menu-foot">${brief.contact_phone ? `<a href="tel:${tel(brief.contact_phone)}">${esc(brief.contact_phone)}</a>` : ''}<a href="mailto:${esc(brief.contact_email)}">${esc(brief.contact_email)}</a></div>
</div>`;
}

export function monogram(name) {
  return String(name || '').replace(/^the\s+/i, '').split(/\s+/).filter((part) => /^[A-Za-z0-9]/.test(part)).slice(0, 2).map((part) => part[0].toUpperCase()).join('') || 'S';
}

export function footer(ctx) {
  const { brief, content } = ctx;
  const year = new Date().getFullYear();
  const keywords = (content.seoKeywords || []).slice(0, 4).map((keyword) => esc(keyword)).join(', ');
  const nav = ctx.navLinks.map((link) => `<a href="${link.href}">${esc(link.label)}</a>`).join('');
  const contactBits = [
    brief.address ? `<p>${esc(brief.address)}</p>` : '',
    brief.contact_phone ? `<p><a href="tel:${tel(brief.contact_phone)}">${esc(brief.contact_phone)}</a></p>` : '',
    `<p><a href="mailto:${esc(brief.contact_email)}">${esc(brief.contact_email)}</a></p>`,
    brief.hours ? `<p class="muted">${esc(brief.hours)}</p>` : ''
  ].join('');
  const wordmark = ctx.variant('footer') === 'wordmark';
  return `<footer class="site-footer${wordmark ? ' footer-wordmark' : ''}">
  <div class="container footer-grid">
    <div class="footer-brand">
      <p class="footer-title">${esc(brief.business_name)}</p>
      <p class="muted">${esc(content.home.subheadline)}</p>
      ${button(ctx, content.home.primaryCta, contactHref(ctx), 'primary')}
    </div>
    <div><p class="footer-label">Visit or call</p>${contactBits}</div>
    <div><p class="footer-label">Explore</p><nav class="footer-nav" aria-label="Footer navigation">${nav}<a href="privacy.html">Privacy policy</a></nav></div>
  </div>
  ${wordmark ? `<div class="footer-giant" aria-hidden="true" data-parallax="0.08"><span>${esc(brief.business_name)}</span></div>` : ''}
  <div class="container footer-base"><p>© ${year} ${esc(brief.business_name)}. All rights reserved.</p>${keywords ? `<p class="muted">${keywords}</p>` : ''}<a href="#top" class="to-top" data-to-top>Back to top</a></div>
</footer>`;
}

// ---------------------------------------------------------------------------
// Heroes
// ---------------------------------------------------------------------------

function heroCopy(ctx, { align = '' } = {}) {
  const { content, brief } = ctx;
  const home = content.home;
  return `<div class="hero-copy ${align}">
      ${kicker(home.eyebrow)}
      <h1 class="display" data-split>${esc(home.h1)}</h1>
      <p class="lede" data-reveal="up" style="--d:.25s">${esc(home.subheadline)}</p>
      <div class="hero-actions" data-reveal="up" style="--d:.38s">${button(ctx, home.primaryCta, contactHref(ctx), 'primary')}${button(ctx, home.secondaryCta, servicesHref(ctx), 'ghost')}</div>
      ${brief.contact_phone ? `<p class="hero-call" data-reveal="up" style="--d:.5s">${icon('phone', 'ico-sm')} <a href="tel:${tel(brief.contact_phone)}">${esc(brief.contact_phone)}</a></p>` : ''}
    </div>`;
}

function chips(ctx, cls = 'hero-chips') {
  const items = (ctx.content.home.trustSignals || []).slice(0, 3);
  if (!items.length) return '';
  return `<div class="${cls}">${items.map((item, index) => `<div class="chip" data-float style="--i:${index}"><strong>${esc(item.value)}</strong><span>${esc(item.label)}</span></div>`).join('')}</div>`;
}

const HEROES = {
  split(ctx) {
    return `<section class="hero hero-split">
  ${ctx.motion.blobs ? '<div class="blob blob-a" aria-hidden="true" data-parallax="-0.15"></div><div class="blob blob-b" aria-hidden="true" data-parallax="0.1"></div>' : ''}
  <div class="container hero-grid">
    ${heroCopy(ctx)}
    <figure class="hero-media" data-reveal="clip">
      <div class="media-frame" data-tilt>${image(ctx, 'hero', `${ctx.brief.business_name}, ${ctx.brief.industry}`, 'cover', ' fetchpriority="high"')}</div>
      ${chips(ctx)}
    </figure>
  </div>
</section>`;
  },
  fullbleed(ctx) {
    return `<section class="hero hero-fullbleed">
  <div class="hero-bg" aria-hidden="true"><div class="hero-bg-inner" data-parallax="0.35">${image(ctx, 'hero', '', 'cover', ' fetchpriority="high"')}</div></div>
  <div class="hero-scrim" aria-hidden="true"></div>
  <div class="container hero-fullbleed-inner">
    ${heroCopy(ctx)}
  </div>
  <a class="scroll-cue" href="#main-content" aria-label="Scroll to content"><span></span></a>
</section>`;
  },
  kinetic(ctx) {
    const items = (ctx.content.marquee || ctx.content.home.services.map((service) => service.title)).slice(0, 8);
    return `<section class="hero hero-kinetic">
  <div class="container">
    ${kicker(ctx.content.home.eyebrow)}
    <h1 class="display display-xl" data-split>${esc(ctx.content.home.h1)}</h1>
    <div class="kinetic-row">
      <p class="lede" data-reveal="up" style="--d:.3s">${esc(ctx.content.home.subheadline)}</p>
      <div class="hero-actions" data-reveal="up" style="--d:.4s">${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary')}${button(ctx, ctx.content.home.secondaryCta, servicesHref(ctx), 'ghost')}</div>
    </div>
  </div>
  <div class="kinetic-media" data-reveal="clip">
    <div class="kinetic-img" data-parallax="0.12">${image(ctx, 'hero', `${ctx.brief.business_name} at work`, 'cover', ' fetchpriority="high"')}</div>
  </div>
  ${marqueeStrip(items, 'marquee-hero')}
</section>`;
  },
  editorial(ctx) {
    return `<section class="hero hero-editorial">
  <div class="container">
    <div class="editorial-top">
      ${kicker(ctx.content.home.eyebrow)}
      <p class="editorial-meta" data-reveal="up">${esc([ctx.brief.location, ctx.brief.industry].filter(Boolean).join(', '))}</p>
    </div>
    <h1 class="display display-xl" data-split>${esc(ctx.content.home.h1)}</h1>
  </div>
  <figure class="editorial-figure" data-reveal="clip">
    <div class="editorial-img" data-parallax="0.18">${image(ctx, 'hero', `${ctx.brief.business_name}`, 'cover', ' fetchpriority="high"')}</div>
  </figure>
  <div class="container editorial-foot">
    <p class="lede" data-reveal="up">${esc(ctx.content.home.subheadline)}</p>
    <div class="hero-actions" data-reveal="up" style="--d:.15s">${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary')}${button(ctx, ctx.content.home.secondaryCta, servicesHref(ctx), 'ghost')}</div>
  </div>
</section>`;
  },
  collage(ctx) {
    return `<section class="hero hero-collage">
  ${ctx.motion.blobs ? '<div class="blob blob-a" aria-hidden="true" data-parallax="-0.12"></div>' : ''}
  <div class="container hero-grid">
    ${heroCopy(ctx)}
    <div class="collage" aria-hidden="false">
      <figure class="collage-a" data-reveal="clip" data-parallax="-0.06">${image(ctx, 'hero', `${ctx.brief.business_name}`, 'cover', ' fetchpriority="high"')}</figure>
      <figure class="collage-b" data-reveal="clip" style="--d:.15s" data-parallax="0.1">${image(ctx, 'detail', `Detail from ${ctx.brief.business_name}`, 'cover')}</figure>
      <figure class="collage-c" data-reveal="clip" style="--d:.3s" data-parallax="0.2">${image(ctx, 'service', `${ctx.brief.industry} service`, 'cover')}</figure>
      ${chips(ctx, 'hero-chips collage-chips')}
    </div>
  </div>
</section>`;
  },
  aurora(ctx) {
    const stats = (ctx.content.home.trustSignals || []).slice(0, 3);
    return `<section class="hero hero-aurora">
  <div class="aurora" aria-hidden="true"><span></span><span></span><span></span></div>
  <div class="grid-lines" aria-hidden="true"></div>
  <div class="container hero-aurora-inner">
    ${kicker(ctx.content.home.eyebrow)}
    <h1 class="display display-xl" data-split>${esc(ctx.content.home.h1)}</h1>
    <p class="lede" data-reveal="up" style="--d:.3s">${esc(ctx.content.home.subheadline)}</p>
    <div class="hero-actions center" data-reveal="up" style="--d:.4s">${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary')}${button(ctx, ctx.content.home.secondaryCta, servicesHref(ctx), 'ghost')}</div>
    <div class="glass-panel" data-reveal="up" data-tilt style="--d:.55s">
      <div class="glass-media">${image(ctx, 'hero', `${ctx.brief.business_name} product`, 'cover', ' fetchpriority="high"')}</div>
      ${stats.length ? `<div class="glass-stats">${stats.map((stat) => `<div>${counter(stat.value)}<span>${esc(stat.label)}</span></div>`).join('')}</div>` : ''}
    </div>
  </div>
</section>`;
  }
};

export function hero(ctx) {
  return HEROES[ctx.variant('hero')](ctx);
}

/** Turn "4.9★", "300+", "15+ yrs" into an animated counter; text stays as-is otherwise. */
export function counter(value) {
  const match = String(value).match(/^(\D*?)(\d+(?:[.,]\d+)?)(.*)$/);
  if (!match) return `<strong>${esc(value)}</strong>`;
  const number = match[2].replace(',', '');
  const decimals = (number.split('.')[1] || '').length;
  return `<strong><span>${esc(match[1])}</span><span data-count="${esc(number)}" data-decimals="${decimals}">${esc(match[2])}</span><span>${esc(match[3])}</span></strong>`;
}

export function marqueeStrip(items, cls = '') {
  const list = (items || []).filter(Boolean);
  if (!list.length) return '';
  const row = list.map((item) => `<span>${esc(item)}</span><i aria-hidden="true">✦</i>`).join('');
  return `<div class="marquee ${cls}"><p class="sr-only">${esc(list.join(', '))}</p><div class="marquee-track" aria-hidden="true"><div>${row}</div><div>${row}</div></div><button class="marquee-toggle" type="button" data-marquee-toggle aria-pressed="false" aria-label="Pause scrolling text"><span aria-hidden="true"></span></button></div>`;
}

// ---------------------------------------------------------------------------
// Proof
// ---------------------------------------------------------------------------

export function proof(ctx) {
  const items = (ctx.content.home.trustSignals || []).slice(0, 4);
  if (!items.length) return '';
  return `<section class="proof" aria-label="Why people choose ${esc(ctx.brief.business_name)}">
  <div class="container proof-grid" data-stagger>
    ${items.map((item, index) => `<div class="proof-item" data-reveal="up" style="--d:${index * 0.08}s">${counter(item.value)}<span>${esc(item.label)}</span></div>`).join('')}
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// Services
// ---------------------------------------------------------------------------

function sectionHead(ctx, label, title, intro = '', cls = '') {
  return `<div class="section-head ${cls}">
    ${kicker(label)}
    <h2 class="h2" data-split>${esc(title)}</h2>
    ${intro ? `<p class="section-intro" data-reveal="up">${esc(intro)}</p>` : ''}
  </div>`;
}

const SERVICES = {
  bento(ctx, services) {
    return `<div class="bento">${services.slice(0, 6).map((service, index) => `<article class="bento-item bento-${index}${index === 0 ? ' bento-feature' : ''}" data-reveal="up" style="--d:${(index % 3) * 0.08}s" data-tilt>
      ${index === 0 ? `<div class="bento-img">${image(ctx, 'service', service.title, 'cover')}</div>` : ''}
      <div class="bento-body">${icon(iconFor(service.title + service.description, index))}<h3>${esc(service.title)}</h3><p>${esc(service.description)}</p>${service.price ? `<p class="price">${esc(service.price)}</p>` : ''}</div>
    </article>`).join('')}</div>`;
  },
  cards(ctx, services) {
    return `<div class="card-row">${services.slice(0, 8).map((service, index) => `<article class="svc-card" data-reveal="up" style="--d:${(index % 4) * 0.07}s" data-tilt>
      <span class="svc-icon">${icon(iconFor(service.title + service.description, index))}</span>
      <h3>${esc(service.title)}</h3><p>${esc(service.description)}</p>
      ${service.price ? `<p class="price">${esc(service.price)}</p>` : ''}
    </article>`).join('')}</div>`;
  },
  hoverList(ctx, services) {
    return `<div class="hover-list" data-hover-list>${services.slice(0, 8).map((service, index) => `<a class="hover-row" href="${contactHref(ctx)}" data-reveal="up" style="--d:${index * 0.05}s">
      <span class="hover-title">${esc(service.title)}</span>
      <span class="hover-desc">${esc(service.description)}</span>
      <span class="hover-meta">${service.price ? esc(service.price) : icon('arrow', 'ico-sm')}</span>
    </a>`).join('')}<div class="hover-preview" aria-hidden="true">${image(ctx, 'service', '', 'cover')}</div></div>`;
  },
  tabs(ctx, services) {
    const list = services.slice(0, 6);
    return `<div class="tabs" data-tabs>
      <div class="tab-list" role="tablist">${list.map((service, index) => `<button type="button" role="tab" id="tab-${index}" aria-controls="panel-${index}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}">${esc(service.title)}</button>`).join('')}</div>
      <div class="tab-panels">${list.map((service, index) => `<div class="tab-panel" role="tabpanel" id="panel-${index}" aria-labelledby="tab-${index}"${index ? ' hidden' : ''}>
        <div class="tab-media">${image(ctx, index % 2 ? 'detail' : 'service', service.title, 'cover')}</div>
        <div class="tab-copy">${icon(iconFor(service.title, index))}<h3>${esc(service.title)}</h3><p>${esc(service.description)}</p>${service.price ? `<p class="price">${esc(service.price)}</p>` : ''}${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary')}</div>
      </div>`).join('')}</div>
    </div>`;
  },
  marqueeCards(ctx, services) {
    return `<div class="carousel" data-carousel>
      <div class="carousel-track" tabindex="0" aria-label="Services">${services.slice(0, 8).map((service, index) => `<article class="carousel-card" style="--i:${index}">
        <span class="carousel-num" aria-hidden="true">${icon(iconFor(service.title, index))}</span>
        <h3>${esc(service.title)}</h3><p>${esc(service.description)}</p>${service.price ? `<p class="price">${esc(service.price)}</p>` : ''}
      </article>`).join('')}</div>
      <div class="carousel-nav"><button type="button" data-carousel-prev aria-label="Previous">${icon('arrow', 'ico-flip')}</button><button type="button" data-carousel-next aria-label="Next">${icon('arrow')}</button></div>
    </div>`;
  }
};

export function services(ctx, { title, intro } = {}) {
  const list = ctx.content.home.services || [];
  if (!list.length) return '';
  const variant = ctx.variant('services');
  return `<section class="section services services-${variant}" id="services">
  <div class="container">
    ${sectionHead(ctx, servicesLabel(ctx.brief), title || servicesHeading(ctx.brief), intro || '')}
    ${SERVICES[variant](ctx, list)}
  </div>
</section>`;
}

export function servicesLabel(brief) {
  return { care: 'Treatments', hospitality: 'What we make', commerce: 'The collection', fitness: 'Ways to train', portfolio: 'What we do', software: 'Features', property: 'Services', event: 'Programme', education: 'Courses', trades: 'Services', civic: 'How we help' }[brief.project_nature] || 'Services';
}

export function servicesHeading(brief) {
  const place = brief.location ? ` in ${brief.location.split(',')[0]}` : '';
  return { care: /dental/i.test(brief.industry) ? `Everything you need for a healthy smile${place}` : `Care and treatments${place}`, hospitality: `Made fresh${place}`, commerce: 'Pieces worth keeping', fitness: 'Find the way you like to train', portfolio: 'How we can work together', software: 'Built for the way your team works', property: `Property services${place}`, event: 'What to expect on the day', education: 'Learning that fits around you', trades: `Work done properly${place}`, civic: 'Support for our community' }[brief.project_nature] || `How ${brief.business_name} can help`;
}

// ---------------------------------------------------------------------------
// About / statement
// ---------------------------------------------------------------------------

const ABOUT = {
  splitParallax(ctx) {
    const benefits = (ctx.content.benefits || []).slice(0, 3);
    return `<section class="section about about-split" id="about">
  <div class="container about-grid">
    <figure class="about-media" data-reveal="clip">
      <div class="about-img" data-parallax="0.12">${image(ctx, 'about', `Inside ${ctx.brief.business_name}`, 'cover')}</div>
      <figcaption class="about-badge" data-float>${icon('star', 'ico-sm')} ${esc(ctx.content.home.trustSignals?.[0] ? `${ctx.content.home.trustSignals[0].value} ${ctx.content.home.trustSignals[0].label}` : ctx.brief.industry)}</figcaption>
    </figure>
    <div class="about-copy">
      ${kicker('About us')}
      <h2 class="h2" data-split>${esc(ctx.content.about.heading)}</h2>
      <p data-reveal="up">${esc(ctx.content.about.body)}</p>
      ${benefits.length ? `<ul class="benefit-list">${benefits.map((item, index) => `<li data-reveal="up" style="--d:${index * 0.08}s">${icon(iconFor(item.title, index))}<div><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></div></li>`).join('')}</ul>` : ''}
    </div>
  </div>
</section>`;
  },
  statement(ctx) {
    const benefits = (ctx.content.benefits || []).slice(0, 3);
    return `<section class="section about about-statement" id="about">
  <div class="container">
    ${kicker('About us')}
    <p class="statement" data-scroll-words>${esc(ctx.content.statement || ctx.content.about.body)}</p>
    <div class="statement-foot">
      <figure class="statement-img" data-reveal="clip"><div data-parallax="0.1">${image(ctx, 'about', `Inside ${ctx.brief.business_name}`, 'cover')}</div></figure>
      <div class="statement-copy"><h2 class="h3">${esc(ctx.content.about.heading)}</h2><p data-reveal="up">${esc(ctx.content.about.body)}</p></div>
    </div>
    ${benefits.length ? `<div class="benefit-row">${benefits.map((item, index) => `<div class="benefit" data-reveal="up" style="--d:${index * 0.08}s">${icon(iconFor(item.title, index))}<h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></div>`).join('')}</div>` : ''}
  </div>
</section>`;
  }
};

export function about(ctx) {
  return ABOUT[ctx.variant('about')](ctx);
}

// ---------------------------------------------------------------------------
// Parallax band, process, team, pricing, gallery, testimonials, FAQ
// ---------------------------------------------------------------------------

export function parallaxBand(ctx) {
  const text = ctx.content.statement || ctx.content.finalCta.heading;
  return `<section class="band" aria-label="${esc(words(text, 8))}">
  <div class="band-bg" aria-hidden="true"><div data-parallax="0.3">${image(ctx, 'band', '', 'cover')}</div></div>
  <div class="band-scrim" aria-hidden="true"></div>
  <div class="container band-inner">
    <p class="band-quote" data-split>${esc(text)}</p>
    ${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'light')}
  </div>
</section>`;
}

export function processSection(ctx) {
  const steps = (ctx.content.process || []).slice(0, 5);
  if (!steps.length) return '';
  const variant = ctx.variant('process');
  if (variant === 'timeline') {
    return `<section class="section process process-timeline">
  <div class="container process-grid">
    <div class="process-sticky">${sectionHead(ctx, 'How it works', 'Simple from the very first step')}</div>
    <ol class="timeline" data-timeline><span class="timeline-fill" aria-hidden="true"></span>${steps.map((step, index) => `<li data-reveal="left" style="--d:${index * 0.05}s"><span class="step-dot">${index + 1}</span><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></li>`).join('')}</ol>
  </div>
</section>`;
  }
  return `<section class="section process process-steps">
  <div class="container">
    ${sectionHead(ctx, 'How it works', 'Simple from the very first step')}
    <ol class="steps" data-stagger>${steps.map((step, index) => `<li data-reveal="up" style="--d:${index * 0.1}s"><span class="step-num">${index + 1}</span><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></li>`).join('')}</ol>
  </div>
</section>`;
}

export function team(ctx) {
  const people = ctx.content.team || [];
  if (!people.length) return '';
  return `<section class="section team" id="team">
  <div class="container">
    ${sectionHead(ctx, 'Our team', 'The people you will meet')}
    <div class="team-grid">${people.map((person, index) => `<article class="person" data-reveal="up" style="--d:${(index % 4) * 0.08}s" data-tilt>
      <div class="person-avatar" aria-hidden="true" style="--h:${(index * 47) % 360}"><span>${esc(monogram(person.name))}</span></div>
      <h3>${esc(person.name)}</h3>${person.role ? `<p class="role">${esc(person.role)}</p>` : ''}${person.bio ? `<p>${esc(person.bio)}</p>` : ''}
    </article>`).join('')}</div>
  </div>
</section>`;
}

export function pricing(ctx) {
  const items = ctx.content.pricing || [];
  if (!items.length) return '';
  return `<section class="section pricing" id="pricing">
  <div class="container pricing-grid">
    <div>${sectionHead(ctx, 'Prices', 'Clear prices, agreed before we start', 'No surprises. Your costs are explained and confirmed before anything begins.')}${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary')}</div>
    <dl class="price-list">${items.map((item, index) => `<div class="price-row" data-reveal="up" style="--d:${index * 0.05}s"><dt>${esc(item.name)}${item.description ? `<small>${esc(item.description)}</small>` : ''}</dt><dd>${esc(item.price)}</dd></div>`).join('')}</dl>
  </div>
</section>`;
}

export function gallery(ctx) {
  if (!ctx.content.gallery) return '';
  const care = ctx.brief.project_nature === 'care';
  const labels = care ? ['Smile makeover', 'Whitening', 'Bonding'] : ['Recent work', 'In progress', 'Finished result'];
  if (care) {
    return `<section class="section gallery" id="gallery">
  <div class="container">
    ${sectionHead(ctx, 'Before and after', 'Real results, shared with permission', 'Drag the handle to compare. Replace these placeholders with your own patient photos (with written consent).')}
    <div class="ba-grid">${labels.map((label, index) => `<figure class="ba" data-reveal="up" style="--d:${index * 0.1}s"><div class="ba-frame" data-compare>
      <div class="ba-before">${image(ctx, index % 2 ? 'detail' : 'about', `${label} before`, 'cover ba-dim')}</div>
      <div class="ba-after">${image(ctx, index % 2 ? 'detail' : 'about', `${label} after`, 'cover')}</div>
      <input class="ba-range" type="range" min="0" max="100" value="50" aria-label="Compare before and after for ${esc(label)}">
      <span class="ba-handle" aria-hidden="true"></span><span class="ba-tag ba-tag-l">Before</span><span class="ba-tag ba-tag-r">After</span>
    </div><figcaption>${esc(label)}</figcaption></figure>`).join('')}</div>
  </div>
</section>`;
  }
  const shots = ['hero', 'detail', 'service', 'about', 'band'];
  return `<section class="section gallery" id="gallery">
  <div class="container">
    ${sectionHead(ctx, 'Gallery', 'A closer look')}
    <div class="masonry">${shots.map((shot, index) => `<a class="masonry-item" href="${esc(ctx.img(shot))}" data-lightbox data-reveal="up" style="--d:${index * 0.06}s">${image(ctx, shot, `${ctx.brief.business_name} gallery image ${index + 1}`, 'cover')}</a>`).join('')}</div>
  </div>
</section>`;
}

export function testimonials(ctx) {
  const items = ctx.content.testimonials || [];
  if (!items.length) return '';
  return `<section class="section quotes">
  <div class="container">
    ${sectionHead(ctx, 'Reviews', 'What people say')}
    <div class="quote-slider" data-slider>${items.map((item, index) => `<blockquote class="quote${index ? '' : ' is-active'}"><p>${esc(item.quote)}</p>${item.name ? `<cite>${esc(item.name)}</cite>` : ''}</blockquote>`).join('')}
      ${items.length > 1 ? `<div class="slider-dots">${items.map((_, index) => `<button type="button" data-dot aria-label="Show review ${index + 1}"${index ? '' : ' aria-current="true"'}></button>`).join('')}<button type="button" class="slider-pause" data-slider-pause aria-pressed="false">Pause</button></div>` : ''}
    </div>
  </div>
</section>`;
}

export function faq(ctx) {
  const items = ctx.content.faqs || [];
  if (!items.length) return '';
  return `<section class="section faq" id="faq">
  <div class="container faq-grid">
    <div>${sectionHead(ctx, 'Questions', 'Things people often ask')}<p class="muted" data-reveal="up">Can’t see your question? ${ctx.brief.contact_phone ? `Call <a href="tel:${tel(ctx.brief.contact_phone)}">${esc(ctx.brief.contact_phone)}</a> or ` : ''}<a href="${contactHref(ctx)}">send us a message</a>.</p></div>
    <div class="accordion" data-accordion>${items.map((item, index) => `<div class="acc-item" data-reveal="up" style="--d:${index * 0.05}s">
      <button type="button" class="acc-q" aria-expanded="false" aria-controls="faq-${index}" id="faq-q-${index}"><span>${esc(item.q)}</span>${icon('plus', 'acc-ico')}</button>
      <div class="acc-a" id="faq-${index}" role="region" aria-labelledby="faq-q-${index}" hidden><p>${esc(item.a)}</p></div>
    </div>`).join('')}</div>
  </div>
</section>`;
}

// ---------------------------------------------------------------------------
// Calls to action & contact
// ---------------------------------------------------------------------------

const CTAS = {
  bigType(ctx) {
    return `<section class="cta cta-bigtype">
  <div class="container">
    <h2 class="display display-xl" data-split>${esc(ctx.content.finalCta.heading)}</h2>
    <div class="cta-row"><p class="lede" data-reveal="up">${esc(ctx.content.finalCta.text)}</p>${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary', ' data-reveal="up"')}</div>
  </div>
</section>`;
  },
  imageBand(ctx) {
    return `<section class="cta cta-image">
  <div class="cta-image-bg" aria-hidden="true"><div data-parallax="0.25">${image(ctx, 'band', '', 'cover')}</div></div>
  <div class="band-scrim" aria-hidden="true"></div>
  <div class="container cta-image-inner">
    <h2 class="display" data-split>${esc(ctx.content.finalCta.heading)}</h2>
    <p class="lede" data-reveal="up">${esc(ctx.content.finalCta.text)}</p>
    <div class="hero-actions" data-reveal="up">${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'light')}${ctx.brief.contact_phone ? `<a class="btn btn-outline-light" href="tel:${tel(ctx.brief.contact_phone)}"><span>${esc(ctx.brief.contact_phone)}</span></a>` : ''}</div>
  </div>
</section>`;
  },
  softPanel(ctx) {
    return `<section class="cta cta-soft">
  <div class="container"><div class="soft-panel" data-reveal="scale">
    ${ctx.motion.blobs ? '<div class="blob blob-c" aria-hidden="true"></div>' : ''}
    <h2 class="h2" data-split>${esc(ctx.content.finalCta.heading)}</h2>
    <p class="lede">${esc(ctx.content.finalCta.text)}</p>
    <div class="hero-actions center">${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary')}${ctx.brief.contact_phone ? `<a class="btn btn-ghost" href="tel:${tel(ctx.brief.contact_phone)}"><span>${esc(ctx.brief.contact_phone)}</span></a>` : ''}</div>
  </div></div>
</section>`;
  },
  auroraPanel(ctx) {
    return `<section class="cta cta-aurora">
  <div class="aurora aurora-soft" aria-hidden="true"><span></span><span></span></div>
  <div class="container center-stack">
    <h2 class="display" data-split>${esc(ctx.content.finalCta.heading)}</h2>
    <p class="lede" data-reveal="up">${esc(ctx.content.finalCta.text)}</p>
    <div class="hero-actions center" data-reveal="up">${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary')}</div>
  </div>
</section>`;
  },
  marqueeCta(ctx) {
    return `<section class="cta cta-marquee">
  ${marqueeStrip(Array(4).fill(ctx.content.finalCta.heading), 'marquee-giant')}
  <div class="container center-stack">
    <p class="lede" data-reveal="up">${esc(ctx.content.finalCta.text)}</p>
    ${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary', ' data-reveal="up"')}
  </div>
</section>`;
  }
};

export function cta(ctx) {
  return CTAS[ctx.variant('cta')](ctx);
}

export function contact(ctx) {
  const { brief, content } = ctx;
  const mapQuery = encodeURIComponent([brief.business_name, brief.address || brief.location].filter(Boolean).join(', '));
  const details = [
    brief.address ? `<li>${icon('pin')}<div><strong>Address</strong><span>${esc(brief.address)}</span></div></li>` : '',
    brief.contact_phone ? `<li>${icon('phone')}<div><strong>Phone</strong><a href="tel:${tel(brief.contact_phone)}">${esc(brief.contact_phone)}</a></div></li>` : '',
    `<li>${icon('mail')}<div><strong>Email</strong><a href="mailto:${esc(brief.contact_email)}">${esc(brief.contact_email)}</a></div></li>`,
    brief.hours ? `<li>${icon('clock')}<div><strong>Opening hours</strong><span>${esc(brief.hours)}</span></div></li>` : ''
  ].join('');
  const topics = (content.home.services || []).slice(0, 6).map((service) => `<option>${esc(service.title)}</option>`).join('');
  return `<section class="section contact" id="contact">
  <div class="container contact-grid">
    <div class="contact-info">
      ${sectionHead(ctx, 'Contact', `Get in touch with ${brief.business_name}`)}
      <ul class="contact-list">${details}</ul>
    </div>
    <form class="contact-form" method="post" action="admin/contact.php" data-reveal="up" data-form>
      <input type="hidden" name="_csrf" value="">
      <input type="hidden" name="_back" value="${esc(ctx.onePage ? 'index.html' : ctx.isHome ? 'index.html' : ctx.slug || 'contact.html')}">
      <div class="hp" aria-hidden="true"><label>Leave this empty<input name="website" tabindex="-1" autocomplete="off"></label></div>
      <div class="field-row"><label>Name<input name="name" autocomplete="name" required></label><label>Phone<input name="phone" type="tel" autocomplete="tel"></label></div>
      <label>Email<input type="email" name="email" autocomplete="email" required></label>
      ${topics ? `<label>I’m interested in<select name="topic"><option value="">Choose an option</option>${topics}</select></label>` : ''}
      <label>Message<textarea name="message" rows="4" required></textarea></label>
      <button class="btn btn-primary" type="submit" data-magnetic><span>${esc(content.home.primaryCta)}</span>${icon('arrow', 'btn-ico')}</button>
      <p class="form-note muted" data-form-note role="status"></p>
    </form>
  </div>
  ${brief.address || brief.location ? `<div class="container"><div class="map-wrap" data-reveal="up"><iframe title="Map showing ${esc(brief.business_name)}" src="https://maps.google.com/maps?q=${mapQuery}&amp;output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div></div>` : ''}
</section>`;
}

// ---------------------------------------------------------------------------
// Inner pages
// ---------------------------------------------------------------------------

export function pageHero(ctx) {
  const { pageData } = ctx;
  return `<section class="page-hero">
  ${ctx.motion.aurora ? '<div class="aurora aurora-soft" aria-hidden="true"><span></span><span></span></div>' : ''}
  ${ctx.motion.blobs ? '<div class="blob blob-a" aria-hidden="true" data-parallax="-0.1"></div>' : ''}
  <div class="container page-hero-grid">
    <div>
      <nav class="crumbs" aria-label="Breadcrumb"><a href="index.html">Home</a><span aria-hidden="true">/</span><span>${esc(ctx.page)}</span></nav>
      <h1 class="display" data-split>${esc(pageData.h1)}</h1>
      ${pageData.subheadline ? `<p class="lede" data-reveal="up" style="--d:.2s">${esc(pageData.subheadline)}</p>` : ''}
      ${/^contact/i.test(ctx.page) ? '' : `<div class="hero-actions" data-reveal="up" style="--d:.3s">${button(ctx, ctx.content.home.primaryCta, contactHref(ctx), 'primary')}</div>`}
    </div>
    ${/^contact|privacy|not found/i.test(ctx.page) ? '' : `<figure class="page-hero-img" data-reveal="clip"><div data-parallax="0.12">${image(ctx, ctx.pageImage || 'detail', `${ctx.page} at ${ctx.brief.business_name}`, 'cover')}</div></figure>`}
  </div>
</section>`;
}

export function pageSections(ctx) {
  const sections = ctx.pageData.sections || [];
  if (!sections.length) return '';
  const images = ['service', 'about', 'detail', 'band'];
  return `<section class="section page-body">
  <div class="container">${sections.map((section, index) => `<article class="feature-row${index % 2 ? ' flip' : ''}">
    ${index < 2 ? `<figure class="feature-img" data-reveal="clip"><div data-parallax="0.08">${image(ctx, images[(index + ctx.pageIndex) % images.length], section.title, 'cover')}</div></figure>` : ''}
    <div class="feature-copy">
      <h2 class="h3" data-reveal="up">${esc(section.title)}</h2>
      <p data-reveal="up">${esc(section.text)}</p>
      ${section.bullets?.length ? `<ul class="ticks">${section.bullets.map((bullet, b) => `<li data-reveal="up" style="--d:${b * 0.05}s">${icon('check', 'ico-sm')}<span>${esc(bullet)}</span></li>`).join('')}</ul>` : ''}
    </div>
  </article>`).join('')}</div>
</section>`;
}

export function utilityBody(ctx, html) {
  return `<section class="section"><div class="container prose">${html}</div></section>`;
}
