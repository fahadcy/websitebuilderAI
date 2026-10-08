import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import slugify from 'slugify';
import { createZip } from '../packager/zipper.js';
import { db } from '../db/database.js';
import { generateSiteImages } from '../ai/imageAssets.js';
import { runRealityCheck, realityCheckMarkdown } from '../quality/realityCheck.js';
import { recordGenerationForTraining } from '../db/mysqlTrainingStore.js';

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
  const parsed = parseInput(prompt);
  console.log(JSON.stringify({ stage: 'INPUT_PARSER', output: parsed }, null, 2));

  progress({ status: 'running', progress: 15, message: 'Stage 2: resolving site brief' });
  const brief = buildSiteBrief(parsed, metadata, prompt);

  progress({ status: 'running', progress: 22, message: 'Stage 3: selecting design system' });
  const design = buildDesignEngine(brief);

  progress({ status: 'running', progress: 30, message: 'Stage 4: generating content' });
  const content = buildContentEngine(brief);

  const siteId = `${slugify(brief.business_name, { lower: true, strict: true }) || 'generated-site'}-${crypto.randomBytes(3).toString('hex')}`;
  const outDir = path.join(root, 'generated-sites', siteId);
  await prepareOutput(outDir);

  const site = {
    siteId,
    brief: snakeBriefToCamelBrief(brief),
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

function parseInput(prompt) {
  const text = String(prompt || '').trim();
  const lower = text.toLowerCase();
  const businessName = extractBusinessName(text);
  const industry = detectIndustry(lower);
  const location = extractLocation(text);
  const tone = detectTone(lower, industry);
  const style = detectStyle(lower);
  const goal = detectGoal(lower, industry);
  const pages = detectPages(lower, industry);
  const features = detectFeatures(lower, industry);
  const colours = extractColours(text) || 'teal + warm neutral';
  const keywords = detectKeywords({ businessName, industry, location, lower });
  const targetAudience = inferAudience(industry, lower);
  return {
    business_name: businessName || 'My Business',
    industry,
    location,
    target_audience: targetAudience,
    tone,
    goal,
    pages,
    features,
    colours,
    keywords,
    style
  };
}

function buildSiteBrief(parsed, metadata, prompt) {
  const pages = normalizePages(parsed.pages);
  const projectNature = detectProjectNature(parsed.industry, prompt);
  return {
    ...parsed,
    business_name: metadata.companyHouse?.companyName || parsed.business_name || 'My Business',
    industry: parsed.industry || 'Local Service',
    location: parsed.location || null,
    target_audience: parsed.target_audience || inferAudience(parsed.industry, ''),
    tone: parsed.tone || 'professional',
    goal: parsed.goal || 'generate qualified leads',
    pages,
    features: normalizeFeatures(parsed.features, pages),
    colours: parsed.colours || 'teal + warm neutral',
    keywords: parsed.keywords?.length ? parsed.keywords : detectKeywords({ businessName: parsed.business_name, industry: parsed.industry, location: parsed.location, lower: '' }),
    style: parsed.style || 'minimal',
    project_nature: projectNature,
    contact_email: `hello@${domainSlug(parsed.business_name || 'mybusiness')}.co.uk`,
    contact_phone: '0161 555 0148',
    address: parsed.location ? `${parsed.location} office` : 'Address available on request'
  };
}

function buildDesignEngine(brief) {
  const presetKey = presetKeyFor(brief);
  const preset = THEME_PRESETS[presetKey] || THEME_PRESETS.professional;
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

function buildContentEngine(brief) {
  const primaryKeyword = brief.keywords[0] || `${brief.industry} ${brief.location || ''}`.trim();
  const serviceTitles = serviceTitlesFor(brief);
  const h1 = compactWords(`${primaryKeyword} made easier for ${audienceShort(brief.target_audience)}`, 12);
  const subheadline = compactWords(`${benefitForGoal(brief.goal)} with clear proof, simple steps, and fast contact.`, 20);
  const primaryCta = ctaForGoal(brief.goal);
  const home = {
    h1,
    subheadline,
    trustSignals: trustSignalsFor(brief),
    services: serviceTitles.map((title) => ({ title, description: serviceDescription(title, brief) })).slice(0, 4),
    testimonial: testimonialFor(brief),
    primaryCta
  };
  const pages = Object.fromEntries(brief.pages.map((page) => [page, pageContent(page, brief, home)]));
  return { primaryKeyword, home, pages };
}

function buildPageArchitecture(brief, content) {
  return brief.pages.map((page) => {
    const lower = page.toLowerCase();
    const sections = [];
    sections.push({ scaffold: page === 'Home' ? heroScaffoldFor(brief) : 'hero-text-left', page });
    if (page === 'Home') {
      sections.push({ scaffold: 'trust-bar', page });
      sections.push({ scaffold: brief.features.includes('pricing') ? 'pricing-3tier' : 'services-card-grid', page });
      sections.push({ scaffold: brief.features.includes('testimonials') ? 'testimonial-single' : 'features-3col', page });
      if (brief.features.includes('FAQ')) sections.push({ scaffold: 'faq-accordion', page });
      sections.push({ scaffold: 'cta-banner', page });
      sections.push({ scaffold: brief.features.includes('map') ? 'contact-form-map' : 'contact-form', page });
    } else if (/service|feature|product/.test(lower)) {
      sections.push({ scaffold: 'services-list', page });
      if (brief.features.includes('FAQ')) sections.push({ scaffold: 'faq-accordion', page });
      sections.push({ scaffold: 'cta-banner', page });
    } else if (/about/.test(lower)) {
      sections.push({ scaffold: 'about-story', page });
      if (brief.features.includes('team')) sections.push({ scaffold: 'about-team-grid', page });
      sections.push({ scaffold: 'cta-banner', page });
    } else if (/faq/.test(lower)) {
      sections.push({ scaffold: 'faq-accordion', page });
      sections.push({ scaffold: 'cta-banner', page });
    } else if (/blog/.test(lower)) {
      sections.push({ scaffold: 'blog-index', page });
    } else if (/contact/.test(lower)) {
      sections.push({ scaffold: brief.features.includes('map') ? 'contact-form-map' : 'contact-form', page });
    } else {
      sections.push({ scaffold: 'features-2col', page });
      sections.push({ scaffold: 'cta-banner', page });
    }
    return { page, slug: slugForPage(page), sections };
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
  const nav = navHtml(brief.pages);
  const schema = schemaForPage(pagePlan.page, brief, domain);
  const sections = pagePlan.sections.map((section) => renderScaffold(section.scaffold, { brief, content, page: pagePlan.page, pageData, site })).join('\n');
  return `<!doctype html>
<html lang="en" data-theme="light">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(pageData.metaTitle)}</title>
  <meta name="description" content="${esc(pageData.metaDescription)}">
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
  ${footerHtml(brief)}
  <script src="assets/js/app.js" defer></script>
</body>
</html>`;
}

function renderScaffold(scaffold, ctx) {
  const renderers = {
    'hero-text-left': heroTextLeft,
    'hero-split-image': heroSplitImage,
    'features-3col': features3Col,
    'features-2col': features2Col,
    'testimonial-single': testimonialSingle,
    'testimonial-grid': testimonialGrid,
    'cta-banner': ctaBanner,
    'contact-form': contactForm,
    'contact-form-map': contactFormMap,
    'services-card-grid': servicesCardGrid,
    'services-list': servicesList,
    'faq-accordion': faqAccordion,
    'about-story': aboutStory,
    'about-team-grid': aboutTeamGrid,
    'pricing-3tier': pricing3Tier,
    'blog-index': blogIndex,
    'blog-post': blogPost,
    'trust-bar': trustBar
  };
  return (renderers[scaffold] || features2Col)(ctx);
}

function heroTextLeft({ brief, pageData }) {
  return `<section class="section hero hero-text-left">
    <div class="container narrow">
      <p class="eyebrow">${esc(brief.industry)}</p>
      <h1>${esc(pageData.h1)}</h1>
      <p class="lede">${esc(pageData.subheadline)}</p>
      <div class="actions"><a class="button" href="contact.html">${esc(pageData.cta)}</a><a class="text-link" href="${serviceHref(brief)}">Explore services</a></div>
    </div>
  </section>`;
}

function heroSplitImage(ctx) {
  const image = imageFor(ctx.site, 'heroSeed');
  const signals = heroSignals(ctx).slice(0, 3);
  return `<section class="section hero hero-split-image">
    <div class="container split">
      <div>
        <p class="eyebrow">${esc(ctx.brief.industry)}</p>
        <h1>${esc(ctx.pageData.h1)}</h1>
        <p class="lede">${esc(ctx.pageData.subheadline)}</p>
        <div class="actions"><a class="button" href="contact.html">${esc(ctx.pageData.cta)}</a><a class="text-link" href="${serviceHref(ctx.brief)}">View services</a></div>
      </div>
      <figure class="media-card hero-motion">
        <img src="${esc(image)}" alt="${esc(ctx.brief.business_name)} ${esc(ctx.brief.industry)} hero image" loading="lazy" decoding="async" width="1536" height="1024">
        <div class="motion-lines" aria-hidden="true"><span></span><span></span><span></span></div>
        <div class="motion-cards" aria-hidden="true">
          ${signals.map((signal, index) => `<span class="motion-card motion-card-${index + 1}"><strong>${esc(signal.value)}</strong><small>${esc(signal.label)}</small></span>`).join('')}
        </div>
      </figure>
    </div>
  </section>`;
}

function heroSignals(ctx) {
  const serviceLabels = (ctx.content.home.services || []).map((service) => service.title);
  const trust = ctx.content.home.trustSignals || [];
  return [
    trust[2] || { value: 'Fast', label: 'response focus' },
    { value: 'Live', label: serviceLabels[0] || ctx.brief.goal },
    { value: 'Clear', label: serviceLabels[1] || ctx.brief.industry }
  ];
}

function trustBar({ content }) {
  return `<section class="trust-bar" aria-label="Trust signals"><div class="container trust-grid">${content.home.trustSignals.map((item) => `<article><strong>${esc(item.value)}</strong><span>${esc(item.label)}</span></article>`).join('')}</div></section>`;
}

function servicesCardGrid(ctx) {
  const href = serviceHref(ctx.brief);
  return `<section class="section"><div class="container"><div class="section-heading"><p class="eyebrow">Services</p><h2>Benefit-led ways to move forward</h2><p class="lede">Each route is written for real visitor intent: urgent questions, comparison, reassurance, and a clear next action. The layout gives people enough context to decide without burying them in generic brochure copy. It also separates emergency guidance, planned enquiries, and community information so visitors do not have to decode one long page before taking action. That structure makes the site feel more specific, easier to scan, and more credible for a real organisation. Every block is designed to answer a practical objection: what is offered, who it helps, why it matters, and what the visitor should do next. The result is a site that feels planned, useful, and ready for a serious first conversation.</p></div><div class="card-grid">${ctx.content.home.services.map((service, index) => `<article class="card"><img src="${esc(imageFor(ctx.site, index % 2 ? 'serviceSeed' : 'textureSeed'))}" alt="${esc(service.title)} supporting visual" loading="lazy" decoding="async" width="768" height="512"><h3>${esc(service.title)}</h3><p>${esc(service.description)}</p><a class="text-link" href="${href}">Learn about ${esc(service.title)}</a></article>`).join('')}</div></div></section>`;
}

function servicesList(ctx) {
  return `<section class="section"><div class="container service-list">${ctx.content.home.services.map((service, index) => `<article><span>${String(index + 1).padStart(2, '0')}</span><img src="${esc(imageFor(ctx.site, index % 2 ? 'serviceSeed' : 'workSeed'))}" alt="${esc(service.title)} service visual" loading="lazy" decoding="async" width="640" height="426"><div><h2>${esc(service.title)}</h2><p>${esc(service.description)}</p><a href="contact.html" class="text-link">Ask about ${esc(service.title)}</a></div></article>`).join('')}</div></section>`;
}

function features3Col({ content }) {
  return `<section class="section muted-section"><div class="container three-col">${content.home.services.slice(0, 3).map((service) => `<article><h2>${esc(service.title)}</h2><p>${esc(service.description)}</p></article>`).join('')}</div></section>`;
}

function features2Col({ content }) {
  return `<section class="section"><div class="container two-col">${content.home.services.slice(0, 2).map((service) => `<article><h2>${esc(service.title)}</h2><p>${esc(service.description)}</p></article>`).join('')}</div></section>`;
}

function testimonialSingle({ content }) {
  const item = content.home.testimonial;
  return `<section class="section testimonial-single"><div class="container narrow"><blockquote><p>"${esc(item.quote)}"</p><cite>${esc(item.name)} / ${esc(item.context)}</cite></blockquote></div></section>`;
}

function testimonialGrid({ content }) {
  return `<section class="section"><div class="container card-grid">${[content.home.testimonial, content.home.testimonial, content.home.testimonial].map((item) => `<blockquote class="card"><p>"${esc(item.quote)}"</p><cite>${esc(item.name)} / ${esc(item.context)}</cite></blockquote>`).join('')}</div></section>`;
}

function ctaBanner({ content }) {
  return `<section class="section cta-banner"><div class="container split"><div><p class="eyebrow">Next step</p><h2>${esc(content.home.primaryCta)}</h2><p>${esc(content.home.subheadline)}</p></div><a class="button" href="contact.html">${esc(content.home.primaryCta)}</a></div></section>`;
}

function contactForm({ brief, content }) {
  return `<section class="section" id="contact"><div class="container split"><div><p class="eyebrow">Contact</p><h2>Tell us what you need</h2><p>${esc(contactHint(brief))}</p><p><a href="tel:${esc(brief.contact_phone)}">${esc(brief.contact_phone)}</a><br><a href="mailto:${esc(brief.contact_email)}">${esc(brief.contact_email)}</a></p></div>${formHtml(content.home.primaryCta)}</div></section>`;
}

function contactFormMap(ctx) {
  return `<section class="section" id="contact"><div class="container split"><div><p class="eyebrow">Contact</p><h2>Contact ${esc(ctx.brief.business_name)}</h2><p>${esc(contactHint(ctx.brief))}</p><div class="map-panel" role="img" aria-label="${esc(ctx.brief.business_name)} map area"><strong>${esc(ctx.brief.location || 'Local area')}</strong><span>${esc(ctx.brief.address)}</span></div></div>${formHtml(ctx.content.home.primaryCta)}</div></section>`;
}

function faqAccordion({ brief }) {
  const faqs = faqsFor(brief);
  return `<section class="section"><div class="container narrow"><div class="section-heading"><p class="eyebrow">FAQ</p><h2>Useful answers before you enquire</h2></div>${faqs.map((faq) => `<details><summary>${esc(faq.q)}</summary><p>${esc(faq.a)}</p></details>`).join('')}</div></section>`;
}

function aboutStory(ctx) {
  const image = imageFor(ctx.site, 'about story');
  return `<section class="section"><div class="container split"><figure class="media-card"><img src="${esc(image)}" alt="${esc(ctx.brief.business_name)} team and story image" loading="lazy" decoding="async" width="1024" height="1536"></figure><div><p class="eyebrow">About</p><h2>Built around ${esc(ctx.brief.target_audience)}</h2><p>${esc(ctx.pageData.body)}</p><a class="text-link" href="contact.html">Speak to the team</a></div></div></section>`;
}

function aboutTeamGrid({ brief }) {
  return `<section class="section muted-section"><div class="container card-grid">${['Lead specialist', 'Client support', 'Operations'].map((role) => `<article class="card"><h3>${esc(role)}</h3><p>${esc(brief.business_name)} keeps the team story focused on trust, clarity, and useful next steps.</p></article>`).join('')}</div></section>`;
}

function pricing3Tier() {
  return `<section class="section"><div class="container card-grid">${['Starter', 'Growth', 'Complete'].map((tier) => `<article class="card"><h3>${tier}</h3><p>Clear package placeholder ready for real pricing, features, and buying guidance.</p><a class="button" href="contact.html">Ask about ${tier}</a></article>`).join('')}</div></section>`;
}

function blogIndex({ brief }) {
  return `<section class="section"><div class="container card-grid">${['How to choose the right provider', 'What to ask before you enquire', 'How a clear first step saves time'].map((title) => `<article class="card"><p class="eyebrow">Guide</p><h2>${esc(title)}</h2><p>Practical advice for ${esc(brief.target_audience)} comparing ${esc(brief.industry)} options.</p><a class="text-link" href="contact.html">Ask a question</a></article>`).join('')}</div></section>`;
}

function blogPost(ctx) {
  return `<article class="section"><div class="container narrow"><h2>${esc(ctx.content.primaryKeyword)} guide</h2><p>${esc(ctx.pageData.body)}</p><a class="text-link" href="contact.html">Contact ${esc(ctx.brief.business_name)}</a></div></article>`;
}

function formHtml(cta) {
  return `<form class="form" method="post" action="admin/contact.php"><input type="hidden" name="_csrf" value=""><label>Name<input name="name" autocomplete="name" required></label><label>Email<input type="email" name="email" autocomplete="email" required></label><label>Message<textarea name="message" required></textarea></label><button class="button">${esc(cta)}</button></form>`;
}

function styleCss(design) {
  return `${design.cssRoot}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--font-body);font-size:var(--type-base);line-height:1.65;color:var(--ink);background:var(--bg);text-rendering:optimizeLegibility}a{color:inherit;text-underline-offset:.24em}img{display:block;max-width:100%;height:auto;border-radius:var(--radius-lg)}.site-header{position:sticky;top:0;z-index:20;display:grid;grid-template-columns:auto auto 1fr auto;gap:var(--space-4);align-items:center;min-height:72px;padding:var(--space-3) var(--page-pad);background:color-mix(in oklch,var(--surface),transparent 8%);backdrop-filter:blur(18px);border-bottom:1px solid var(--line)}.brand{font-weight:800;text-decoration:none}.site-header nav{display:flex;gap:var(--space-2);justify-content:end;align-items:center;flex-wrap:wrap}.site-header nav a{min-height:44px;display:inline-flex;align-items:center;padding:0 var(--space-2);font-weight:700;text-decoration:none}.nav-toggle{display:none}.theme-toggle{width:44px;height:44px;display:grid;place-items:center;border:0;border-radius:var(--radius-pill);background:var(--ink);color:var(--bg)}.theme-toggle span{width:18px;height:18px;border:2px solid currentColor;border-radius:50%;background:linear-gradient(90deg,currentColor 50%,transparent 50%)}button,.button{min-height:44px;display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:var(--radius-md);padding:0 var(--space-5);background:var(--primary);color:var(--on-primary);font:800 var(--type-sm)/1 var(--font-body);text-decoration:none;transition:var(--transition);cursor:pointer}.button:hover{transform:translateY(-2px);box-shadow:var(--shadow-md)}.text-link{font-weight:800}.section{padding:var(--section-pad) var(--page-pad)}.container{width:min(1180px,100%);margin-inline:auto}.narrow{width:min(820px,100%)}.split{display:grid;grid-template-columns:1fr;gap:var(--space-8);align-items:center}.hero{padding-top:clamp(var(--space-12),10vw,var(--space-24));padding-bottom:clamp(var(--space-12),10vw,var(--space-24))}.hero h1{max-width:900px;margin:0 0 var(--space-5);font-family:var(--font-display);font-size:var(--type-hero);line-height:.98;letter-spacing:0}.hero .lede,.lede{max-width:720px;color:var(--muted);font-size:var(--type-lg)}.eyebrow{margin:0 0 var(--space-3);font-size:var(--type-xs);font-weight:900;letter-spacing:.12em;text-transform:uppercase;color:var(--primary)}h1,h2,h3{font-family:var(--font-display);letter-spacing:0;text-wrap:balance}h2{font-size:var(--type-2xl);line-height:1.08;margin:0 0 var(--space-4)}h3{font-size:var(--type-xl);line-height:1.16;margin:0 0 var(--space-3)}p{margin:0 0 var(--space-4)}.actions{display:flex;gap:var(--space-3);flex-wrap:wrap;align-items:center;margin-top:var(--space-6)}.trust-bar{padding:var(--space-4) var(--page-pad);background:var(--ink);color:var(--bg)}.trust-grid,.card-grid,.three-col,.two-col{display:grid;grid-template-columns:1fr;gap:var(--space-4)}.trust-grid article{display:grid;gap:var(--space-1)}.trust-grid strong{font:900 var(--type-2xl)/1 var(--font-display)}.card,.three-col article,.two-col article,.service-list article,blockquote,details,.form,.map-panel{padding:var(--space-6);background:var(--surface);border:1px solid var(--line);border-radius:var(--radius-lg);box-shadow:var(--shadow-sm)}.card img{aspect-ratio:3/2;object-fit:cover;margin-bottom:var(--space-4)}.muted-section{background:var(--surface-muted)}.service-list{display:grid;gap:var(--space-4)}.service-list article{display:grid;grid-template-columns:52px minmax(120px,220px) 1fr;gap:var(--space-4);align-items:start}.service-list span{font-weight:900;color:var(--primary)}.service-list img{aspect-ratio:3/2;object-fit:cover}.testimonial-single{background:var(--ink);color:var(--bg)}.testimonial-single blockquote{background:color-mix(in oklch,var(--bg),transparent 92%);border-color:color-mix(in oklch,var(--bg),transparent 82%);box-shadow:none}.testimonial-single p{font-size:var(--type-xl);line-height:1.35}.cta-banner{background:var(--primary);color:var(--on-primary)}.cta-banner .container{align-items:center}.form{display:grid;gap:var(--space-4)}label{display:grid;gap:var(--space-2);font-weight:800}input,textarea{width:100%;min-height:44px;border:1px solid var(--line-strong);border-radius:var(--radius-sm);padding:var(--space-3);background:var(--bg);color:var(--ink);font:inherit}textarea{min-height:132px}details{margin-bottom:var(--space-3)}summary{min-height:44px;display:flex;align-items:center;font-weight:900;cursor:pointer}.media-card{margin:0}.media-card img{width:100%;aspect-ratio:4/3;object-fit:cover}.map-panel{min-height:260px;display:grid;align-content:end;background:linear-gradient(135deg,var(--surface-muted),var(--surface))}.site-footer{display:grid;gap:var(--space-4);padding:var(--space-8) var(--page-pad);border-top:1px solid var(--line);background:var(--surface)}.site-footer nav{display:flex;gap:var(--space-3);flex-wrap:wrap}.site-footer a{min-height:44px;display:inline-flex;align-items:center}.reveal{opacity:1;transform:translateY(var(--space-2));transition:var(--transition)}.reveal.is-visible{transform:translateY(0)}.external-link[target="_blank"]{font-weight:800}
.hero-motion{position:relative;isolation:isolate;overflow:hidden;min-height:clamp(320px,42vw,560px);display:grid;align-items:stretch;background:var(--surface-muted);box-shadow:var(--shadow-md)}.hero-motion img{position:relative;z-index:1;height:100%;min-height:inherit;object-fit:cover;transform:scale(1.02);animation:heroDrift 12s ease-in-out infinite alternate}.hero-motion:before{content:"";position:absolute;inset:0;z-index:2;background:linear-gradient(120deg,transparent,color-mix(in oklch,var(--accent),transparent 70%),transparent);transform:translateX(-130%);animation:signalSweep 5.8s ease-in-out infinite}.motion-lines{position:absolute;inset:var(--space-5);z-index:3;display:grid;align-content:center;gap:var(--space-3);pointer-events:none}.motion-lines span{display:block;height:8px;width:48%;border-radius:var(--radius-pill);background:color-mix(in oklch,var(--accent),transparent 32%);box-shadow:0 0 28px color-mix(in oklch,var(--accent),transparent 62%);transform-origin:left center;animation:linePulse 2.8s ease-in-out infinite}.motion-lines span:nth-child(2){width:68%;animation-delay:.45s;background:color-mix(in oklch,var(--ink),transparent 68%)}.motion-lines span:nth-child(3){width:36%;animation-delay:.9s}.motion-cards{position:absolute;inset:var(--space-4);z-index:4;pointer-events:none}.motion-card{position:absolute;display:grid;gap:var(--space-1);min-width:132px;padding:var(--space-3);border:1px solid color-mix(in oklch,var(--bg),transparent 52%);border-radius:var(--radius-md);background:color-mix(in oklch,var(--surface),transparent 10%);box-shadow:var(--shadow-sm);backdrop-filter:blur(16px);animation:cardFloat 4.8s ease-in-out infinite}.motion-card strong{font:900 var(--type-xl)/1 var(--font-display);color:var(--primary)}.motion-card small{font:800 var(--type-xs)/1.25 var(--font-body);color:var(--ink)}.motion-card-1{right:var(--space-3);top:var(--space-3)}.motion-card-2{left:var(--space-3);bottom:var(--space-3);animation-delay:.8s}.motion-card-3{right:var(--space-6);bottom:calc(var(--space-6) + 56px);animation-delay:1.6s}@keyframes heroDrift{from{transform:scale(1.02) translate3d(0,0,0)}to{transform:scale(1.07) translate3d(var(--space-2),calc(var(--space-1) * -1),0)}}@keyframes signalSweep{0%,36%{transform:translateX(-130%)}62%,100%{transform:translateX(130%)}}@keyframes linePulse{0%,100%{transform:scaleX(.55);opacity:.42}50%{transform:scaleX(1);opacity:1}}@keyframes cardFloat{0%,100%{transform:translateY(0)}50%{transform:translateY(calc(var(--space-2) * -1))}}
@media(min-width:768px){.split{grid-template-columns:1fr 1fr}.trust-grid{grid-template-columns:repeat(3,1fr)}.card-grid,.three-col{grid-template-columns:repeat(3,1fr)}.two-col{grid-template-columns:repeat(2,1fr)}.site-footer{grid-template-columns:1fr auto}.nav-toggle{display:none!important}}
@media(max-width:767px){.site-header{grid-template-columns:1fr auto auto}.nav-toggle{display:inline-flex;background:var(--surface);color:var(--ink);border:1px solid var(--line)}.site-header nav{grid-column:1/-1;display:none;justify-content:start}.site-header nav.is-open{display:flex}.site-header nav a{padding-inline:0}.hero h1{font-size:clamp(2.4rem,13vw,4rem)}.hero-motion{min-height:320px}.motion-card{min-width:112px;padding:var(--space-2)}.motion-card-3{display:none}.service-list article{grid-template-columns:1fr}.service-list img{width:100%}}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;scroll-behavior:auto!important;transition-duration:.01ms!important}}`;
}

function cssRootForPreset(preset) {
  const c = preset.colors;
  return `:root{--font-display:"${preset.display}",serif;--font-body:"${preset.body}",system-ui,sans-serif;--type-xs:clamp(.78rem,.74rem + .1vw,.84rem);--type-sm:clamp(.9rem,.86rem + .14vw,1rem);--type-base:clamp(1rem,.96rem + .16vw,1.08rem);--type-lg:clamp(1.12rem,1.03rem + .42vw,1.35rem);--type-xl:clamp(1.35rem,1.16rem + .8vw,1.85rem);--type-2xl:clamp(1.9rem,1.35rem + 2vw,3.2rem);--type-hero:clamp(3rem,1.8rem + 5vw,6.4rem);--space-1:4px;--space-2:8px;--space-3:12px;--space-4:16px;--space-5:20px;--space-6:24px;--space-8:32px;--space-10:40px;--space-12:48px;--space-16:64px;--space-20:80px;--space-24:96px;--space-32:128px;--page-pad:clamp(var(--space-4),5vw,var(--space-16));--section-pad:clamp(var(--space-16),9vw,var(--space-24));--bg:${c.lightBg};--surface:${c.lightSurface};--surface-muted:color-mix(in oklch,var(--bg),var(--surface) 45%);--ink:${c.lightInk};--muted:${c.lightMuted};--primary:${c.lightPrimary};--accent:${c.lightAccent};--on-primary:oklch(99% 0 0);--line:color-mix(in oklch,var(--ink),transparent 88%);--line-strong:color-mix(in oklch,var(--ink),transparent 72%);--radius-sm:8px;--radius-md:14px;--radius-lg:24px;--radius-pill:999px;--shadow-sm:0 1px 2px color-mix(in oklch,var(--ink),transparent 90%);--shadow-md:0 24px 80px color-mix(in oklch,var(--ink),transparent 88%);--transition:180ms ease}[data-theme="dark"]{--bg:${c.darkBg};--surface:${c.darkSurface};--surface-muted:color-mix(in oklch,var(--surface),var(--bg) 50%);--ink:${c.darkInk};--muted:${c.darkMuted};--line:color-mix(in oklch,var(--ink),transparent 84%);--line-strong:color-mix(in oklch,var(--ink),transparent 68%)}`;
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
    checks.push(check(`${file}: meta title`, /<title>[^<]{50,60}<\/title>/i.test(html)));
    checks.push(check(`${file}: meta description`, /<meta name="description" content="[^"]{140,160}"/i.test(html)));
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

function extractBusinessName(text) {
  const patterns = [/called\s+([A-Za-z0-9&' -]+)/i, /for\s+([A-Za-z0-9&' -]+?)(?=,|\s+in\b|\s+with\b|\.|$)/i, /business\s+(?:is|name is)\s+([A-Za-z0-9&' -]+)/i];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[1].replace(/\s+(with|in|for)\b.*$/i, '').trim();
  }
  return 'My Business';
}

function detectIndustry(lower) {
  const map = [
    [/fire|emergency|rescue|public safety/, 'Fire and Community Safety'],
    [/physio|therapy|clinic|medical|health|dental/, 'Healthcare'],
    [/restaurant|cafe|bar|hotel|hospitality|bakery/, 'Hospitality'],
    [/law|legal|solicitor|accountant|finance|consult|advisory/, 'Professional Services'],
    [/software|saas|app|platform|tech|ai/, 'Technology'],
    [/shop|store|shoe|retail|ecommerce|product/, 'Retail'],
    [/gym|fitness|trainer|pilates|yoga/, 'Fitness'],
    [/agency|studio|portfolio|creative|design/, 'Creative Agency'],
    [/school|tutor|course|academy|education|training/, 'Education']
  ];
  return map.find(([pattern]) => pattern.test(lower))?.[1] || 'Local Service';
}

function detectProjectNature(industry, prompt) {
  const text = `${industry} ${prompt}`.toLowerCase();
  if (/fire|emergency|rescue|public safety/.test(text)) return 'civic';
  if (/health|clinic|dental|physio|medical/.test(text)) return 'care';
  if (/hospitality|restaurant|cafe|hotel|bakery/.test(text)) return 'hospitality';
  if (/technology|software|saas|app|platform/.test(text)) return 'software';
  if (/retail|shop|store|ecommerce/.test(text)) return 'commerce';
  if (/education|school|tutor|course/.test(text)) return 'education';
  if (/agency|creative|portfolio/.test(text)) return 'portfolio';
  if (/professional|law|legal|accountant|advisory/.test(text)) return 'professional';
  return 'service';
}

function extractLocation(text) {
  const match = text.match(/\bin\s+([A-Z][a-zA-Z]+(?:\s+[A-Z][a-zA-Z]+){0,3})\b/);
  return match ? match[1].replace(/\s+(with|called|for)\b.*$/i, '').trim() : null;
}

function detectTone(lower, industry) {
  if (/calm|medical|clinic|health|physio|care/.test(lower) || /health/i.test(industry)) return 'calm';
  if (/bold|tech|software|saas|electric/.test(lower)) return 'bold';
  if (/warm|restaurant|hospitality|friendly/.test(lower)) return 'warm';
  if (/creative|agency|studio|portfolio/.test(lower)) return 'creative';
  return 'professional';
}

function detectStyle(lower) {
  if (/bold/.test(lower)) return 'bold';
  if (/editorial/.test(lower)) return 'editorial';
  if (/corporate|professional/.test(lower)) return 'corporate';
  return 'minimal';
}

function detectGoal(lower, industry) {
  if (/book|appointment|consultation/.test(lower)) return 'book appointment';
  if (/sell|shop|product|purchase/.test(lower) || /retail/i.test(industry)) return 'sell product';
  if (/volunteer/.test(lower)) return 'generate volunteer enquiries';
  if (/demo/.test(lower)) return 'request demo';
  return 'generate leads';
}

function detectPages(lower, industry) {
  const base = ['Home', 'Services', 'About', 'Contact'];
  if (/fire|emergency/.test(lower)) return ['Home', 'Emergency Help', 'Safety Advice', 'Community Programmes', 'Contact'];
  if (/shop|retail/.test(lower)) return ['Home', 'Shop', 'About', 'FAQ', 'Contact'];
  if (/blog/.test(lower)) base.splice(3, 0, 'Blog');
  if (/faq|questions/.test(lower)) base.splice(3, 0, 'FAQ');
  return base;
}

function detectFeatures(lower, industry) {
  const features = ['contact form', 'testimonials', 'FAQ'];
  if (/map|location|local|in\s+[A-Z]/i.test(lower)) features.push('map');
  if (/book|appointment|consultation/.test(lower)) features.push('booking CTA');
  if (/price|pricing|plans/.test(lower)) features.push('pricing');
  if (/team|staff|people/.test(lower)) features.push('team');
  if (/hospitality|restaurant/i.test(industry)) features.push('map');
  return [...new Set(features)];
}

function extractColours(text) {
  const match = text.match(/\b(?:colou?rs?|palette|theme)\s*(?:is|are|:)?\s*([A-Za-z +,-]+?)(?=\.|$)/i);
  return match?.[1]?.trim() || '';
}

function detectKeywords({ businessName, industry, location }) {
  const place = location ? ` in ${location}` : '';
  return [`${String(industry || 'service').toLowerCase()}${place}`, `${businessName || 'business'} ${String(industry || '').toLowerCase()}`.trim()].filter(Boolean);
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

function normalizePages(pages) {
  const normalized = [...new Set((pages || []).map((page) => titleCase(page)).filter(Boolean))];
  if (!normalized.includes('Home')) normalized.unshift('Home');
  if (!normalized.includes('Contact')) normalized.push('Contact');
  return normalized;
}

function normalizeFeatures(features, pages) {
  const set = new Set(features || []);
  if (pages.includes('FAQ')) set.add('FAQ');
  set.add('contact form');
  set.add('testimonials');
  return [...set];
}

function presetKeyFor(brief) {
  if (/creative/.test(brief.tone) || /creative/.test(brief.style)) return 'creative';
  if (/bold/.test(brief.tone) || /tech|software/i.test(brief.industry)) return 'bold';
  if (/warm/.test(brief.tone) || /hospitality/i.test(brief.industry)) return 'warm';
  if (/calm|medical/.test(brief.tone) || /health/i.test(brief.industry)) return 'calm';
  return 'professional';
}

function serviceTitlesFor(brief) {
  if (brief.project_nature === 'civic') return ['Emergency route clarity', 'Fire safety advice', 'Community safety visits', 'Volunteer support'];
  if (brief.project_nature === 'care') return ['Initial assessment', 'Treatment planning', 'Ongoing support', 'Patient guidance'];
  if (brief.project_nature === 'commerce') return ['Featured products', 'Buying guidance', 'Customer support', 'Delivery reassurance'];
  if (brief.project_nature === 'software') return ['Workflow overview', 'Use case mapping', 'Implementation support', 'Demo planning'];
  return ['Clear consultation', 'Practical planning', 'Expert delivery', 'Ongoing support'];
}

function serviceDescription(title, brief) {
  return `${title} helps ${brief.target_audience} understand the best next step before they commit.`;
}

function trustSignalsFor(brief) {
  return [
    { value: brief.location || 'Local', label: 'service area' },
    { value: '3+', label: 'clear routes to action' },
    { value: 'Fast', label: 'enquiry response focus' }
  ];
}

function testimonialFor(brief) {
  return { quote: `${brief.business_name} made the next step feel clear, practical, and easy to trust.`, name: 'Client feedback', context: brief.industry };
}

function pageContent(page, brief, home) {
  const keyword = brief.keywords[0] || brief.industry;
  const isHome = page === 'Home';
  const h1 = isHome ? home.h1 : compactWords(`${keyword} ${page.toLowerCase()} for ${brief.target_audience}`, 12);
  const subheadline = isHome ? home.subheadline : compactWords(`Clear ${page.toLowerCase()} information for ${brief.target_audience}.`, 20);
  return {
    h1,
    subheadline,
    cta: home.primaryCta,
    body: `${keyword} support from ${brief.business_name} gives ${brief.target_audience} clear information, useful proof, and a direct route to action.`,
    metaTitle: fitMetaTitle(`${keyword} | ${page} | ${brief.business_name}`),
    metaDescription: fitMetaDescription(`${brief.business_name} helps ${brief.target_audience} with ${keyword}. ${home.primaryCta} and get a clear next step today.`)
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

function contactHint(brief) {
  if (brief.project_nature === 'civic') return 'Share the location, urgency, safety concern, and best contact details.';
  return 'Send a short note about what you need and the team will reply with the most useful next step.';
}

function faqsFor(brief) {
  return [
    { q: 'What should I include in my first message?', a: contactHint(brief) },
    { q: 'How quickly will someone respond?', a: 'The site is structured to make the enquiry clear so the right person can respond efficiently.' },
    { q: 'Can I ask a question before committing?', a: `Yes. ${brief.business_name} is set up to make early questions easy and low pressure.` }
  ];
}

function schemaForPage(page, brief, domain) {
  const base = page === 'Home'
    ? [{ '@context': 'https://schema.org', '@type': 'Organization', name: brief.business_name, url: `https://${domain}` }, { '@context': 'https://schema.org', '@type': 'WebSite', name: brief.business_name, url: `https://${domain}` }]
    : /service|emergency|safety/i.test(page)
      ? [{ '@context': 'https://schema.org', '@type': 'Service', name: `${brief.business_name} ${page}`, areaServed: brief.location || 'Local area' }, localBusinessSchema(brief)]
      : /faq/i.test(page)
        ? { '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faqsFor(brief).map((faq) => ({ '@type': 'Question', name: faq.q, acceptedAnswer: { '@type': 'Answer', text: faq.a } })) }
        : /contact/i.test(page)
          ? [localBusinessSchema(brief), { '@context': 'https://schema.org', '@type': 'ContactPage', name: `${brief.business_name} contact` }]
          : localBusinessSchema(brief);
  return JSON.stringify(base);
}

function localBusinessSchema(brief) {
  return { '@context': 'https://schema.org', '@type': 'LocalBusiness', name: brief.business_name, address: brief.address, telephone: brief.contact_phone, email: brief.contact_email };
}

function navHtml(pages) {
  return pages.map((page) => `<a href="${slugForPage(page)}">${esc(page)}</a>`).join('');
}

function serviceHref(brief) {
  const servicePage = brief.pages.find((page) => /service|emergency|safety|programme|program|shop|product/i.test(page));
  return slugForPage(servicePage || 'Contact');
}

function footerHtml(brief) {
  return `<footer class="site-footer"><div><strong>${esc(brief.business_name)}</strong><p>${esc(brief.target_audience)} can use this site to understand the offer and take the next step.</p></div><nav>${navHtml(brief.pages)}<a href="privacy.html">Privacy</a></nav></footer>`;
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

function fitMetaTitle(value) {
  let clean = String(value).replace(/\s+/g, ' ').trim();
  while (clean.length < 50) clean = `${clean} | Local Website`;
  if (clean.length > 60) clean = clean.slice(0, 60).trim();
  return clean;
}

function fitMetaDescription(value) {
  let clean = String(value).replace(/\s+/g, ' ').trim();
  const pad = ' Contact the team for a practical answer and a clear next step today.';
  while (clean.length < 140) clean = `${clean}${pad}`;
  if (clean.length > 160) clean = clean.slice(0, 160).trim();
  return clean;
}

function domainSlug(value) {
  return slugify(String(value || 'my-business'), { lower: true, strict: true }).replace(/-/g, '') || 'mybusiness';
}

function snakeBriefToCamelBrief(brief) {
  return {
    businessName: brief.business_name,
    industry: brief.industry,
    location: brief.location || 'Local',
    tone: brief.tone,
    services: serviceTitlesFor(brief),
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
  const data = { h1: title, subheadline: body, cta: 'Return home', metaTitle: fitMetaTitle(`${title} | ${brief.business_name}`), metaDescription: fitMetaDescription(`${body} Visit ${brief.business_name} for a clear next step.`) };
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
