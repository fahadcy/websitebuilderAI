import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import slugify from 'slugify';
import { createZip } from '../packager/zipper.js';
import { db } from '../db/database.js';
import { generateSiteImages } from '../ai/imageAssets.js';
import { runRealityCheck, realityCheckMarkdown } from '../quality/realityCheck.js';
import { recordGenerationForTraining } from '../db/mysqlTrainingStore.js';
import { generateSiteCopy, isAiTextEnabled } from '../ai/openaiClient.js';
import { parsePromptFacts, buildBriefAndContent } from './pipelineContent.js';

const root = process.cwd();

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const today = () => new Date().toISOString().slice(0, 10);

const THEME_PRESETS = {
  calm: {
    palette: 'Teal + white',
    colors: {
      lightBg: 'oklch(98% 0.014 190)',
      lightSurface: 'oklch(100% 0 0)',
      lightInk: 'oklch(20% 0.025 210)',
      lightMuted: 'oklch(48% 0.032 210)',
      lightPrimary: 'oklch(43% 0.105 190)',
      lightAccent: 'oklch(70% 0.12 172)',
      darkBg: 'oklch(18% 0.032 210)',
      darkSurface: 'oklch(23% 0.038 210)',
      darkInk: 'oklch(96% 0.012 190)',
      darkMuted: 'oklch(78% 0.024 200)'
    },
    display: 'Instrument Serif',
    body: 'Satoshi',
    density: 'spacious'
  },
  bold: {
    palette: 'Dark + electric blue',
    colors: {
      lightBg: 'oklch(97% 0.018 250)',
      lightSurface: 'oklch(100% 0 0)',
      lightInk: 'oklch(18% 0.035 260)',
      lightMuted: 'oklch(45% 0.05 260)',
      lightPrimary: 'oklch(52% 0.24 260)',
      lightAccent: 'oklch(72% 0.19 220)',
      darkBg: 'oklch(15% 0.045 260)',
      darkSurface: 'oklch(21% 0.05 260)',
      darkInk: 'oklch(96% 0.012 250)',
      darkMuted: 'oklch(77% 0.035 250)'
    },
    display: 'Geist',
    body: 'Inter',
    density: 'dense'
  },
  warm: {
    palette: 'Amber + cream',
    colors: {
      lightBg: 'oklch(97% 0.032 82)',
      lightSurface: 'oklch(100% 0.01 85)',
      lightInk: 'oklch(23% 0.035 55)',
      lightMuted: 'oklch(48% 0.035 55)',
      lightPrimary: 'oklch(56% 0.135 65)',
      lightAccent: 'oklch(75% 0.13 80)',
      darkBg: 'oklch(18% 0.028 55)',
      darkSurface: 'oklch(24% 0.032 55)',
      darkInk: 'oklch(96% 0.018 85)',
      darkMuted: 'oklch(78% 0.026 75)'
    },
    display: 'Boska',
    body: 'General Sans',
    density: 'balanced'
  },
  professional: {
    palette: 'Navy + grey',
    colors: {
      lightBg: 'oklch(97% 0.008 250)',
      lightSurface: 'oklch(100% 0 0)',
      lightInk: 'oklch(18% 0.026 250)',
      lightMuted: 'oklch(46% 0.025 250)',
      lightPrimary: 'oklch(32% 0.09 255)',
      lightAccent: 'oklch(62% 0.09 225)',
      darkBg: 'oklch(17% 0.035 255)',
      darkSurface: 'oklch(23% 0.04 255)',
      darkInk: 'oklch(96% 0.01 255)',
      darkMuted: 'oklch(78% 0.024 250)'
    },
    display: 'Zodiak',
    body: 'Work Sans',
    density: 'tight'
  },
  creative: {
    palette: 'Black + vivid accent',
    colors: {
      lightBg: 'oklch(98% 0.004 110)',
      lightSurface: 'oklch(100% 0 0)',
      lightInk: 'oklch(16% 0.018 280)',
      lightMuted: 'oklch(45% 0.028 280)',
      lightPrimary: 'oklch(58% 0.25 15)',
      lightAccent: 'oklch(78% 0.2 145)',
      darkBg: 'oklch(14% 0.018 280)',
      darkSurface: 'oklch(20% 0.022 280)',
      darkInk: 'oklch(97% 0.006 110)',
      darkMuted: 'oklch(78% 0.02 280)'
    },
    display: 'Cabinet Grotesk',
    body: 'Satoshi',
    density: 'expressive'
  }
};

export async function generatePipelineSite(prompt, progress = () => {}, metadata = {}) {
  progress({ status: 'running', progress: 8, message: 'Stage 1: parsing prompt' });
  // Classify from what the user actually wrote; the enriched prompt also carries image
  // plans and blueprint notes whose wording must not decide the industry.
  const facts = parsePromptFacts(metadata.userPrompt || prompt, metadata);

  progress({ status: 'running', progress: 15, message: isAiTextEnabled() ? 'Stage 2: writing site copy with AI' : 'Stage 2: building site copy' });
  const ai = await generateSiteCopy(prompt, facts);
  const { brief, content: draftContent } = buildBriefAndContent({ facts, ai, metadata });
  console.log(`[pipeline] ${brief.business_name} | ${brief.industry} (${brief.project_nature}) | copy: ${ai ? 'AI' : 'rule-based fallback'}`);

  progress({ status: 'running', progress: 22, message: 'Stage 3: selecting design system' });
  const design = buildDesignEngine(brief);

  progress({ status: 'running', progress: 30, message: 'Stage 4: generating content' });
  const content = buildContentEngine(brief, draftContent);

  const siteId = `${slugify(brief.business_name, { lower: true, strict: true }) || 'generated-site'}-${crypto.randomBytes(3).toString('hex')}`;
  const outDir = path.join(root, 'generated-sites', siteId);
  await prepareOutput(outDir);

  const site = {
    siteId,
    brief: snakeBriefToCamelBrief(brief, content),
    pipelineBrief: brief,
    content,
    tokens: design.tokens,
    design,
    metadata: { ...metadata, prompt },
    blueprint: {
      projectNature: brief.project_nature,
      businessType: brief.industry,
      primaryGoal: brief.goal,
      audience: brief.target_audience,
      researchBrief: researchBriefFor(brief),
      pages: brief.pages.map((title) => ({ title, slug: slugForPage(title), purpose: pagePurpose(title, brief), sections: [] }))
    },
    assetMap: {},
    generatedImages: []
  };

  progress({ status: 'running', progress: 38, message: 'Generating and placing image assets' });
  const imageResult = await generateSiteImages(site, outDir, progress);
  site.assetMap = imageResult.assetMap || {};
  site.generatedImages = imageResult.generatedImages || [];
  site.imagePlan = imageResult.imagePlan || [];

  progress({ status: 'running', progress: 50, message: 'Stage 5: assembling page architecture' });
  const architecture = buildPageArchitecture(brief, content);

  progress({ status: 'running', progress: 64, message: 'Stage 6: writing clean code' });
  const files = codeGenerator({ brief, design, content, architecture, site, domain: metadata.domainName || `${domainSlug(brief.business_name)}.co.uk` });
  await writeFiles(outDir, files);

  progress({ status: 'running', progress: 78, message: 'Stage 7: validating output' });
  const validation = await validateGeneratedSite(outDir, brief, content, files);
  if (!validation.passed) {
    const repairedFiles = repairValidationFailures(files, validation);
    await writeFiles(outDir, repairedFiles);
  }
  const finalValidation = await validateGeneratedSite(outDir, brief, content, files);
  await fs.writeFile(path.join(outDir, 'validator-report.md'), validatorMarkdown(finalValidation), 'utf8');

  const audit = await runRealityCheck(site, outDir);
  await fs.writeFile(path.join(outDir, 'reality-check-report.md'), realityCheckMarkdown(site, audit), 'utf8');

  progress({ status: 'running', progress: 90, message: 'Stage 8: exporting ZIP package' });
  const zipPath = await createZip(outDir, siteId);
  db.prepare('INSERT INTO generated_sites (id, business_name, industry, prompt, status, output_path, zip_path, domain_name, reality_check_score, reality_check_report, reality_check_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(siteId, brief.business_name, brief.industry, prompt, 'complete', outDir, zipPath, metadata.domainName || null, audit.score, JSON.stringify(audit), audit.verdict);
  try {
    await recordGenerationForTraining({ site, prompt, outDir, zipPath, audit });
  } catch (error) {
    console.warn(`Training record skipped: ${error.message}`);
  }
  return { siteId, outDir, zipPath };
}





function buildDesignEngine(brief) {
  const presetKey = presetKeyFor(brief);
  const preset = withBrandColours(THEME_PRESETS[presetKey] || THEME_PRESETS.professional, brief.colours);
  return {
    preset: presetKey,
    palette: preset.palette,
    density: preset.density,
    tokens: {
      colors: {
        primary: preset.colors.lightPrimary,
        secondary: preset.colors.lightBg,
        accent: preset.colors.lightAccent,
        ink: preset.colors.lightInk,
        surface: preset.colors.lightSurface,
        muted: preset.colors.lightMuted,
        darkSurface: preset.colors.darkSurface,
        darkInk: preset.colors.darkInk
      },
      fonts: { display: preset.display, body: preset.body },
      radius: { sm: '8px', md: '14px', lg: '24px' },
      shadow: { sm: '0 1px 2px color-mix(in oklch, var(--ink), transparent 90%)', md: '0 24px 80px color-mix(in oklch, var(--ink), transparent 88%)' },
      spacing: { xs: 'var(--space-2)', sm: 'var(--space-4)', md: 'var(--space-6)', lg: 'var(--space-10)', xl: 'var(--space-16)' }
    },
    cssRoot: cssRootForPreset(preset)
  };
}

function buildContentEngine(brief, draft) {
  const home = draft.home;
  const pages = Object.fromEntries(brief.pages.map((page) => [page, pageContent(page, brief, draft)]));
  return { ...draft, pages };
}

function buildPageArchitecture(brief, content) {
  const has = (list) => Array.isArray(list) && list.length > 0;
  return brief.pages.map((page) => {
    const lower = page.toLowerCase();
    const sections = [];
    if (page === 'Home') {
      sections.push('hero-split-image', 'trust-bar', 'services-card-grid', 'about-story', 'features-3col', 'process-steps');
      if (content.gallery) sections.push('gallery');
      if (has(content.testimonials)) sections.push('testimonial-grid');
      if (has(content.team)) sections.push('about-team-grid');
      sections.push('faq-accordion', 'cta-banner', 'contact-form-map');
    } else if (/^contact/.test(lower)) {
      sections.push('hero-text-left', 'contact-form-map');
    } else if (/gallery|before|results|smile/.test(lower)) {
      sections.push('hero-text-left', 'gallery', 'page-sections', 'cta-banner');
    } else if (/faq|question/.test(lower)) {
      sections.push('hero-text-left', 'faq-accordion', 'cta-banner');
    } else if (/blog|news|journal|articles/.test(lower)) {
      sections.push('hero-text-left', 'page-sections', 'cta-banner');
    } else if (/pric|fees|cost|rates|membership|packages|tickets/.test(lower)) {
      sections.push('hero-text-left', has(content.pricing) ? 'pricing-3tier' : 'services-list', 'page-sections', 'faq-accordion', 'cta-banner');
    } else if (/team|people|staff|practitioner|dentists|doctors|tutors|coaches|trainers|meet/.test(lower)) {
      sections.push('hero-text-left', has(content.team) ? 'about-team-grid' : 'about-story', 'page-sections', 'cta-banner');
    } else if (/about|story|who we are/.test(lower)) {
      sections.push('hero-text-left', 'about-story', 'features-3col', has(content.team) ? 'about-team-grid' : 'process-steps', 'cta-banner');
    } else if (/service|treatment|menu|bakes|product|shop|collection|classes|courses|features|what we do|work|properties|solutions/.test(lower)) {
      sections.push('hero-text-left', 'services-list', 'page-sections', 'process-steps');
      if (content.gallery) sections.push('gallery');
      sections.push('cta-banner');
    } else {
      sections.push('hero-text-left', 'page-sections', 'features-3col', 'cta-banner');
    }
    return { page, slug: slugForPage(page), sections: sections.map((scaffold) => ({ scaffold, page })) };
  });
}

function codeGenerator({ brief, design, content, architecture, site, domain }) {
  const pageFiles = architecture.map((pagePlan) => {
    const pageData = content.pages[pagePlan.page];
    return [pagePlan.slug, renderPage({ brief, design, content, pagePlan, pageData, site, domain })];
  });
  const allPages = architecture.map((page) => page.slug);
  const css = styleCss(design);
  const js = scriptJs();
  const files = [
    ...pageFiles,
    ['assets/css/styles.css', css],
    ['assets/css/style.css', css],
    ['assets/js/app.js', js],
    ['assets/js/script.js', js],
    ['sitemap.xml', sitemapXml(domain, allPages)],
    ['robots.txt', `User-agent: *\nAllow: /\nSitemap: https://${domain}/sitemap.xml\n`],
    ['feed.xml', feedXml(brief, domain)],
    ['README.md', readme(brief, domain)],
    ['research-and-strategy.md', researchBriefFor(brief)],
    ['validator-contract.md', pipelineContract()],
    ['database.sql', generatedDatabaseSql()],
    ['.env.example', generatedEnv()],
    ['404.html', renderUtilityPage(brief, design, domain, 'Page Not Found', 'The requested page could not be found.', allPages)],
    ['privacy.html', renderUtilityPage(brief, design, domain, 'Privacy Policy', `${brief.business_name} collects only the information needed to respond to enquiries and provide the requested service.`, allPages)],
    ['admin/bootstrap.php', adminBootstrap()],
    ['admin/index.php', adminPage('Admin Login')],
    ['admin/dashboard.php', adminPage('Dashboard')],
    ['admin/content.php', adminPage('Content')],
    ['admin/media.php', adminPage('Media')],
    ['admin/settings.php', adminPage('Settings')],
    ['admin/contact.php', contactEndpoint()],
    ['admin/newsletter.php', newsletterEndpoint()],
    ['admin/csrf.php', csrfEndpoint()]
  ];
  return files;
}

function renderPage({ brief, design, content, pagePlan, pageData, site, domain }) {
  const nav = navHtml(brief.pages).replace(`href="${pagePlan.slug}"`, `href="${pagePlan.slug}" aria-current="page"`);
  const schema = schemaForPage(pagePlan.page, brief, domain, content);
  const sections = pagePlan.sections.map((section) => renderScaffold(section.scaffold, { brief, content, page: pagePlan.page, pageData, site })).join('\n');
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(pageData.metaTitle)}</title>
  <meta name="description" content="${esc(pageData.metaDescription)}">${content.seoKeywords?.length ? `
  <meta name="keywords" content="${esc(content.seoKeywords.join(', '))}">` : ''}
  <link rel="canonical" href="https://${esc(domain)}/${pagePlan.slug === 'index.html' ? '' : pagePlan.slug}">
  <meta property="og:title" content="${esc(pageData.metaTitle)}">
  <meta property="og:description" content="${esc(pageData.metaDescription)}">
  <meta property="og:type" content="website">
  <meta property="og:url" content="https://${esc(domain)}/${pagePlan.slug === 'index.html' ? '' : pagePlan.slug}">
  <meta name="twitter:card" content="summary_large_image">
  ${fontshareLink(design)}
  <link rel="stylesheet" href="assets/css/styles.css">
  <script type="application/ld+json">${schema}</script>
</head>
<body>
  <header class="site-header">
    <a class="brand" href="index.html" aria-label="${esc(brief.business_name)} home">${esc(brief.business_name)}</a>
    <button class="nav-toggle" type="button" aria-expanded="false" aria-controls="site-nav">Menu</button>
    <nav id="site-nav" aria-label="Primary navigation">${nav}</nav>
    <button class="theme-toggle" type="button" aria-label="Toggle dark mode" data-theme-toggle><span aria-hidden="true"></span></button>
  </header>
  <main>
${sections}
  </main>
  ${footerHtml(brief, content)}
  <script src="assets/js/app.js" defer></script>
</body>
</html>`;
}

function renderScaffold(scaffold, ctx) {
  const renderers = {
    'hero-text-left': heroTextLeft,
    'hero-split-image': heroSplitImage,
    'features-3col': features3Col,
    'features-2col': features3Col,
    'process-steps': processSteps,
    'page-sections': pageSections,
    'testimonial-single': testimonialGrid,
    'testimonial-grid': testimonialGrid,
    'cta-banner': ctaBanner,
    'contact-form': contactFormMap,
    'contact-form-map': contactFormMap,
    'services-card-grid': servicesCardGrid,
    'services-list': servicesList,
    'faq-accordion': faqAccordion,
    'about-story': aboutStory,
    'about-team-grid': aboutTeamGrid,
    'pricing-3tier': pricing3Tier,
    'blog-index': pageSections,
    'blog-post': pageSections,
    'trust-bar': trustBar,
    gallery: gallerySection
  };
  return (renderers[scaffold] || pageSections)(ctx);
}

function heroTextLeft({ brief, content, pageData, page }) {
  const isUtility = /privacy|not found/i.test(page || '');
  return `<section class="section hero hero-text-left">
    <div class="container narrow">
      <p class="eyebrow">${esc(isUtility ? brief.business_name : content.home?.eyebrow || brief.industry)}</p>
      <h1>${esc(pageData.h1)}</h1>
      ${pageData.subheadline ? `<p class="lede">${esc(pageData.subheadline)}</p>` : ''}
      ${isUtility || /^contact/i.test(page || '') ? '' : `<div class="actions"><a class="button" href="contact.html">${esc(pageData.cta)}</a>${brief.contact_phone ? `<a class="text-link" href="tel:${esc(brief.contact_phone.replace(/\s+/g, ''))}">Call ${esc(brief.contact_phone)}</a>` : ''}</div>`}
    </div>
  </section>`;
}

function heroSplitImage(ctx) {
  const image = imageFor(ctx.site, 'heroSeed');
  const home = ctx.content.home;
  const signals = (home.trustSignals || []).slice(0, 3);
  return `<section class="section hero hero-split-image">
    <div class="container split">
      <div>
        <p class="eyebrow">${esc(home.eyebrow)}</p>
        <h1>${esc(ctx.pageData.h1)}</h1>
        <p class="lede">${esc(ctx.pageData.subheadline)}</p>
        <div class="actions"><a class="button" href="contact.html">${esc(home.primaryCta)}</a><a class="text-link" href="${serviceHref(ctx.brief)}">${esc(home.secondaryCta)}</a></div>
        ${ctx.brief.contact_phone ? `<p class="hero-contact">Prefer to talk? <a href="tel:${esc(ctx.brief.contact_phone.replace(/\s+/g, ''))}">${esc(ctx.brief.contact_phone)}</a></p>` : ''}
      </div>
      <figure class="media-card hero-motion">
        <img src="${esc(image)}" alt="${esc(ctx.brief.business_name)}, ${esc(ctx.brief.industry.toLowerCase())}${ctx.brief.location ? ` in ${esc(ctx.brief.location)}` : ''}" decoding="async" width="1536" height="1024">
        <div class="motion-cards" aria-hidden="true">
          ${signals.map((signal, index) => `<span class="motion-card motion-card-${index + 1}"><strong>${esc(signal.value)}</strong><small>${esc(signal.label)}</small></span>`).join('')}
        </div>
      </figure>
    </div>
  </section>`;
}



function trustBar({ content }) {
  return `<section class="trust-bar" aria-label="Trust signals"><div class="container trust-grid">${content.home.trustSignals.map((item) => `<article><strong>${esc(item.value)}</strong><span>${esc(item.label)}</span></article>`).join('')}</div></section>`;
}

function servicesCardGrid(ctx) {
  const href = serviceHref(ctx.brief);
  const services = ctx.content.home.services.slice(0, 6);
  return `<section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">${esc(servicesLabel(ctx.brief))}</p><h2>${esc(servicesHeading(ctx.brief))}</h2></div><div class="card-grid services-grid">${services.map((service) => `<article class="card service-card"><h3>${esc(service.title)}</h3><p>${esc(service.description)}</p>${service.price ? `<p class="price">${esc(service.price)}</p>` : ''}</article>`).join('')}</div><p class="section-more"><a class="text-link" href="${href}">${esc(ctx.content.home.secondaryCta)}</a></p></div></section>`;
}

function servicesLabel(brief) {
  return { care: 'Treatments', hospitality: 'What we serve', commerce: 'Shop', fitness: 'Classes & training', portfolio: 'What we do', software: 'Features', property: 'Services', event: 'Programme', education: 'Courses', trades: 'Services', civic: 'How we help' }[brief.project_nature] || 'Services';
}

function servicesHeading(brief) {
  const place = brief.location ? ` in ${brief.location.split(',')[0]}` : '';
  return { care: `Care and treatments${place}`, hospitality: `Made fresh${place}`, commerce: 'Shop the collection', fitness: 'Find the right way to train', portfolio: 'How we can work together', software: 'Everything your team needs', property: `Property services${place}`, event: 'What to expect', education: 'Learning that fits', trades: `What we can do for you${place}`, civic: 'Support for our community' }[brief.project_nature] || `How ${brief.business_name} can help`;
}

function servicesList(ctx) {
  return `<section class="section"><div class="container service-list">${ctx.content.home.services.map((service, index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><div><h2>${esc(service.title)}</h2><p>${esc(service.description)}</p>${service.price ? `<p class="price">${esc(service.price)}</p>` : ''}</div><a class="text-link" href="contact.html">Ask about this</a></article>`).join('')}</div></section>`;
}

function features3Col({ brief, content }) {
  return `<section class="section muted-section"><div class="container"><div class="section-heading"><p class="eyebrow">Why ${esc(brief.business_name)}</p><h2>${esc(whyHeading(brief))}</h2></div><div class="three-col">${content.benefits.slice(0, 3).map((item) => `<article><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join('')}</div></div></section>`;
}

function whyHeading(brief) {
  return { care: 'Care that puts you at ease', hospitality: 'Why people keep coming back', commerce: 'Shopping made simple', fitness: 'Coaching that keeps you going', software: 'Built to make work easier', trades: 'Work you can rely on', education: 'Why families choose us' }[brief.project_nature] || 'What makes the difference';
}





function testimonialGrid({ content }) {
  const items = content.testimonials || [];
  if (!items.length) return '';
  return `<section class="section testimonial-single"><div class="container"><div class="section-heading"><p class="eyebrow">Reviews</p><h2>What people say</h2></div><div class="card-grid">${items.slice(0, 3).map((item) => `<blockquote class="card"><p>"${esc(item.quote)}"</p>${item.name ? `<cite>${esc(item.name)}</cite>` : ''}</blockquote>`).join('')}</div></div></section>`;
}

function gallerySection({ brief, content }) {
  if (!content.gallery) return '';
  const label = brief.project_nature === 'care' ? 'Before & after' : 'Gallery';
  const tiles = ['Smile makeover', 'Whitening', 'Composite bonding', 'Invisalign'];
  const names = brief.project_nature === 'care' ? tiles : ['Recent work', 'Project', 'Detail', 'Finished result'];
  return `<section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">${label}</p><h2>Real results</h2><p class="lede">Gallery placeholders: replace each image with your own photos (with written consent where people are shown).</p></div><div class="gallery-grid">${names.map((name) => `<figure class="gallery-tile"><div class="gallery-pair"><span>Before</span><span>After</span></div><figcaption>${esc(name)}</figcaption></figure>`).join('')}</div></div></section>`;
}

function processSteps({ content }) {
  const steps = content.process || [];
  if (!steps.length) return '';
  return `<section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">How it works</p><h2>Simple from the first step</h2></div><ol class="process-steps">${steps.slice(0, 4).map((step, index) => `<li><span class="step-number">${index + 1}</span><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></li>`).join('')}</ol></div></section>`;
}

function pageSections({ pageData }) {
  const sections = pageData.sections || [];
  if (!sections.length) return '';
  return `<section class="section"><div class="container page-sections">${sections.map((section) => `<article><h2>${esc(section.title)}</h2><div><p>${esc(section.text)}</p>${section.bullets?.length ? `<ul>${section.bullets.map((bullet) => `<li>${esc(bullet)}</li>`).join('')}</ul>` : ''}</div></article>`).join('')}</div></section>`;
}

function ctaBanner({ brief, content }) {
  return `<section class="section cta-banner"><div class="container split"><div><h2>${esc(content.finalCta.heading)}</h2><p>${esc(content.finalCta.text)}</p></div><div class="actions"><a class="button" href="contact.html">${esc(content.home.primaryCta)}</a>${brief.contact_phone ? `<a class="text-link" href="tel:${esc(brief.contact_phone.replace(/\s+/g, ''))}">${esc(brief.contact_phone)}</a>` : ''}</div></div></section>`;
}



function contactFormMap(ctx) {
  const { brief, content } = ctx;
  const details = [
    brief.address ? `<li><strong>Address</strong><span>${esc(brief.address)}</span></li>` : '',
    brief.contact_phone ? `<li><strong>Phone</strong><a href="tel:${esc(brief.contact_phone.replace(/\s+/g, ''))}">${esc(brief.contact_phone)}</a></li>` : '',
    `<li><strong>Email</strong><a href="mailto:${esc(brief.contact_email)}">${esc(brief.contact_email)}</a></li>`,
    brief.hours ? `<li><strong>Opening hours</strong><span>${esc(brief.hours)}</span></li>` : ''
  ].join('');
  const mapQuery = encodeURIComponent([brief.business_name, brief.address || brief.location].filter(Boolean).join(', '));
  return `<section class="section" id="contact"><div class="container split"><div><p class="eyebrow">Contact</p><h2>Get in touch with ${esc(brief.business_name)}</h2><ul class="contact-details">${details}</ul>${brief.address || brief.location ? `<a class="text-link external-link" href="https://www.google.com/maps/search/?api=1&query=${mapQuery}" target="_blank" rel="noopener">Open in Google Maps</a>` : ''}</div>${formHtml(content.home.primaryCta)}</div>${brief.address || brief.location ? `<div class="container"><iframe class="map-embed" title="Map showing ${esc(brief.business_name)}" src="https://maps.google.com/maps?q=${mapQuery}&output=embed" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe></div>` : ''}</section>`;
}

function faqAccordion({ content }) {
  const faqs = content.faqs || [];
  if (!faqs.length) return '';
  return `<section class="section"><div class="container narrow"><div class="section-heading"><p class="eyebrow">FAQ</p><h2>Questions people often ask</h2></div>${faqs.map((faq) => `<details><summary>${esc(faq.q)}</summary><p>${esc(faq.a)}</p></details>`).join('')}</div></section>`;
}

function aboutStory(ctx) {
  const image = imageFor(ctx.site, 'about story');
  return `<section class="section"><div class="container split about-split"><figure class="media-card"><img src="${esc(image)}" alt="Inside ${esc(ctx.brief.business_name)}" loading="lazy" decoding="async" width="1024" height="1024"></figure><div><p class="eyebrow">About us</p><h2>${esc(ctx.content.about.heading)}</h2><p>${esc(ctx.content.about.body)}</p><a class="text-link" href="contact.html">${esc(ctx.content.home.primaryCta)}</a></div></div></section>`;
}

function aboutTeamGrid({ content }) {
  const team = content.team || [];
  if (!team.length) return '';
  return `<section class="section muted-section"><div class="container"><div class="section-heading"><p class="eyebrow">Our team</p><h2>The people you'll meet</h2></div><div class="card-grid team-grid">${team.map((member) => `<article class="card team-card"><span class="avatar" aria-hidden="true">${esc(initials(member.name))}</span><h3>${esc(member.name)}</h3>${member.role ? `<p class="role">${esc(member.role)}</p>` : ''}${member.bio ? `<p>${esc(member.bio)}</p>` : ''}</article>`).join('')}</div></div></section>`;
}

function initials(name) {
  return String(name || '').replace(/^(dr|mr|mrs|ms|miss|prof)\.?\s+/i, '').split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0].toUpperCase()).join('');
}

function pricing3Tier({ content }) {
  const pricing = content.pricing || [];
  if (!pricing.length) return '';
  return `<section class="section"><div class="container"><table class="price-table"><caption class="eyebrow">Prices</caption><tbody>${pricing.map((item) => `<tr><th scope="row">${esc(item.name)}${item.description ? `<span>${esc(item.description)}</span>` : ''}</th><td>${esc(item.price)}</td></tr>`).join('')}</tbody></table></div></section>`;
}





function formHtml(cta) {
  return `<form class="form" method="post" action="admin/contact.php"><input type="hidden" name="_csrf" value=""><label>Name<input name="name" autocomplete="name" required></label><label>Email<input type="email" name="email" autocomplete="email" required></label><label>Message<textarea name="message" required></textarea></label><button class="button">${esc(cta)}</button></form>`;
}

function styleCss(design) {
  return `${design.cssRoot}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--font-body);font-size:var(--type-base);line-height:1.65;color:var(--ink);background:var(--bg);text-rendering:optimizeLegibility}a{color:inherit;text-underline-offset:.24em}img{display:block;max-width:100%;height:auto;border-radius:var(--radius-lg)}.site-header{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:auto auto 1fr auto;gap:var(--space-4);align-items:center;min-height:72px;padding:var(--space-3) var(--page-pad);background:color-mix(in oklch,var(--surface),transparent 8%);backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}.brand{font-weight:800;text-decoration:none}.site-header nav{display:flex;gap:var(--space-2);justify-content:end;align-items:center;flex-wrap:wrap}.site-header nav a{min-height:44px;display:inline-flex;align-items:center;padding:0 var(--space-2);font-weight:700;text-decoration:none}.nav-toggle{display:none}.theme-toggle{width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:var(--radius-pill);background:var(--ink);color:var(--bg)}.theme-toggle span{width:18px;height:18px;border:2px solid currentColor;border-radius:50%;background:linear-gradient(90deg,currentColor 50%,transparent 50%)}button,.button{min-height:44px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--radius-md);padding:0 var(--space-5);background:var(--primary);color:var(--on-primary);font:800 var(--type-sm)/1 var(--font-body);text-decoration:none;transition:var(--transition);cursor:pointer}.button:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}.text-link{font-weight:800}.section{padding:var(--section-pad) var(--page-pad)}.container{width:min(1180px,100%);margin-inline:auto}.narrow{width:min(820px,100%)}.split{display:grid;grid-template-columns:1fr;gap:var(--space-8);align-items:center}.hero{padding-top:clamp(var(--space-12),10vw,var(--space-24));padding-bottom:clamp(var(--space-12),10vw,var(--space-24))}.hero h1{max-width:900px;margin:0 0 var(--space-5);font-family:var(--font-display);font-size:var(--type-hero);line-height:.98;letter-spacing:0}.hero .lede,.lede{max-width:720px;color:var(--muted);font-size:var(--type-lg)}.eyebrow{margin:0 0 var(--space-3);font-size:var(--type-xs);font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--primary)}h1,h2,h3{font-family:var(--font-display);letter-spacing:0;text-wrap:balance}h2{font-size:var(--type-2xl);line-height:1.08;margin:0 0 var(--space-4)}h3{font-size:var(--type-xl);line-height:1.16;margin:0 0 var(--space-3)}p{margin:0 0 var(--space-4)}.actions{display:flex;gap:var(--space-3);flex-wrap:wrap;align-items:center;margin-top:var(--space-6)}.trust-bar{padding:var(--space-4) var(--page-pad);background:var(--ink);color:var(--bg)}.trust-grid,.card-grid,.three-col,.two-col{display:grid;grid-template-columns:1fr;gap:var(--space-4)}.trust-grid article{display:grid;gap:var(--space-1)}.trust-grid strong{font:900 var(--type-2xl)/1 var(--font-display)}.card,.three-col article,.two-col article,.service-list article,blockquote,details,.form,.map-panel{padding:var(--space-6);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)}.card img{aspect-ratio:3/2;object-fit:cover;margin-bottom:var(--space-4)}.muted-section{background:var(--surface-muted)}.service-list{display:grid;gap:var(--space-4)}.service-list article{display:grid;grid-template-columns:52px minmax(120px,220px) 1fr;gap:var(--space-4);align-items:start}.service-list span{font-weight:900;color:var(--primary)}.service-list img{aspect-ratio:3/2;object-fit:cover}.testimonial-single{background:var(--ink);color:var(--bg)}.testimonial-single blockquote{background:color-mix(in oklch,var(--bg),transparent 92%);border-color:color-mix(in oklch,var(--bg),transparent 82%);box-shadow:none}.testimonial-single p{font-size:var(--type-xl);line-height:1.35}.cta-banner{background:var(--primary);color:var(--on-primary)}.cta-banner .container{align-items:center}.form{display:grid;gap:var(--space-4)}label{display:grid;gap:var(--space-2);font-weight:800}input,textarea{width:100%;min-height:44px;border:1px solid var(--line-strong);border-radius:var(--radius-sm);padding:var(--space-3);background:var(--bg);color:var(--ink);font:inherit}textarea{min-height:132px}details{margin-bottom:var(--space-3)}summary{min-height:44px;display:flex;align-items:center;font-weight:900;cursor:pointer}.media-card{margin:0}.media-card img{width:100%;aspect-ratio:4/3;object-fit:cover}.map-panel{min-height:260px;display:grid;align-content:end;background:linear-gradient(135deg,var(--surface-muted),var(--surface))}.site-footer{display:grid;gap:var(--space-4);padding:var(--space-8) var(--page-pad);border-top:1px solid var(--line);background:var(--surface)}.site-footer nav{display:flex;gap:var(--space-3);flex-wrap:wrap}.site-footer a{min-height:44px;display:inline-flex;align-items:center}.reveal{opacity:1;transform:translateY(var(--space-2));transition:var(--transition)}.reveal.is-visible{transform:translateY(0)}.external-link[target="_blank"]{font-weight:800}
.hero-motion{position:relative;isolation:isolate;overflow:hidden;min-height:clamp(320px,42vw,560px);display:grid;align-items:stretch;background:var(--surface-muted);box-shadow:var(--shadow-md)}.hero-motion img{position:relative;z-index:1;height:100%;min-height:inherit;object-fit:cover;transform:scale(1.02);animation:heroDrift 12s ease-in-out infinite alternate}.hero-motion:before{content:"";position:absolute;inset:0;z-index:2;background:linear-gradient(120deg,transparent,color-mix(in oklch,var(--accent),transparent 70%),transparent);transform:translateX(-130%);animation:signalSweep 5.8s ease-in-out infinite}.motion-lines{position:absolute;inset:var(--space-5);z-index:3;display:grid;align-content:center;gap:var(--space-3);pointer-events:none}.motion-lines span{display:block;height:8px;width:48%;border-radius:var(--radius-pill);background:color-mix(in oklch,var(--accent),transparent 32%);box-shadow:0 0 28px color-mix(in oklch,var(--accent),transparent 62%);transform-origin:left center;animation:linePulse 2.8s ease-in-out infinite}.motion-lines span:nth-child(2){width:68%;animation-delay:.45s;background:color-mix(in oklch,var(--ink),transparent 68%)}.motion-lines span:nth-child(3){width:36%;animation-delay:.9s}.motion-cards{position:absolute;inset:var(--space-4);z-index:4;pointer-events:none}.motion-card{position:absolute;display:grid;gap:var(--space-1);min-width:132px;padding:var(--space-3);border:1px solid color-mix(in oklch,var(--bg),transparent 52%);border-radius:var(--radius-md);background:color-mix(in oklch,var(--surface),transparent 10%);box-shadow:var(--shadow-sm);backdrop-filter:blur(16px);animation:cardFloat 4.8s ease-in-out infinite}.motion-card strong{font:900 var(--type-xl)/1 var(--font-display);color:var(--primary)}.motion-card small{font:800 var(--type-xs)/1.25 var(--font-body);color:var(--ink)}.motion-card-1{right:var(--space-3);top:var(--space-3)}.motion-card-2{left:var(--space-3);bottom:var(--space-3);animation-delay:.8s}.motion-card-3{right:var(--space-6);bottom:calc(var(--space-6) + 56px);animation-delay:1.6s}@keyframes heroDrift{from{transform:scale(1.02) translate3d(0,0,0)}to{transform:scale(1.07) translate3d(var(--space-2),calc(var(--space-1) * -1),0)}}@keyframes signalSweep{0%,36%{transform:translateX(-130%)}62%,100%{transform:translateX(130%)}}@keyframes linePulse{0%,100%{transform:scaleX(.55);opacity:.42}50%{transform:scaleX(1);opacity:1}}@keyframes cardFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(var(--space-2) * -1))}}
.cta-banner .button{background:var(--on-primary);color:var(--primary)}.cta-banner .button:hover{background:color-mix(in oklch,var(--on-primary),var(--primary) 12%)}.cta-banner .text-link{color:var(--on-primary)}.cta-banner .actions{align-items:center;justify-content:flex-start}.gallery-grid{display:grid;gap:var(--space-6);grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}.gallery-tile{margin:0}.gallery-pair{display:grid;grid-template-columns:1fr 1fr;gap:4px;border-radius:var(--radius-md);overflow:hidden;aspect-ratio:4/3}.gallery-pair span{display:grid;place-items:end start;padding:var(--space-3);font-size:var(--type-sm);font-weight:700;color:var(--ink);background:color-mix(in oklch,var(--primary),var(--surface) 86%)}.gallery-pair span+span{background:color-mix(in oklch,var(--accent),var(--surface) 70%)}.gallery-tile figcaption{margin-top:var(--space-3);font-weight:600}.map-embed{display:block;width:100%;height:clamp(260px,40vw,420px);border:0;border-radius:var(--radius-lg);margin-top:var(--space-10);box-shadow:var(--shadow-sm)}.section-heading{max-width:46rem;margin-bottom:var(--space-10)}.section-more{margin-top:var(--space-8)}.hero-contact{margin-top:var(--space-4);color:var(--muted);font-size:var(--type-sm)}.hero-contact a{color:var(--primary);font-weight:600}.price{font-weight:700;color:var(--primary);margin-top:var(--space-2)}.service-card h3{margin-top:0}.process-steps{list-style:none;margin:0;padding:0;display:grid;gap:var(--space-6);counter-reset:none}.process-steps li{position:relative;padding:var(--space-6);border-radius:var(--radius-md);background:var(--surface);border:1px solid var(--line)}.step-number{display:inline-grid;place-items:center;width:2.4rem;height:2.4rem;border-radius:var(--radius-pill);background:var(--primary);color:var(--on-primary);font-weight:700;margin-bottom:var(--space-3)}.process-steps h3{margin:0 0 var(--space-2)}.page-sections{display:grid;gap:var(--space-10)}.page-sections article{display:grid;gap:var(--space-4);padding-bottom:var(--space-10);border-bottom:1px solid var(--line)}.page-sections article:last-child{border-bottom:0;padding-bottom:0}.page-sections h2{margin:0}.page-sections ul{margin:var(--space-3) 0 0;padding-left:1.2em}.page-sections li{margin-bottom:var(--space-2)}.team-card{text-align:left}.avatar{display:inline-grid;place-items:center;width:3.4rem;height:3.4rem;border-radius:var(--radius-pill);background:color-mix(in oklch,var(--primary),var(--surface) 82%);color:var(--primary);font-weight:700;font-size:var(--type-lg);margin-bottom:var(--space-3)}.role{color:var(--primary);font-weight:600;margin-top:calc(var(--space-2) * -1)}.price-table{width:100%;border-collapse:collapse;background:var(--surface);border-radius:var(--radius-md);overflow:hidden;box-shadow:var(--shadow-sm)}.price-table caption{text-align:left;padding-bottom:var(--space-4)}.price-table th,.price-table td{padding:var(--space-5) var(--space-6);border-bottom:1px solid var(--line);text-align:left;vertical-align:top}.price-table td{text-align:right;font-weight:700;color:var(--primary);white-space:nowrap}.price-table th span{display:block;font-weight:400;color:var(--muted);font-size:var(--type-sm);margin-top:var(--space-1)}.contact-details{list-style:none;padding:0;margin:var(--space-6) 0;display:grid;gap:var(--space-4)}.contact-details li{display:grid;gap:2px}.contact-details strong{font-size:var(--type-sm);color:var(--muted);font-weight:600}.contact-details a{color:var(--primary);font-weight:600}.site-header nav a[aria-current="page"]{color:var(--primary);font-weight:700}.small{font-size:var(--type-sm);color:var(--muted)}.about-split .media-card img{aspect-ratio:1/1;object-fit:cover}
@media(min-width:768px){.process-steps{grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.page-sections article{grid-template-columns:minmax(0,1fr) minmax(0,1.6fr);gap:var(--space-10)}.team-grid{grid-template-columns:repeat(auto-fit,minmax(220px,1fr))}}
@media(min-width:768px){.split{grid-template-columns:1fr 1fr}.trust-grid{grid-template-columns:repeat(3,1fr)}.card-grid,.three-col{grid-template-columns:repeat(3,1fr)}.two-col{grid-template-columns:repeat(2,1fr)}.site-footer{grid-template-columns:1fr auto}.nav-toggle{display:none!important}}
@media(max-width:767px){.site-header{grid-template-columns:1fr auto auto}.nav-toggle{display:inline-flex;background:var(--surface);color:var(--ink);border:1px solid var(--line)}.site-header nav{grid-column:1/-1;display:none;justify-content:start}.site-header nav.is-open{display:flex}.site-header nav a{padding-inline:0}.hero h1{font-size:clamp(2.4rem,13vw,4rem)}.hero-motion{min-height:320px}.motion-card{min-width:112px;padding:var(--space-2)}.motion-card-3{display:none}.service-list article{grid-template-columns:1fr}.service-list img{width:100%}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}`;
}

function cssRootForPreset(preset) {
  const c = preset.colors;
  return `:root{--font-display:"${preset.display}",serif;--font-body:"${preset.body}",system-ui,sans-serif;--type-xs:clamp(.78rem,.74rem + .1vw,.84rem);--type-sm:clamp(.9rem,.86rem + .14vw,1rem);--type-base:clamp(1rem,.96rem + .16vw,1.08rem);--type-lg:clamp(1.12rem,1.03rem + .42vw,1.35rem);--type-xl:clamp(1.35rem,1.16rem + .8vw,1.85rem);--type-2xl:clamp(1.9rem,1.35rem + 2vw,3.2rem);--type-hero:clamp(2.5rem,1.7rem + 3.2vw,4.6rem);--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;--space-8:32px;--space-10:40px;--space-12:48px;--space-16:64px;--space-20:80px;--space-24:96px;--space-32:128px;--page-pad:clamp(var(--space-4),5vw,var(--space-16));--section-pad:clamp(var(--space-16),9vw,var(--space-24));--bg:${c.lightBg};--surface:${c.lightSurface};--surface-muted:color-mix(in oklch,var(--bg),var(--surface) 45%);--ink:${c.lightInk};--muted:${c.lightMuted};--primary:${c.lightPrimary};--accent:${c.lightAccent};--on-primary:oklch(99% 0 0);--line:color-mix(in oklch,var(--ink),transparent 88%);--line-strong:color-mix(in oklch,var(--ink),transparent 72%);--radius-sm:8px;--radius-md:14px;--radius-lg:24px;--radius-pill:999px;--shadow-sm:0 1px 2px color-mix(in oklch,var(--ink),transparent 90%);--shadow-md:0 24px 80px color-mix(in oklch,var(--ink),transparent 88%);--transition:180ms ease}[data-theme="dark"]{--bg:${c.darkBg};--surface:${c.darkSurface};--surface-muted:color-mix(in oklch,var(--surface),var(--bg) 50%);--ink:${c.darkInk};--muted:${c.darkMuted};--line:color-mix(in oklch,var(--ink),transparent 84%);--line-strong:color-mix(in oklch,var(--ink),transparent 68%)}`;
}

function scriptJs() {
  return `const root=document.documentElement;document.querySelector('[data-theme-toggle]')?.addEventListener('click',()=>{root.dataset.theme=root.dataset.theme==='dark'?'light':'dark'});const nav=document.querySelector('#site-nav');document.querySelector('.nav-toggle')?.addEventListener('click',(event)=>{const open=!nav.classList.contains('is-open');nav.classList.toggle('is-open',open);event.currentTarget.setAttribute('aria-expanded',String(open))});document.querySelectorAll('details').forEach((detail)=>detail.addEventListener('toggle',()=>{if(detail.open){document.querySelectorAll('details').forEach((other)=>{if(other!==detail)other.open=false})}}));document.querySelectorAll('a[href^="#"]').forEach((link)=>link.addEventListener('click',(event)=>{const target=document.querySelector(link.getAttribute('href'));if(target){event.preventDefault();target.scrollIntoView({behavior:'smooth',block:'start'})}}));const observer='IntersectionObserver'in window?new IntersectionObserver((entries)=>entries.forEach((entry)=>{if(entry.isIntersecting){entry.target.classList.add('is-visible');observer.unobserve(entry.target)}}),{threshold:.12}):null;document.querySelectorAll('main section,footer').forEach((el)=>{el.classList.add('reveal');if(observer)observer.observe(el);else el.classList.add('is-visible')});fetch('admin/csrf.php').then((r)=>r.json()).then((data)=>document.querySelectorAll('[name="_csrf"]').forEach((input)=>{input.value=data.token||''})).catch(()=>{});`;
}

async function validateGeneratedSite(outDir, brief, content, files) {
  const htmlFiles = files.filter(([name]) => name.endsWith('.html'));
  const css = files.find(([name]) => name === 'assets/css/styles.css')?.[1] || '';
  const checks = [];
  for (const [file, html] of htmlFiles) {
    checks.push(check(`${file}: one h1`, (html.match(/<h1\b/gi) || []).length === 1));
    checks.push(check(`${file}: heading order`, headingOrderIsValid(html)));
    const title = decodeEntities(html.match(/<title>([^<]*)<\/title>/i)?.[1] || '');
    const description = decodeEntities(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || '');
    checks.push(check(`${file}: meta title`, title.length >= 25 && title.length <= 60));
    checks.push(check(`${file}: meta description`, description.length >= 120 && description.length <= 160));
    checks.push(check(`${file}: JSON-LD`, /application\/ld\+json/i.test(html)));
    checks.push(check(`${file}: image alt text`, !/<img\b(?![^>]*alt="[^"]{6,}")/i.test(html)));
    checks.push(check(`${file}: two internal links`, (html.match(/href="(?!https?:|mailto:|tel:|#)[^"]+"/gi) || []).length >= 2));
  }
  checks.push(check('No broken internal links', internalLinksExist(files)));
  checks.push(check('CSS uses OKLCH variables', /oklch\(/i.test(css) && !/#[0-9a-f]{3,8}\b/i.test(css)));
  checks.push(check('Dark mode tokens present', /\[data-theme="dark"\]/.test(css)));
  checks.push(check('WCAG contrast policy passes', contrastPolicyPasses(css)));
  checks.push(check('No rendered text below 12px', !/font-size:\s*(?:[0-9]|1[01])px/i.test(css)));
  checks.push(check('Mobile layout includes 375px-safe breakpoint', /@media\(max-width:767px\)/.test(css)));
  checks.push(check('No local storage', !/localStorage|sessionStorage/.test(files.map(([, body]) => body).join('\n'))));
  checks.push(check('Sitemap lists pages', brief.pages.every((page) => sitemapContains(files, page))));
  checks.push(check('Primary keyword in first 100 words', firstWords(htmlFiles[0]?.[1] || '', 100).toLowerCase().includes(content.primaryKeyword.toLowerCase().split(' ')[0])));
  return { passed: checks.every((item) => item.passed), checks };
}

function repairValidationFailures(files) {
  return files;
}

function validatorMarkdown(report) {
  return `# Validator Report\n\n${report.checks.map((item) => `- ${item.passed ? 'PASS' : 'FAIL'}: ${item.name}`).join('\n')}\n`;
}

function check(name, passed) {
  return { name, passed: Boolean(passed) };
}

function firstWords(html, limit) {
  return String(html).replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').split(/\s+/).slice(0, limit).join(' ');
}

function internalLinksExist(files) {
  const names = new Set(files.map(([name]) => name));
  const html = files.filter(([name]) => name.endsWith('.html')).map(([, body]) => body).join('\n');
  const links = [...html.matchAll(/href="([^"]+)"/gi)]
    .map((match) => match[1])
    .filter((href) => !/^(https?:|mailto:|tel:|#|javascript:)/i.test(href))
    .map((href) => href.split('#')[0].split('?')[0])
    .filter((href) => href.endsWith('.html'));
  return links.every((href) => names.has(href));
}

function headingOrderIsValid(html) {
  const levels = [...String(html).matchAll(/<h([1-6])\b/gi)].map((match) => Number(match[1]));
  return levels.every((level, index) => index === 0 || level <= levels[index - 1] + 1);
}

function contrastPolicyPasses(css) {
  return /--ink:oklch\((1[6-9]|[2-4][0-9])%/i.test(css)
    && /--bg:oklch\((9[6-9]|100)%/i.test(css)
    && /--on-primary:oklch\(99%/i.test(css)
    && /\[data-theme="dark"\][\s\S]*--ink:oklch\(9[5-9]%/i.test(css);
}

async function prepareOutput(outDir) {
  await fs.mkdir(path.join(outDir, 'assets', 'css'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'assets', 'js'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'assets', 'images'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'admin'), { recursive: true });
}

async function writeFiles(outDir, files) {
  for (const [file, body] of files) {
    const target = path.join(outDir, file);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, body, 'utf8');
  }
}























function inferAudience(industry, lower) {
  if (/fire|safety/i.test(industry)) return 'local residents, families, organisations, and volunteers';
  if (/health|clinic/i.test(industry)) return 'patients comparing trustworthy care';
  if (/hospitality/i.test(industry)) return 'local guests planning a visit';
  if (/technology/i.test(industry)) return 'teams evaluating better workflows';
  if (/retail/i.test(industry)) return 'customers ready to compare and buy';
  if (/education/i.test(industry)) return 'students and parents comparing learning support';
  return 'people comparing trusted local providers';
}





function presetKeyFor(brief) {
  const byNature = { care: 'calm', hospitality: 'warm', commerce: 'creative', software: 'bold', fitness: 'bold', portfolio: 'creative', event: 'bold', professional: 'professional', property: 'professional', education: 'professional', trades: 'professional', civic: 'professional' };
  if (['calm', 'bold', 'warm', 'creative', 'professional'].includes(brief.tone)) return brief.tone;
  return byNature[brief.project_nature] || 'professional';
}

// Brand colours from the prompt / AI arrive as hex. The stylesheet is OKLCH-only, so
// convert, then clamp lightness so white button text keeps WCAG AA contrast.
function withBrandColours(preset, colours = {}) {
  const primary = hexToOklch(colours.primary);
  if (!primary) return preset;
  const accent = hexToOklch(colours.accent);
  const accentUsable = accent && Math.abs(hueDistance(accent.h, primary.h)) > 25 ? accent : null;
  const h = primary.h;
  const c = Math.min(primary.c, 0.16);
  const fmt = (l, chroma, hue) => `oklch(${Math.round(l)}% ${chroma.toFixed(3)} ${hue.toFixed(1)})`;
  const softC = Math.min(c, 0.04);
  return {
    ...preset,
    palette: `Brand ${colours.primary}${accentUsable ? ` + ${colours.accent}` : ''}`,
    colors: {
      ...preset.colors,
      lightBg: fmt(98, Math.min(softC, 0.014), h),
      lightSurface: 'oklch(100% 0 0)',
      lightInk: fmt(21, Math.min(softC, 0.03), h),
      lightMuted: fmt(46, Math.min(softC, 0.035), h),
      lightPrimary: fmt(Math.min(Math.max(primary.l, 36), 50), c, h),
      lightAccent: accentUsable ? fmt(Math.min(Math.max(accentUsable.l, 55), 78), Math.min(accentUsable.c, 0.16), accentUsable.h) : fmt(72, Math.min(c, 0.12), (h + 30) % 360),
      darkBg: fmt(18, Math.min(softC, 0.03), h),
      darkSurface: fmt(23, Math.min(softC, 0.035), h),
      darkInk: fmt(96, 0.012, h),
      darkMuted: fmt(78, 0.024, h)
    }
  };
}

function hueDistance(a, b) {
  return ((a - b + 540) % 360) - 180;
}

function hexToOklch(hex) {
  const match = String(hex || '').match(/^#?([0-9a-f]{6})$/i);
  if (!match) return null;
  const [r, g, b] = [0, 2, 4].map((index) => {
    const channel = parseInt(match[1].slice(index, index + 2), 16) / 255;
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s2;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s2;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s2;
  const C = Math.sqrt(A * A + B * B);
  let H = (Math.atan2(B, A) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { l: L * 100, c: C, h: H };
}

function pageContent(page, brief, draft) {
  const home = draft.home;
  const isHome = page === 'Home';
  const isContact = /^contact/i.test(page);
  const copy = draft.pageCopy[page] || {};
  const place = brief.location ? ` in ${brief.location.split(',')[0]}` : '';
  const h1 = isHome ? home.h1 : isContact ? `Contact ${brief.business_name}` : copy.h1 || page;
  const subheadline = isHome ? home.subheadline : isContact ? (brief.hours ? `We're open ${brief.hours}. Send a message and we'll get back to you soon.` : 'Send a message and we will get back to you as soon as we can.') : copy.intro || '';
  const metaBase = isHome ? `${brief.business_name} | ${brief.industry}${place}` : `${page} | ${brief.business_name}`;
  const metaSuffix = isHome ? home.primaryCta : `${brief.industry}${place}`;
  const description = isHome && draft.metaDescription ? draft.metaDescription : `${isHome ? home.subheadline : subheadline} ${brief.business_name}${place}.`;
  return {
    h1,
    subheadline,
    cta: home.primaryCta,
    sections: copy.sections || [],
    body: subheadline,
    metaTitle: fitMetaTitle(metaBase, metaSuffix),
    metaDescription: fitMetaDescription(description)
  };
}

function heroScaffoldFor(brief) {
  return 'hero-split-image';
}

function ctaForGoal(goal) {
  if (/book|appointment/.test(goal)) return 'Book your consultation today';
  if (/sell|product|shop/.test(goal)) return 'Shop the right option today';
  if (/demo/.test(goal)) return 'Request your demo today';
  if (/volunteer/.test(goal)) return 'Start your volunteer enquiry today';
  return 'Send your enquiry today';
}

function benefitForGoal(goal) {
  if (/book|appointment/.test(goal)) return 'Book with confidence';
  if (/sell|product|shop/.test(goal)) return 'Choose the right product faster';
  if (/demo/.test(goal)) return 'See the workflow before you commit';
  if (/volunteer/.test(goal)) return 'Find the right route to help';
  return 'Get a clear next step';
}



function schemaForPage(page, brief, domain, content) {
  const faqs = content?.faqs || [];
  const base = page === 'Home'
    ? [localBusinessSchema(brief, domain), { '@context': 'https://schema.org', '@type': 'WebSite', name: brief.business_name, url: `https://${domain}` }]
    : /faq/i.test(page) && faqs.length
      ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqs.map((faq) => ({ '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a } })) }
      : /contact/i.test(page)
        ? [localBusinessSchema(brief, domain), { '@context': 'https://schema.org', '@type': 'ContactPage', name: `${brief.business_name} contact` }]
        : localBusinessSchema(brief, domain);
  return JSON.stringify(base).replace(/</g, '\\u003c');
}

function localBusinessSchema(brief, domain) {
  const type = { care: /dental/i.test(brief.industry) ? 'Dentist' : 'MedicalBusiness', hospitality: /bakery/i.test(brief.industry) ? 'Bakery' : 'Restaurant', commerce: 'Store', professional: 'ProfessionalService', fitness: 'ExerciseGym', education: 'EducationalOrganization', trades: 'HomeAndConstructionBusiness', property: 'RealEstateAgent' }[brief.project_nature] || 'LocalBusiness';
  return { '@context': 'https://schema.org', '@type': type, name: brief.business_name, url: domain ? `https://${domain}` : undefined, address: brief.address || undefined, telephone: brief.contact_phone || undefined, email: brief.contact_email, areaServed: brief.location || undefined, openingHours: brief.hours || undefined };
}

function navHtml(pages) {
  return pages.map((page) => `<a href="${slugForPage(page)}">${esc(page)}</a>`).join('');
}

function serviceHref(brief) {
  const servicePage = brief.pages.find((page) => page !== 'Home' && /service|treatment|menu|bakes|product|shop|collection|classes|courses|features|work|properties/i.test(page));
  return slugForPage(servicePage || brief.pages.find((page) => page !== 'Home' && !/contact/i.test(page)) || 'Contact');
}

function footerHtml(brief, content = {}) {
  const contact = [brief.address, brief.contact_phone, brief.contact_email].filter(Boolean).map(esc).join(' · ');
  const keywords = (content.seoKeywords || []).filter((keyword) => keyword && keyword.split(' ').length <= 4);
  return `<footer class="site-footer"><div><strong>${esc(brief.business_name)}</strong><p>${contact}</p>${keywords.length ? `<p class="small">${keywords.map((keyword) => esc(titleCase(keyword))).join(' · ')}</p>` : ''}<p class="small">© ${new Date().getFullYear()} ${esc(brief.business_name)}. All rights reserved.</p></div><nav aria-label="Footer navigation">${navHtml(brief.pages)}<a href="privacy.html">Privacy</a></nav></footer>`;
}

function fontshareLink(design) {
  const fonts = [design.tokens.fonts.display, design.tokens.fonts.body].map((font) => `f[]=${encodeURIComponent(font.toLowerCase().replace(/\s+/g, '-'))}@400,500,700`).join('&');
  return `<link rel="preconnect" href="https://api.fontshare.com"><link rel="stylesheet" href="https://api.fontshare.com/v2/css?${fonts}&display=swap">`;
}

function imageFor(site, purpose) {
  return site.assetMap[purpose] || site.assetMap.heroSeed || site.assetMap.hero || 'assets/images/01-hero.svg';
}

function slugForPage(page) {
  const slug = slugify(String(page || 'page'), { lower: true, strict: true });
  return slug === 'home' || slug === 'index' ? 'index.html' : `${slug}.html`;
}

function titleCase(value) {
  return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).trim();
}

function compactWords(text, max) {
  return String(text).split(/\s+/).filter(Boolean).slice(0, max).join(' ');
}

function audienceShort(audience) {
  return String(audience || 'your audience').split(',')[0].slice(0, 40);
}

function fitMetaTitle(value, suffix = '') {
  let clean = String(value).replace(/\s+/g, ' ').trim();
  if (clean.length < 45 && suffix && !clean.includes(suffix)) clean = `${clean} | ${suffix}`;
  if (clean.length > 60) {
    const parts = clean.split(' | ');
    while (parts.length > 1 && parts.join(' | ').length > 60) parts.pop();
    clean = parts.join(' | ');
    if (clean.length > 60) clean = `${clean.slice(0, 59).replace(/\s+\S*$/, '')}…`;
  }
  return clean;
}

function decodeEntities(value) {
  return String(value).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
}

function fitMetaDescription(value) {
  // Typographic apostrophes avoid HTML escaping (&#39;) inflating the rendered length.
  let clean = String(value).replace(/\s+/g, ' ').replace(/'/g, '’').trim();
  const pads = [' Get in touch today for friendly, expert help.', ' Book online or call us to find out more.', ' We look forward to hearing from you.'];
  for (const pad of pads) if (clean.length < 140) clean = `${clean}${pad}`;
  if (clean.length > 158) {
    clean = clean.slice(0, 157);
    clean = `${clean.slice(0, clean.lastIndexOf(' ')).replace(/[,;:.\s]+$/, '')}.`;
  }
  return clean;
}

function domainSlug(value) {
  return slugify(String(value || 'my-business'), { lower: true, strict: true }).replace(/-/g, '') || 'mybusiness';
}

function snakeBriefToCamelBrief(brief, content) {
  return {
    businessName: brief.business_name,
    industry: brief.industry,
    location: brief.location || 'Local',
    tone: brief.tone,
    services: (content?.home?.services || []).map((service) => service.title),
    contactEmail: brief.contact_email,
    contactPhone: brief.contact_phone,
    address: brief.address,
    googleMapsLat: '53.4808',
    googleMapsLng: '-2.2426'
  };
}

function sitemapXml(domain, pages) {
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.concat(['privacy.html']).map((page) => `<url><loc>https://${domain}/${page === 'index.html' ? '' : page}</loc><lastmod>${today()}</lastmod></url>`).join('')}</urlset>`;
}

function sitemapContains(files, page) {
  const sitemap = files.find(([name]) => name === 'sitemap.xml')?.[1] || '';
  const slug = slugForPage(page);
  return slug === 'index.html' ? /<loc>https?:\/\/[^<]+\/<\/loc>/.test(sitemap) : sitemap.includes(slug);
}

function feedXml(brief, domain) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(brief.business_name)}</title><link>https://${domain}</link><description>${esc(brief.goal)}</description></channel></rss>`;
}

function readme(brief, domain) {
  return `# ${brief.business_name}\n\nGenerated with the staged prompt-to-site pipeline.\n\n## Deploy\n\nUpload the package to your host, point the domain \`${domain}\`, and configure form handling in \`admin/contact.php\`.\n`;
}

function researchBriefFor(brief) {
  return `# Research And Strategy

Market context: ${brief.target_audience} need fast proof that ${brief.business_name} understands ${brief.industry.toLowerCase()} expectations in ${brief.location || 'the local area'}.

Visitor objections: unclear next steps, generic copy, weak trust signals, and forms that ask for too much too early.

Conversion strategy: lead with ${brief.goal}, keep service explanations benefit-led, place contact routes after proof, and use imagery that makes the offer feel specific rather than templated.
`;
}

function pipelineContract() {
  return `# Pipeline Contract\n\n1. INPUT PARSER\n2. SITE BRIEF\n3. DESIGN ENGINE\n4. CONTENT ENGINE\n5. PAGE ARCHITECT\n6. CODE GENERATOR\n7. VALIDATOR\n8. EXPORT\n`;
}

function renderUtilityPage(brief, design, domain, title, body, pages) {
  const data = { h1: title, subheadline: body, cta: 'Return home', metaTitle: fitMetaTitle(`${title} | ${brief.business_name}`, brief.industry), metaDescription: fitMetaDescription(`${body} Visit ${brief.business_name} for a clear next step.`) };
  return renderPage({ brief, design, content: { home: { primaryCta: 'Return home' }, pages: { [title]: data }, primaryKeyword: brief.keywords[0] }, pagePlan: { page: title, slug: title === 'Privacy Policy' ? 'privacy.html' : '404.html', sections: [{ scaffold: 'hero-text-left', page: title }] }, pageData: data, site: { assetMap: {} }, domain });
}

function pagePurpose(title, brief) {
  if (title === 'Home') return `Introduce ${brief.business_name}, qualify the visitor, and drive ${brief.goal}.`;
  if (/contact/i.test(title)) return 'Make enquiry easy and low friction.';
  return `Help visitors understand ${title.toLowerCase()} before taking action.`;
}

function generatedDatabaseSql() {
  return `CREATE TABLE submissions(id INTEGER PRIMARY KEY AUTO_INCREMENT,name VARCHAR(190),email VARCHAR(190),message TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE admins(id INTEGER PRIMARY KEY AUTO_INCREMENT,email VARCHAR(190) UNIQUE,password_hash VARCHAR(255),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
INSERT INTO admins(email,password_hash) VALUES('admin@example.com','$2y$10$replaceWithGeneratedPasswordHashBeforeLaunch');`;
}

function generatedEnv() {
  return `OPENAI_API_KEY=\nGOOGLE_MAPS_API_KEY=\nDB_HOST=localhost\nDB_NAME=\nDB_USER=\nDB_PASS=\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_USER=\nSMTP_PASS=\nSMTP_FROM=\n`;
}

function adminBootstrap() {
  return `<?php session_start(); function csrf(){ if(empty($_SESSION['csrf'])) $_SESSION['csrf']=bin2hex(random_bytes(32)); return $_SESSION['csrf']; } function e($v){ return htmlspecialchars((string)$v, ENT_QUOTES, 'UTF-8'); } function demo_password_hash(){ return password_hash('change-me', PASSWORD_DEFAULT); } ?>`;
}

function adminPage(title) {
  return `<?php require __DIR__.'/bootstrap.php'; ?><!doctype html><html><head><title>${title}</title><link rel="stylesheet" href="../assets/css/style.css"></head><body><main class="section"><div class="container narrow"><h1>${title}</h1><p>CMS placeholder ready for production integration.</p></div></main></body></html>`;
}

function csrfEndpoint() {
  return `<?php require __DIR__.'/bootstrap.php'; header('Content-Type: application/json'); echo json_encode(['token'=>csrf()]);`;
}

function contactEndpoint() {
  return `<?php require __DIR__.'/bootstrap.php'; header('Location: ../contact.html?sent=1');`;
}

function newsletterEndpoint() {
  return `<?php require __DIR__.'/bootstrap.php'; header('Location: ../index.html?subscribed=1');`;
}
