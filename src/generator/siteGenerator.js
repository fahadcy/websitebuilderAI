import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import slugify from 'slugify';
import { analysePrompt, generateContent, generateTokens } from '../ai/openaiClient.js';
import { generateSiteImages } from '../ai/imageAssets.js';
import { createZip } from '../packager/zipper.js';
import { db } from '../db/database.js';
import { runRealityCheck, realityCheckMarkdown } from '../quality/realityCheck.js';
import { getLearningContext } from '../learning/feedbackMemory.js';

const root = process.cwd();

const esc = (value = '') => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const today = () => new Date().toISOString().slice(0, 10);

function applyLogoPalette(tokens, palette) {
  if (!palette) return tokens;
  return {
    ...tokens,
    colors: {
      ...tokens.colors,
      primary: palette.primary,
      secondary: palette.secondary,
      accent: palette.accent
    }
  };
}

function applyFontPreference(tokens, fontPreference) {
  if (!fontPreference) return tokens;
  const serifDisplays = new Set(['Instrument Serif', 'Cormorant Garamond']);
  return {
    ...tokens,
    fonts: {
      ...tokens.fonts,
      display: fontPreference,
      body: serifDisplays.has(fontPreference) ? (tokens.fonts?.body || 'Inter') : fontPreference
    }
  };
}

function applyRoyalTypography(tokens, brief, metadata = {}) {
  if (metadata.fontPreference) return tokens;
  const text = `${brief?.industry || ''} ${brief?.tone || ''} ${metadata?.prompt || ''}`.toLowerCase();
  const display = /luxury|law|legal|finance|advisory|insolvency|restructuring|consult|accountant|estate|property|clinic|dental/.test(text)
    ? 'Cormorant Garamond'
    : 'Libre Baskerville';
  return {
    ...tokens,
    fonts: {
      ...tokens.fonts,
      display,
      body: 'Inter'
    }
  };
}

function clientAnswer(metadata, id) {
  const answers = Array.isArray(metadata?.clientAnswers) ? metadata.clientAnswers : [];
  return answers.find((answer) => answer.id === id)?.value || '';
}

function applyClientAnswers(site) {
  const about = clientAnswer(site.metadata, 'about_story');
  const goal = clientAnswer(site.metadata, 'primary_goal');
  const team = clientAnswer(site.metadata, 'team_members');
  const products = clientAnswer(site.metadata, 'products');
  const menu = clientAnswer(site.metadata, 'menu_hours');
  const software = clientAnswer(site.metadata, 'software_details');
  const care = clientAnswer(site.metadata, 'care_details');
  if (about) {
    site.content.aboutParagraphs = splitAnswer(about, 3);
    site.content.brandThesis = `${site.brief.businessName} exists for a clear reason: ${about}`;
    site.brief.aboutText = about.slice(0, 220);
  }
  if (goal) {
    site.blueprint.primaryGoal = goal;
    site.content.hero.primaryCta = ctaFromGoal(goal);
    site.content.conversionPrompts[0] = { title: 'The next step', text: goal, cta: ctaFromGoal(goal) };
  }
  if (team) site.content.teamMembers = parsePeople(team, site.content.teamMembers);
  const detail = products || menu || software || care;
  if (detail) {
    const items = parseDetailItems(detail);
    if (items.length) {
      site.content.services = items.map((title) => ({
        title,
        description: descriptionForNature(projectNature(site), title),
        bullets: bulletsForNature(projectNature(site)),
        outcome: site.blueprint.primaryGoal
      }));
    }
    site.content.localProof = detail.slice(0, 260);
  }
  return site;
}

function splitAnswer(value, max = 3) {
  const parts = String(value).split(/\n+|(?<=\.)\s+/).map((part) => part.trim()).filter(Boolean);
  return (parts.length ? parts : [String(value)]).slice(0, max);
}

function parseDetailItems(value) {
  return String(value)
    .split(/\n|,|;|\|/)
    .map((item) => item.replace(/[-•*]/g, '').trim())
    .filter((item) => item.length > 2)
    .slice(0, 8);
}

function parsePeople(value, fallback) {
  const rows = String(value).split(/\n+/).map((row) => row.trim()).filter(Boolean);
  const people = rows.map((row, index) => {
    const parts = row.split(/\||,|-/).map((part) => part.trim()).filter(Boolean);
    return {
      name: parts[0] || fallback[index % fallback.length]?.name || `Team Member ${index + 1}`,
      role: parts[1] || fallback[index % fallback.length]?.role || 'Team member',
      bio: parts.slice(2).join(', ') || fallback[index % fallback.length]?.bio || 'Adds experience, care, and personality to the business.'
    };
  });
  return people.length ? people : fallback;
}

function ctaFromGoal(goal) {
  const text = String(goal).toLowerCase();
  if (/book|appointment|reserve/.test(text)) return 'Book now';
  if (/buy|shop|purchase|order/.test(text)) return 'Shop now';
  if (/demo/.test(text)) return 'Request demo';
  if (/call/.test(text)) return 'Call today';
  return 'Send enquiry';
}

function descriptionForNature(nature, title) {
  const map = {
    commerce: `${title} presented with clear pricing, fit notes, and a simple path to enquiry or purchase.`,
    hospitality: `${title} presented as a menu or visit highlight with enough detail to help guests choose.`,
    software: `${title} explained as a product capability connected to a practical workflow outcome.`,
    care: `${title} explained with reassurance, process clarity, and a simple booking route.`
  };
  return map[nature] || `${title} explained with relevant proof, useful detail, and a clear next step.`;
}

function bulletsForNature(nature) {
  const map = {
    commerce: ['Price and availability', 'Style or fit note', 'Enquiry or purchase CTA'],
    hospitality: ['Menu detail', 'Guest experience note', 'Booking prompt'],
    software: ['Workflow benefit', 'Integration or proof point', 'Demo prompt'],
    care: ['Who it helps', 'What to expect', 'Booking reassurance']
  };
  return map[nature] || ['Clear detail', 'Relevant proof', 'Next step'];
}

function applySeoKeywordStrategy(site) {
  const plan = normalizeSiteSeoStrategy(site);
  site.content.seoStrategy = plan;
  const primary = plan.primaryKeywords[0];
  const secondary = plan.secondaryKeywords.slice(0, 4);
  if (primary) {
    site.content.hero.subtext = ensureNaturalKeyword(site.content.hero.subtext, primary, `${site.brief.businessName} is a practical choice for ${primary}.`);
    site.content.localProof = ensureNaturalKeyword(site.content.localProof, primary, `People searching for ${primary} need clarity, proof, and an easy route to action.`);
    site.content.aboutParagraphs[0] = ensureNaturalKeyword(site.content.aboutParagraphs[0], primary, `That is especially important for people comparing ${primary}.`);
    if (site.content.differentiators[0]) {
      site.content.differentiators[0].text = ensureNaturalKeyword(site.content.differentiators[0].text, primary, `It gives visitors researching ${primary} a clearer reason to enquire.`);
    }
    if (site.content.blogPosts[0]) {
      site.content.blogPosts[0].intro = ensureNaturalKeyword(site.content.blogPosts[0].intro, primary, `The guide is written for people considering ${primary} and wanting a sensible next step.`);
    }
  }
  site.content.services = site.content.services.map((service, index) => {
    const keyword = `${service.title} ${site.brief.location}`;
    return {
      ...service,
      description: ensureNaturalKeyword(service.description, keyword, `This helps visitors comparing ${keyword} understand the fit before they enquire.`)
    };
  });
  site.content.faqs = site.content.faqs.map((faq, index) => {
    const topic = site.content.services[index % Math.max(site.content.services.length, 1)]?.title;
    if (!topic || /local|nearby|Manchester/i.test(faq.answer)) return faq;
    return { ...faq, answer: `${faq.answer} This gives local visitors another practical way to compare ${topic.toLowerCase()} options before booking.` };
  });
  if (site.content.faqs[0]) {
    site.content.faqs[0].answer = ensureNaturalKeyword(site.content.faqs[0].answer, primary, `That matters for anyone looking for ${primary}.`);
  }
}

function normalizeSiteSeoStrategy(site) {
  const existing = site.content?.seoStrategy || {};
  const briefKeywords = site.brief?.seoKeywords || {};
  const services = site.content?.services?.length ? site.content.services.map((service) => service.title) : site.brief.services || [];
  const primary = uniqueList(existing.primaryKeywords || briefKeywords.primary || [
    `${String(site.brief.industry || 'service').toLowerCase()} in ${site.brief.location}`,
    `${site.brief.location} ${String(site.brief.industry || 'service').toLowerCase()}`,
    `${site.brief.businessName} ${String(site.brief.industry || '').toLowerCase()}`
  ]);
  const secondary = uniqueList(existing.secondaryKeywords || briefKeywords.secondary || services.flatMap((service) => [`${service} ${site.brief.location}`, `${service} near me`]));
  const localModifiers = uniqueList(existing.localModifiers || briefKeywords.localModifiers || [site.brief.location, `near ${site.brief.location}`, 'local', 'near me']);
  return {
    primaryKeywords: primary.slice(0, 6),
    secondaryKeywords: secondary.slice(0, 16),
    localModifiers: localModifiers.slice(0, 8),
    pageKeywordMap: existing.pageKeywordMap || {
      Home: primary.slice(0, 3),
      Services: secondary.slice(0, 8),
      Contact: [primary[0], `${site.brief.businessName} contact`].filter(Boolean)
    },
    densityTargets: existing.densityTargets || { primary: '0.8-1.4%', secondary: '0.2-0.7%' },
    naturalUsageNotes: existing.naturalUsageNotes || 'Keywords are added where they support the reader. Exact-match repetition is capped to avoid stuffing.'
  };
}

function ensureNaturalKeyword(text, keyword, sentence) {
  const value = String(text || '').trim();
  if (!keyword || phraseCount(value, keyword)) return value;
  return `${value}${value.endsWith('.') ? '' : '.'} ${sentence}`;
}

function phraseCount(text, phrase) {
  const haystack = String(text || '').toLowerCase();
  const needle = String(phrase || '').toLowerCase().trim();
  if (!needle) return 0;
  return (haystack.match(new RegExp(escapeRegExp(needle), 'g')) || []).length;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function uniqueList(items) {
  return [...new Set((Array.isArray(items) ? items : []).map((item) => String(item || '').trim()).filter(Boolean))];
}

export async function generateSite(prompt, progress, metadata = {}) {
  progress({ status: 'running', progress: 8, message: 'Analysing your prompt' });
  const brief = await analysePrompt(prompt);
  applyCompanyHouseToBrief(brief, metadata);
  const learningContext = getLearningContext({ industry: brief.industry, prompt });
  if (learningContext.promptGuidance) brief.learningGuidance = learningContext.promptGuidance;
  progress({ status: 'running', progress: 18, message: 'Designing layout and colour palette' });
  const [content, generatedTokens] = await Promise.all([generateContent(brief), generateTokens(brief)]);
  const tokens = applyFontPreference(applyRoyalTypography(applyLogoPalette(generatedTokens, metadata.logoPalette), brief, { ...metadata, prompt }), metadata.fontPreference);
  progress({ status: 'running', progress: 20, message: 'Creating page copy, image plan, and placement matrix' });

  const siteId = `${slugify(brief.businessName, { lower: true, strict: true })}-${crypto.randomBytes(3).toString('hex')}`;
  const outDir = path.join(root, 'generated-sites', siteId);
  await fs.mkdir(outDir, { recursive: true });
  await fs.mkdir(path.join(outDir, 'assets', 'css'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'assets', 'js'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'admin'), { recursive: true });
  await fs.mkdir(path.join(outDir, 'storage', 'uploads'), { recursive: true });

  let logoFile = null;
  if (metadata.logoPath) {
    const ext = path.extname(metadata.logoPath).toLowerCase();
    logoFile = `assets/logo${ext}`;
    await fs.copyFile(metadata.logoPath, path.join(outDir, logoFile));
  }

  const generationSeed = crypto.randomBytes(6).toString('hex');
  const site = {
    siteId,
    generationSeed,
    designVariant: hashNumber(generationSeed) % 12,
    brief,
    content,
    tokens,
    metadata: { ...metadata, prompt },
    learningContext,
    logoFile,
    domain: metadata.domainName || 'example.com',
    blueprint: metadata.blueprint || autoBlueprintFromBrief(brief, prompt),
    assetMap: {},
    generatedImages: []
  };
  sanitizeBlueprintForBusiness(site);
  applyClientAnswers(site);
  progress({ status: 'running', progress: 22, message: 'Building SEO keyword map and density targets' });
  applySeoKeywordStrategy(site);
  progress({ status: 'running', progress: 24, message: 'Infusing keywords naturally into page content' });
  const imageResult = await generateSiteImages(site, outDir, progress);
  site.assetMap = imageResult.assetMap || {};
  site.generatedImages = imageResult.generatedImages || [];
  site.imagePlan = imageResult.imagePlan || [];
  const dynamicPageFiles = buildPageFiles(site);
  const files = [
    ['assets/css/styles.css', premiumCssV6(site)],
    ['assets/js/app.js', premiumJsV2(site)],
    ...dynamicPageFiles,
    ['404.html', page(site, 'Page Not Found', notFound(site), 'The requested page could not be found.')],
    ['sitemap.xml', sitemap(site)],
    ['robots.txt', `User-agent: *\nAllow: /\nSitemap: https://${site.domain}/sitemap.xml\n`],
    ['feed.xml', feed(site)],
    ['creative-brief.md', creativeBrief(site)],
    ['learning-memory.md', learningMemoryReport(site)],
    ['seo-keyword-report.md', seoKeywordReport(site)],
    ['production-plan.md', productionPlan(site)],
    ['style-guide.html', styleGuide(site)],
    ['database.sql', generatedDatabaseSql()],
    ['.env.example', generatedEnv()],
    ['README.md', generatedReadme(site)],
    ['admin/index.php', adminPhp('login', site)],
    ['admin/dashboard.php', adminPhp('dashboard', site)],
    ['admin/pages.php', adminPhp('pages', site)],
    ['admin/team.php', adminPhp('team', site)],
    ['admin/blog.php', adminPhp('blog', site)],
    ['admin/contact-settings.php', adminPhp('contact-settings', site)],
    ['admin/seo.php', adminPhp('seo', site)],
    ['admin/social.php', adminPhp('social', site)],
    ['admin/submissions.php', adminPhp('submissions', site)],
    ['admin/settings.php', adminPhp('settings', site)],
    ['admin/bootstrap.php', adminBootstrap(site)],
    ['admin/csrf.php', generatedCsrfEndpoint()],
    ['admin/contact.php', generatedContactEndpoint()],
    ['admin/newsletter.php', generatedNewsletterEndpoint()]
  ];

  let i = 0;
  for (const [file, body] of files) {
    if (dynamicPageFiles.some(([pageFile]) => pageFile === file)) {
      await new Promise((resolve) => setTimeout(resolve, Number(process.env.PAGE_GENERATION_DELAY_MS || 2500)));
    }
    await fs.writeFile(path.join(outDir, file), body, 'utf8');
    i += 1;
    const labels = ['Writing page sections with infused SEO keywords', 'Checking keyword density and natural phrasing', 'Placing images and visual rhythm', 'Building animated layouts', 'Generating team and content records', 'Setting up admin panel', 'Configuring SEO metadata and schema', 'Finalising and packaging'];
    progress({ status: 'running', progress: 36 + Math.round((i / files.length) * 44), message: labels[Math.min(labels.length - 1, Math.floor((i / files.length) * labels.length))] });
  }
  const audit = await runRealityCheck(site, outDir);
  await fs.writeFile(path.join(outDir, 'reality-check-report.md'), realityCheckMarkdown(site, audit), 'utf8');
  await fs.writeFile(path.join(outDir, 'presentability-report.md'), presentabilityReport(site, audit), 'utf8');
  progress({ status: 'running', progress: 86, message: audit.score >= 88 ? 'Reality Check Agent passed' : 'Reality Check Agent found review notes' });

  const zipPath = await createZip(outDir, siteId);
  db.prepare('INSERT INTO generated_sites (id, business_name, industry, prompt, status, output_path, zip_path, domain_name, logo_path, reality_check_score, reality_check_report, reality_check_verdict) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
    .run(siteId, brief.businessName, brief.industry, prompt, 'complete', outDir, zipPath, metadata.domainName || null, logoFile, audit.score, JSON.stringify(audit), audit.verdict);
  return { siteId, outDir, zipPath };
}

function layoutNav(site) {
  const links = navLinks(site);
  const header = headerDesign(site);
  const logo = site.logoFile ? `<img class="brand-logo brand-logo-${header.logoSize}" src="${site.logoFile}" alt="${esc(site.brief.businessName)} logo">` : '';
  const name = header.showName || !site.logoFile ? `<span>${esc(site.brief.businessName)}</span>` : '';
  const brand = `${logo}${name}`;
  const nav = links.map(([href, text]) => `<a href="${href}">${text}</a>`).join('');
  const ctaHref = links.find(([href, text]) => /contact|enquir|book|reserve/i.test(`${href} ${text}`))?.[0] || 'contact.html';
  const cta = `<a class="header-cta" href="${ctaHref}">${esc(header.cta)}</a>`;
  const mode = themeToggleButton();
  if (header.layout === 'split') {
    const mid = Math.ceil(links.length / 2);
    return `<header class="site-header header-split"><nav>${links.slice(0, mid).map(([href, text]) => `<a href="${href}">${text}</a>`).join('')}</nav><a class="brand brand-${header.brandLayout}" href="index.html">${brand}</a><nav>${links.slice(mid).map(([href, text]) => `<a href="${href}">${text}</a>`).join('')}</nav>${mode}</header>`;
  }
  if (header.layout === 'stacked') {
    return `<header class="site-header header-stacked"><div class="header-brand-row"><a class="brand brand-${header.brandLayout}" href="index.html">${brand}</a><div class="header-actions">${cta}${mode}</div></div><nav>${nav}</nav></header>`;
  }
  if (header.layout === 'editorial') {
    return `<header class="site-header header-editorial"><a class="brand brand-${header.brandLayout}" href="index.html">${brand}</a><p>${esc(header.note)}</p><nav>${nav}</nav>${mode}</header>`;
  }
  if (header.layout === 'minimal') {
    return `<header class="site-header header-minimal"><a class="brand brand-${header.brandLayout}" href="index.html">${brand}</a><nav>${nav}</nav>${cta}${mode}</header>`;
  }
  return `<header class="site-header header-classic"><a class="brand brand-${header.brandLayout}" href="index.html">${brand}</a><nav>${nav}</nav><div class="header-actions">${cta}${mode}</div></header>`;
}

function themeToggleButton() {
  return `<button class="theme-toggle" data-theme-toggle aria-label="Toggle dark mode" title="Toggle dark mode"><span aria-hidden="true"></span></button>`;
}

function applyCompanyHouseToBrief(brief, metadata = {}) {
  const company = metadata.companyHouse;
  if (!company?.companyName) return;
  brief.businessName = company.companyName;
  if (company.address) brief.address = company.address;
  if (!metadata.domainName && company.domainSuggestion) metadata.domainName = company.domainSuggestion;
  brief.aboutText = `${company.companyName} is presented with official Companies House details${company.companyNumber ? ` under company number ${company.companyNumber}` : ''}. ${brief.aboutText}`;
}

function headerBrandMode(site) {
  const nature = projectNature(site);
  const seed = hashNumber(`${site.generationSeed}-${site.brief.businessName}-${nature}`);
  const logoOnlyAllowed = Boolean(site.logoFile) && !['professional', 'care', 'education'].includes(nature);
  const showName = !logoOnlyAllowed || seed % 3 !== 0;
  const size = nature === 'commerce' || nature === 'portfolio' ? 'large' : nature === 'professional' || nature === 'education' ? 'short' : seed % 2 ? 'medium' : 'large';
  const layout = !showName ? 'logo-only' : seed % 4 === 0 ? 'stacked' : 'inline';
  return { showName, size, layout };
}

function headerDesign(site) {
  const nature = projectNature(site);
  const seed = hashNumber(`${site.generationSeed}-${site.brief.businessName}-${nature}-${site.blueprint?.visualStrategy || ''}`);
  const layoutsByNature = {
    commerce: ['minimal', 'stacked', 'classic', 'split'],
    hospitality: ['split', 'editorial', 'stacked', 'classic'],
    care: ['classic', 'stacked', 'minimal', 'editorial'],
    professional: ['minimal', 'editorial', 'classic', 'stacked'],
    fitness: ['split', 'minimal', 'classic', 'stacked'],
    portfolio: ['editorial', 'split', 'minimal', 'stacked'],
    software: ['classic', 'minimal', 'stacked', 'editorial'],
    property: ['stacked', 'classic', 'minimal', 'split'],
    event: ['split', 'editorial', 'minimal', 'classic'],
    education: ['stacked', 'classic', 'minimal', 'editorial'],
    service: ['classic', 'minimal', 'stacked', 'split', 'editorial']
  };
  const choices = layoutsByNature[nature] || layoutsByNature.service;
  const layout = choices[seed % choices.length];
  const logoSizes = ['short', 'medium', 'large', 'hero'];
  const logoSize = logoSizes[(seed >> 3) % logoSizes.length];
  const logoOnlyAllowed = Boolean(site.logoFile) && !['care', 'education', 'professional'].includes(nature);
  const showName = !logoOnlyAllowed || seed % 4 !== 0;
  const brandLayout = !showName ? 'logo-only' : seed % 5 === 0 ? 'stacked' : seed % 5 === 1 ? 'vertical' : 'inline';
  const cta = ctaFromGoal(site.blueprint?.primaryGoal || site.content?.hero?.primaryCta || '');
  const note = site.content?.hero?.kicker || site.blueprint?.businessType || site.brief.industry;
  return { layout, logoSize, showName, brandLayout, cta, note };
}

function navLinks(site) {
  const pages = site.blueprint?.pages;
  if (!Array.isArray(pages) || !pages.length) return [['index.html', 'Home'], ['about.html', 'About'], ['services.html', 'Services'], ['team.html', 'Team'], ['blog.html', 'Blog'], ['contact.html', 'Contact']];
  return pages.map((pageItem) => [pageFileName(pageItem), pageItem.title]);
}

function pageFileName(pageItem) {
  const slug = pageItem.slug || slugify(pageItem.title || 'page', { lower: true, strict: true });
  return slug === 'index' || slug === 'home' ? 'index.html' : `${slug}.html`;
}

function autoBlueprintFromBrief(brief, prompt = '') {
  const nature = projectNature({ brief, blueprint: null, metadata: { prompt } });
  const pagesByNature = {
    commerce: ['Home', 'Shop', 'New Arrivals', 'Sale', 'Size Guide', 'Contact'],
    hospitality: ['Home', 'Menu', 'Reservations', 'Gallery', 'Contact'],
    care: ['Home', 'Treatments', 'Practitioners', 'Patient Information', 'Contact'],
    professional: ['Home', 'Services', 'Industries', 'Case Studies', 'Contact'],
    fitness: ['Home', 'Classes', 'Memberships', 'Timetable', 'Contact'],
    portfolio: ['Home', 'Work', 'Case Studies', 'About', 'Contact'],
    software: ['Home', 'Product', 'Use Cases', 'Pricing', 'Contact'],
    property: ['Home', 'Properties', 'Valuation', 'Area Guides', 'Contact'],
    event: ['Home', 'Schedule', 'Tickets', 'Venue', 'Contact'],
    education: ['Home', 'Courses', 'Admissions', 'Tutors', 'Contact'],
    service: ['Home', 'About', 'Services', 'Team', 'Blog', 'Contact']
  };
  const pageTitles = pagesByNature[nature] || pagesByNature.service;
  return {
    businessType: brief.industry,
    projectNature: nature,
    primaryGoal: `Create a ${nature} website for ${brief.businessName} that matches the customer intent in the prompt.`,
    audience: 'Visitors implied by the business type and prompt.',
    conversionPath: ['Understand the offer', 'See relevant proof', 'Choose the right next step', 'Enquire or buy'],
    visualStrategy: `Use a ${nature}-specific homepage and page structure rather than a generic business layout.`,
    pages: pageTitles.map((title) => ({
      title,
      slug: title.toLowerCase() === 'home' ? 'index' : slugify(title, { lower: true, strict: true }),
      purpose: `${title} page for ${brief.businessName}, shaped for a ${nature} project.`,
      sections: sectionsForNaturePage(nature, title),
      conversionTarget: title.toLowerCase().includes('contact') ? 'Contact enquiry' : 'Next relevant action'
    })),
    features: [],
    internalPrompt: `Generate pages based on the ${nature} nature of the project. Do not use a generic layout.`
  };
}

function sanitizeBlueprintForBusiness(site) {
  const correctedNature = correctedProjectNature(site);
  if (!site.blueprint) site.blueprint = autoBlueprintFromBrief(site.brief, site.metadata?.prompt || '');
  const declared = String(site.blueprint.projectNature || '').toLowerCase();
  const mismatch = correctedNature && declared && correctedNature !== declared;
  if (correctedNature) site.blueprint.projectNature = correctedNature;
  if (mismatch || hasSoftwarePagesForNonSoftware(site.blueprint, correctedNature)) {
    const replacement = autoBlueprintFromBrief(site.brief, `${site.metadata?.prompt || ''} ${correctedNature}`);
    site.blueprint = {
      ...site.blueprint,
      projectNature: correctedNature,
      businessType: businessTypeLabel(correctedNature, site.brief.industry),
      primaryGoal: primaryGoalForCorrectedNature(correctedNature, site),
      visualStrategy: visualStrategyForCorrectedNature(correctedNature),
      pages: replacement.pages,
      internalPrompt: `Corrected project type: ${correctedNature}. Do not use SaaS/product/dashboard sections unless the business is actually software.`
    };
  }
}

function correctedProjectNature(site) {
  const text = `${site.brief.industry || ''} ${site.brief.businessName || ''} ${site.blueprint?.businessType || ''} ${site.blueprint?.primaryGoal || ''} ${site.metadata?.prompt || ''}`.toLowerCase();
  if (/insolvency|restructuring|business advisory|financial distress|advisory|accountant|accounting|consultant|consulting|finance|solicitor|law|legal|professional/.test(text)) return 'professional';
  if (/tutor|tuition|teacher|student|school|course|education|academy|learning|lesson|gcse|a-level|maths|english/.test(text)) return 'education';
  if (/shoe|shop|retail|e-?commerce|store|product|fashion|clothing|jewellery|jewelry/.test(text)) return 'commerce';
  if (/restaurant|cafe|bar|bakery|takeaway|food|menu|reservation/.test(text)) return 'hospitality';
  if (/clinic|dental|physio|health|therapy|medical|wellness|salon|spa/.test(text)) return 'care';
  if (/gym|fitness|trainer|yoga|pilates|sport/.test(text)) return 'fitness';
  if (/portfolio|photography|artist|designer|architect|studio|creative/.test(text)) return 'portfolio';
  if (/estate|property|real estate|letting|homes|apartments/.test(text)) return 'property';
  if (/event|conference|festival|wedding|venue|ticket/.test(text)) return 'event';
  if (/saas|software|app|platform|dashboard|automation|crm/.test(text)) return 'software';
  return site.blueprint?.projectNature || projectNature(site);
}

function hasSoftwarePagesForNonSoftware(blueprint, nature) {
  if (nature === 'software') return false;
  const pages = (blueprint?.pages || []).map((pageItem) => `${pageItem.title || ''} ${pageItem.slug || ''}`).join(' ').toLowerCase();
  return /\bproduct\b|use-cases|use cases|\bpricing\b|demo/.test(pages);
}

function businessTypeLabel(nature, fallback) {
  return {
    education: 'education / private tutoring service',
    commerce: 'retail / e-commerce business',
    hospitality: 'restaurant / hospitality business',
    care: 'health, clinic, or wellness business',
    fitness: 'fitness or membership business',
    portfolio: 'creative portfolio or studio',
    property: 'property or real estate business',
    event: 'event or venue',
    software: 'software / SaaS product',
    professional: 'professional services business'
  }[nature] || fallback || 'local service business';
}

function primaryGoalForCorrectedNature(nature, site) {
  if (nature === 'education') return `Help parents and students understand ${site.brief.businessName}, compare tutoring options, trust the tutor, and enquire.`;
  if (nature === 'commerce') return `Help customers browse products, trust the offer, and enquire or buy.`;
  if (nature === 'care') return `Build trust and convert visitors into bookings or enquiries.`;
  return `Create a ${nature} website for ${site.brief.businessName} that matches the customer intent in the prompt.`;
}

function visualStrategyForCorrectedNature(nature) {
  if (nature === 'education') return 'Use warm education-focused layouts: learning outcomes, subject pathways, tutor credibility, parent reassurance, testimonials, and enquiry CTAs. Avoid dashboard mockups and SaaS product language.';
  if (nature === 'commerce') return 'Use product-first retail layouts with product imagery, categories, sale logic, trust notes, and clear purchase/enquiry paths.';
  return `Use ${nature}-specific sections, imagery, and conversion flow.`;
}

function sectionsForNaturePage(nature, title) {
  const lower = title.toLowerCase();
  if (lower === 'home') return ['Nature-specific hero', 'Primary conversion path', 'Proof', 'CTA'];
  if (nature === 'commerce') return ['Category browse', 'Product highlights', 'Pricing or sale logic', 'Trust and support'];
  if (nature === 'hospitality') return ['Menu highlights', 'Opening hours', 'Reservation CTA', 'Location'];
  if (nature === 'software') return ['Product workflow', 'Use case proof', 'Demo CTA', 'Plan comparison'];
  if (nature === 'portfolio') return ['Selected work', 'Case study proof', 'Services', 'Project CTA'];
  if (nature === 'property') return ['Search or listings', 'Area proof', 'Valuation CTA', 'Viewing CTA'];
  if (nature === 'event') return ['Schedule', 'Speakers or venue', 'Ticket CTA', 'FAQ'];
  if (nature === 'education') return ['Course overview', 'Outcomes', 'Tutor proof', 'Admissions CTA'];
  if (nature === 'fitness') return ['Classes', 'Memberships', 'Timetable', 'Trial CTA'];
  if (nature === 'care') return ['Treatment path', 'Practitioner trust', 'Patient FAQ', 'Booking CTA'];
  return ['Overview', 'Proof', 'Details', 'CTA'];
}

function buildPageFiles(site) {
  if (!site.blueprint?.pages?.length) {
    return [
      ['index.html', page(site, 'Home', withHomeDepth(site, natureHome(site, { title: 'Home' })), 'Expert local care and clear next steps.')],
      ['about.html', page(site, 'About Us', premiumAbout(site), 'Learn about our story, values, and approach.')],
      ['team.html', page(site, 'Meet the Team', premiumTeam(site), 'Meet the people behind the service.')],
      ['services.html', page(site, 'Services', premiumServices(site), 'Explore services, FAQs, and treatment options.', faqSchema(site))],
      ['blog.html', page(site, 'Blog', premiumBlog(site), 'Advice, updates, and practical guides.')],
      ['blog-post.html', page(site, site.content.blogPosts[0].title, premiumArticle(site), site.content.blogPosts[0].intro, articleSchema(site))],
      ['contact.html', page(site, 'Contact Us', premiumContact(site), 'Contact details, enquiries, maps, and opening hours.')],
      ['privacy.html', page(site, 'Privacy Policy', privacy(site), 'How we collect and protect personal data.')]
    ];
  }
  const plannedPages = assignPageLayouts(site);
  const files = plannedPages.map((pageItem, index) => {
    const title = pageItem.title || 'Page';
    const lower = title.toLowerCase();
    const body = renderBlueprintPage(site, pageItem, index);
    const extraSchema = lower.includes('faq') || pageItem.sections?.some((s) => String(s).toLowerCase().includes('faq')) ? faqSchema(site) : '';
    return [pageFileName(pageItem), page(site, title, body, pageDescription(site, pageItem, title), extraSchema)];
  });
  if (!files.some(([file]) => file === 'blog-post.html')) files.push(['blog-post.html', page(site, site.content.blogPosts[0].title, premiumArticle(site), site.content.blogPosts[0].intro, articleSchema(site))]);
  if (!files.some(([file]) => file === 'privacy.html')) files.push(['privacy.html', page(site, 'Privacy Policy', privacy(site), 'How we collect and protect personal data.')]);
  return files;
}

function renderBlueprintPage(site, pageItem, index = 0) {
  const lower = String(pageItem.title || '').toLowerCase();
  if (lower.includes('privacy')) return privacy(site);
  return dynamicCustomerPage(site, pageItem, index);
}
function page(site, title, main, description, extraSchema = '') {
  const b = site.brief;
  const schema = JSON.stringify({ '@context': 'https://schema.org', '@type': 'LocalBusiness', name: b.businessName, address: b.address, telephone: b.contactPhone, email: b.contactEmail, geo: { '@type': 'GeoCoordinates', latitude: b.googleMapsLat, longitude: b.googleMapsLng } });
  const pagePath = title === 'Home' ? '' : `${slugify(title, { lower: true, strict: true })}.html`;
  const metaDescription = seoMetaDescription(site, title, description);
  const metaKeywords = keywordListForPage(site, title).slice(0, 10).join(', ');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)} | ${esc(b.businessName)}</title><meta name="description" content="${esc(metaDescription)}"><meta name="keywords" content="${esc(metaKeywords)}"><link rel="canonical" href="https://${esc(site.domain)}/${pagePath}"><meta property="og:title" content="${esc(title)} | ${esc(b.businessName)}"><meta property="og:description" content="${esc(metaDescription)}"><meta property="og:type" content="website"><meta property="og:url" content="https://${esc(site.domain)}/${pagePath}"><meta name="twitter:card" content="summary_large_image"><link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=${encodeURIComponent(site.tokens.fonts.display)}:wght@500;700&family=${encodeURIComponent(site.tokens.fonts.body)}:wght@400;500;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="assets/css/styles.css"><script type="application/ld+json">${schema}</script>${extraSchema}</head><body class="design-v${site.designVariant} mood-${visualMood(site)}"><div class="scroll-progress" data-scroll-progress></div>${layoutNav(site)}<main>${main}</main>${footer(site, title)}<script src="assets/js/app.js" defer></script></body></html>`;
}
function home(site) {
  const { brief: b, content: c } = site;
  return `<section class="hero reveal"><p>${esc(b.tagline)}</p><h1 data-animate-text>${esc(c.hero.headline)}</h1><p>${esc(c.hero.subtext)}</p><a class="button" href="contact.html">Book a consultation</a></section><section class="band"><h2>Services</h2><div class="service-list">${c.services.slice(0, 4).map((s) => `<article><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p></article>`).join('')}</div></section><section class="split reveal"><img src="${imageUrl(site, 'legacy home story', 900, 650)}" alt=""><div><h2>Built around clear progress</h2>${c.aboutParagraphs.slice(0, 2).map((p) => `<p>${esc(p)}</p>`).join('')}<a href="about.html">Read our story</a></div></section><section class="stats">${c.stats.map((s) => `<div><strong data-count="${s.value}">0</strong><span>${esc(s.label)}</span></div>`).join('')}</section><section class="band"><h2>What clients say</h2><div class="testimonials">${c.testimonials.map((t) => `<blockquote><p>â€œ${esc(t.quote)}â€</p><cite>${esc(t.name)}</cite></blockquote>`).join('')}</div></section><section class="cta"><h2>Ready for a clearer plan?</h2><a class="button" href="contact.html">Start the conversation</a></section>`;
}

function about(site) {
  const c = site.content;
  return `<section class="page-hero"><h1>About Us</h1><p>${esc(site.brief.aboutText)}</p></section><section class="content-narrow">${c.aboutParagraphs.map((p) => `<p>${esc(p)}</p>`).join('')}<h2>Mission and vision</h2><p>To make expert support easier to understand, easier to access, and easier to act on.</p><h2>Values</h2><ul><li>Evidence before assumptions</li><li>Clear communication</li><li>Respect for peopleâ€™s time</li></ul></section>`;
}

function team(site) {
  return `<section class="page-hero"><h1>Meet the Team</h1><p>Experienced people, practical advice, and a calm standard of care.</p></section><section class="cards">${site.content.teamMembers.map((m, i) => `<article><img src="${imageUrl(site, `team profile ${m.name} ${i}`, 500, 420)}" alt=""><h2>${esc(m.name)}</h2><p><strong>${esc(m.role)}</strong></p><p>${esc(m.bio)}</p><p><a href="#">LinkedIn</a></p></article>`).join('')}</section><section class="cta"><h2>Interested in joining us?</h2><a class="button" href="contact.html">Send an enquiry</a></section>`;
}

function services(site) {
  const c = site.content;
  return `<section class="page-hero"><h1>Services</h1><p>Focused support tailored to your goals.</p></section><section class="cards">${c.services.map((s) => `<details open><summary>${esc(s.title)}</summary><p>${esc(s.description)}</p><ul>${s.bullets.map((b) => `<li>${esc(b)}</li>`).join('')}</ul></details>`).join('')}</section><section class="content-narrow"><h2>FAQs</h2>${c.faqs.map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join('')}</section>`;
}

function blog(site) {
  return `<section class="page-hero"><h1>Blog</h1><p>Useful guides and practical notes from the team.</p><input class="search" type="search" placeholder="Search articles"></section><section class="cards">${site.content.blogPosts.map((p) => `<article><p>${esc(p.category)}</p><h2><a href="blog-post.html">${esc(p.title)}</a></h2><p>${esc(p.intro)}</p></article>`).join('')}</section>`;
}

function article(site) {
  const p = site.content.blogPosts[0];
  return `<article class="content-narrow"><p>${today()} Â· ${esc(p.category)}</p><h1>${esc(p.title)}</h1><p>${esc(p.intro)}</p><p>Recovery and improvement usually come from consistent, well-timed action rather than one dramatic change. Start with a clear baseline, choose one or two priorities, and review progress regularly.</p><p>When symptoms change, treat that as useful information. A good plan adapts while keeping the goal visible.</p><h2>Related reading</h2><ul>${site.content.blogPosts.map((post) => `<li><a href="blog-post.html">${esc(post.title)}</a></li>`).join('')}<li><a href="${alternateHref(site, 'contact.html')}">Explore the next step</a></li></ul></article>`;
}

function contact(site) {
  const b = site.brief;
  return `<section class="page-hero"><h1>Contact Us</h1><p>${esc(b.address)} Â· ${esc(b.contactPhone)} Â· ${esc(b.contactEmail)}</p></section><section class="split"><form method="post" action="admin/contact.php" class="form" data-secure-form><input type="hidden" name="_csrf" value=""><label>Name<input name="name" required></label><label>Email<input type="email" name="email" required></label><label>Phone<input name="phone"></label><label>Message<textarea name="message" required></textarea></label><button class="button">Send message</button></form><div><div id="map" class="map" data-lat="${esc(b.googleMapsLat)}" data-lng="${esc(b.googleMapsLng)}" data-name="${esc(b.businessName)}">Configure Maps API key to enable the interactive map.</div><a class="button secondary" href="https://www.google.com/maps/dir/?api=1&destination=${esc(b.googleMapsLat)},${esc(b.googleMapsLng)}">Get directions</a><h2>Business hours</h2><p>Monday to Friday, 8:00am - 6:30pm</p></div></section>`;
}

function privacy(site) {
  return `<section class="page-hero"><h1>Privacy Policy</h1></section><section class="content-narrow"><p>${esc(site.content.privacyPolicy)}</p><p>You can request access, correction, or deletion of your data by contacting ${esc(site.brief.contactEmail)}.</p></section>`;
}

function notFound(site) {
  return `<section class="hero"><h1>Page not found</h1><p>The page may have moved, or the link may be out of date.</p><a class="button" href="index.html">Return home</a></section>`;
}

function footer(site, pageTitle = 'Home') {
  const official = site.metadata?.showCompanyHouse && site.metadata?.companyHouse ? `<p class="company-house-note">Registered company: ${esc(site.metadata.companyHouse.companyName)}${site.metadata.companyHouse.companyNumber ? ` · ${esc(site.metadata.companyHouse.companyNumber)}` : ''}${site.metadata.companyHouse.status ? ` · ${esc(site.metadata.companyHouse.status)}` : ''}</p>` : '';
  const strategy = footerStrategy(site, pageTitle);
  const links = footerNav(site);
  const legal = `<nav class="footer-legal"><a href="privacy.html">Privacy</a><a href="sitemap.xml">Sitemap</a><span>© ${new Date().getFullYear()} ${esc(site.brief.businessName)}</span></nav>`;
  const newsletter = `<form class="newsletter" method="post" action="admin/newsletter.php" data-secure-form><input type="hidden" name="_csrf" value=""><label>Useful updates<input type="email" name="email" placeholder="Email address" required></label><button>Sign up</button></form>`;
  const linkHtml = links.map(([href, text]) => `<a href="${href}">${esc(text)}</a>`).join('');
  const serviceLinks = site.content.services.slice(0, 6).map((service) => `<a href="${alternateHref(site, 'services.html')}">${esc(service.title)}</a>`).join('');
  const proof = site.content.stats.slice(0, 3).map((stat) => `<span><strong>${esc(stat.value)}</strong>${esc(stat.label)}</span>`).join('');
  const hub = ['Careers', 'Press', 'Partnerships', 'Accessibility', 'Terms', 'Support'].map((item) => `<a href="contact.html">${item}</a>`).join('');
  const contact = `<address>${esc(site.brief.address)}<br>${esc(site.brief.contactPhone)}<br>${esc(site.brief.contactEmail)}</address>${official}`;
  if (strategy === 'invisible') return `<footer class="footer-invisible">${legal}</footer>`;
  if (strategy === 'minimal') return `<footer class="footer-minimal"><strong>${esc(site.brief.businessName)}</strong>${legal}</footer>`;
  if (strategy === 'utility') return `<footer class="footer-utility"><div>${contact}</div>${legal}</footer>`;
  if (strategy === 'doormat') return `<footer class="footer-doormat"><div><strong>${esc(site.brief.businessName)}</strong><p>${esc(site.content.localProof)}</p></div><nav>${linkHtml}</nav>${legal}</footer>`;
  if (strategy === 'mega') return `<footer class="footer-mega"><div class="footer-statement"><strong>${esc(site.brief.businessName)}</strong><p>${esc(site.content.brandThesis)}</p></div><div><h3>Pages</h3><nav>${linkHtml}</nav></div><div><h3>${footerServiceTitle(site)}</h3><nav>${serviceLinks}</nav></div><div><h3>Contact</h3>${contact}</div>${newsletter}${legal}</footer>`;
  if (strategy === 'cta') return `<footer class="footer-cta"><div><p class="eyebrow">Next step</p><h2>${esc(site.content.conversionPrompts[0]?.title || `Start with ${site.brief.businessName}`)}</h2><p>${esc(site.content.conversionPrompts[0]?.text || site.content.microcopy.contactHint)}</p><a class="button" href="contact.html">${esc(site.content.conversionPrompts[0]?.cta || 'Contact us')}</a></div><div class="footer-proof">${proof}</div>${legal}</footer>`;
  if (strategy === 'hub') return `<footer class="footer-hub"><div><strong>${esc(site.brief.businessName)}</strong><p>${esc(site.content.localProof)}</p></div><div><h3>Company hub</h3><nav>${hub}</nav></div><div><h3>Essentials</h3><nav>${linkHtml}</nav></div>${newsletter}${legal}</footer>`;
  if (strategy === 'product') return `<footer class="footer-product"><div><p class="eyebrow">${esc(site.blueprint?.businessType || site.brief.industry)}</p><h2>${esc(footerProductHeadline(site))}</h2></div><div class="footer-product-grid">${site.content.services.slice(0, 4).map((service) => `<article><h3>${esc(service.title)}</h3><p>${esc(service.description)}</p></article>`).join('')}</div>${legal}</footer>`;
  return `<footer class="footer-contextual"><div><strong>${esc(site.brief.businessName)}</strong><p>${esc(contextualFooterCopy(site, pageTitle))}</p>${contact}</div><div class="footer-proof">${proof}</div><nav>${linkHtml}</nav>${newsletter}${legal}</footer>`;
}

function keywordListForPage(site, title = 'Home') {
  const strategy = site.content?.seoStrategy || normalizeSiteSeoStrategy(site);
  const mapped = strategy.pageKeywordMap?.[title] || strategy.pageKeywordMap?.[String(title).replace(/\s+/g, '')] || [];
  const base = mapped.length ? mapped : title === 'Home' ? strategy.primaryKeywords : strategy.secondaryKeywords;
  return uniqueList([...base, ...strategy.primaryKeywords.slice(0, 2), ...strategy.localModifiers.slice(0, 2)]);
}

function seoMetaDescription(site, title, fallback) {
  const keyword = keywordListForPage(site, title)[0];
  const base = String(fallback || site.content.hero.subtext || '').replace(/\s+/g, ' ').trim();
  const withKeyword = keyword && !phraseCount(base, keyword) ? `${base} Learn more about ${keyword} with ${site.brief.businessName}.` : base;
  return withKeyword.slice(0, 158);
}

function footerStrategy(site, pageTitle = 'Home') {
  const nature = projectNature(site);
  const strategiesByNature = {
    commerce: ['product', 'mega', 'cta', 'doormat', 'utility', 'contextual'],
    hospitality: ['cta', 'doormat', 'mega', 'contextual', 'minimal'],
    care: ['utility', 'mega', 'cta', 'contextual', 'hub'],
    professional: ['hub', 'mega', 'minimal', 'utility', 'contextual'],
    fitness: ['cta', 'product', 'doormat', 'mega', 'invisible'],
    portfolio: ['minimal', 'invisible', 'cta', 'doormat', 'hub'],
    software: ['product', 'mega', 'cta', 'hub', 'utility'],
    property: ['mega', 'utility', 'cta', 'doormat', 'contextual'],
    event: ['cta', 'doormat', 'minimal', 'contextual', 'invisible'],
    education: ['mega', 'utility', 'cta', 'hub', 'contextual'],
    service: ['mega', 'cta', 'doormat', 'utility', 'hub', 'minimal', 'contextual', 'invisible']
  };
  const choices = strategiesByNature[nature] || strategiesByNature.service;
  return choices[hashNumber(`${site.generationSeed}-footer-${nature}-${pageTitle}-${site.blueprint?.primaryGoal || ''}`) % choices.length];
}

function footerNav(site) {
  const links = navLinks(site).slice(0, 8);
  return links.length ? links : [['index.html', 'Home'], ['about.html', 'About'], ['services.html', 'Services'], ['contact.html', 'Contact']];
}

function footerServiceTitle(site) {
  const nature = projectNature(site);
  if (nature === 'commerce') return 'Products';
  if (nature === 'education') return 'Learning';
  if (nature === 'hospitality') return 'Menu';
  if (nature === 'software') return 'Features';
  return 'Services';
}

function footerProductHeadline(site) {
  const nature = projectNature(site);
  if (nature === 'commerce') return 'Featured products and sale routes';
  if (nature === 'software') return 'Product areas that move visitors toward a demo';
  if (nature === 'education') return 'Learning routes visitors can understand quickly';
  return `Focused offers from ${site.brief.businessName}`;
}

function contextualFooterCopy(site, pageTitle = 'Home') {
  const page = String(pageTitle || '').toLowerCase();
  if (/contact/.test(page)) return 'This footer keeps practical contact routes, official details, legal links, and reassurance close to the enquiry form.';
  if (/service|treatment|product|shop|course|learning/.test(page)) return 'This footer supports the decision on this page with related offers, proof, contact details, and useful next steps.';
  if (/about|team|practitioner/.test(page)) return 'This footer reinforces trust with company information, people-led credibility, and easy routes back to enquiry.';
  if (/blog|guide|article|journal/.test(page)) return 'This footer turns reading intent into action with related pages, newsletter capture, and a clear contact route.';
  const nature = projectNature(site);
  const map = {
    commerce: 'Footer content prioritises sale categories, support, delivery reassurance, and quick product routes.',
    hospitality: 'Footer content keeps booking, opening times, location, and menu confidence close to the final scroll.',
    care: 'Footer content gives cautious visitors reassurance, contact details, official information, and one calm next step.',
    education: 'Footer content helps families compare learning options, contact the team, and keep useful guidance close.',
    software: 'Footer content keeps product proof, demo intent, support, and company information easy to scan.'
  };
  return map[nature] || site.content.localProof || site.content.microcopy.contactHint;
}

function imageUrl(site, purpose, w = 1200, h = 900) {
  const generatedAsset = generatedImageForPurpose(site, purpose);
  if (generatedAsset) return generatedAsset;
  const libraries = {
    commerce: [
      'https://images.unsplash.com/photo-1542291026-7eec264c27ff',
      'https://images.unsplash.com/photo-1525966222134-fcfa99b8ae77',
      'https://images.unsplash.com/photo-1549298916-b41d501d3772',
      'https://images.unsplash.com/photo-1460353581641-37baddab0fa2'
    ],
    hospitality: [
      'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4',
      'https://images.unsplash.com/photo-1555396273-367ea4eb4db5',
      'https://images.unsplash.com/photo-1414235077428-338989a2e8c0',
      'https://images.unsplash.com/photo-1504674900247-0877df9cc836'
    ],
    care: [
      'https://images.unsplash.com/photo-1505751172876-fa1923c5c528',
      'https://images.unsplash.com/photo-1588776814546-1ffcf47267a5',
      'https://images.unsplash.com/photo-1606811971618-4486d14f3f99',
      'https://images.unsplash.com/photo-1576091160550-2173dba999ef'
    ],
    professional: [
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
      'https://images.unsplash.com/photo-1553877522-43269d4ea984',
      'https://images.unsplash.com/photo-1551434678-e076c223a692',
      'https://images.unsplash.com/photo-1517245386807-bb43f82c33c4'
    ],
    fitness: [
      'https://images.unsplash.com/photo-1534438327276-14e5300c3a48',
      'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b',
      'https://images.unsplash.com/photo-1540497077202-7c8a3999166f',
      'https://images.unsplash.com/photo-1518611012118-696072aa579a'
    ],
    portfolio: [
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
      'https://images.unsplash.com/photo-1518005020951-eccb494ad742',
      'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
      'https://images.unsplash.com/photo-1553877522-43269d4ea984'
    ],
    software: [
      'https://images.unsplash.com/photo-1519389950473-47ba0277781c',
      'https://images.unsplash.com/photo-1498050108023-c5249f4df085',
      'https://images.unsplash.com/photo-1551434678-e076c223a692',
      'https://images.unsplash.com/photo-1553877522-43269d4ea984'
    ],
    property: [
      'https://images.unsplash.com/photo-1560518883-ce09059eeffa',
      'https://images.unsplash.com/photo-1600585154340-be6161a56a0c',
      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c',
      'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3'
    ],
    event: [
      'https://images.unsplash.com/photo-1505373877841-8d25f7d46678',
      'https://images.unsplash.com/photo-1492684223066-81342ee5ff30',
      'https://images.unsplash.com/photo-1511795409834-ef04bbd61622',
      'https://images.unsplash.com/photo-1528605248644-14dd04022da1'
    ],
    education: [
      'https://images.unsplash.com/photo-1523580846011-d3a5bc25702b',
      'https://images.unsplash.com/photo-1509062522246-3755977927d7',
      'https://images.unsplash.com/photo-1523240795612-9a054b0db644',
      'https://images.unsplash.com/photo-1516321318423-f06f85e504b3'
    ],
    service: [
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72',
      'https://images.unsplash.com/photo-1521737604893-d14cc237f11d',
      'https://images.unsplash.com/photo-1556761175-b413da4baf72',
      'https://images.unsplash.com/photo-1517048676732-d65bc937f952'
    ]
  };
  const purposeText = `${purpose || ''} ${site.brief.industry || ''} ${site.blueprint?.businessType || ''}`.toLowerCase();
  const detectedNature = /software|technology|digital|app|platform|web|saas|it/.test(purposeText) ? 'software' : projectNature(site);
  const library = libraries[detectedNature] || libraries.service;
  const direction = site.content.imageDirection?.[purpose] || '';
  const seedBase = `${site.generationSeed}-${site.brief.businessName}-${purpose}-${direction}`;
  const base = library[hashNumber(seedBase) % library.length];
  return `${base}?auto=format&fit=crop&w=${w}&h=${h}&q=84`;
}

function generatedImageForPurpose(site, purpose) {
  const assets = site.assetMap || {};
  if (assets[purpose] && !isFallbackAsset(site, assets[purpose])) return assets[purpose];
  const p = String(purpose || '').toLowerCase();
  const candidates = [
    [/hero|magazine|poster|home|landing/, 'heroSeed'],
    [/texture|detail|inset/, 'textureSeed'],
    [/service|treatment|feature|subject|course|lesson|learning/, 'serviceSeed'],
    [/about|story/, 'about story'],
    [/product|shop|catalog|arrival|lookbook|commerce|shoe|retail/, 'productSeed'],
    [/work|portfolio|case|gallery|mosaic|proof|testimonial|result/, 'workSeed']
  ];
  const match = candidates.find(([pattern]) => pattern.test(p));
  if (match && assets[match[1]] && !isFallbackAsset(site, assets[match[1]])) return assets[match[1]];
  const generated = Array.isArray(site.generatedImages) ? site.generatedImages : [];
  const scored = generated
    .filter((asset) => asset.file && !asset.fallback)
    .map((asset) => ({ asset, score: assetScore(`${asset.id || ''} ${asset.purpose || ''}`, p) }))
    .sort((a, b) => b.score - a.score);
  return scored[0]?.score > 0 ? scored[0].asset.file : '';
}

function isFallbackAsset(site, file) {
  if (process.env.USE_LOCAL_FALLBACK_IMAGES === 'true') return false;
  return (site.generatedImages || []).some((asset) => asset.file === file && asset.fallback);
}

function assetScore(assetText, purposeText) {
  const a = String(assetText || '').toLowerCase();
  const p = String(purposeText || '').toLowerCase();
  const groups = [
    ['hero', 'home', 'landing', 'magazine', 'poster'],
    ['texture', 'detail', 'inset', 'material'],
    ['service', 'subject', 'course', 'treatment', 'feature', 'lesson', 'learning'],
    ['about', 'story', 'founder', 'mission'],
    ['product', 'shop', 'catalog', 'arrival', 'lookbook', 'commerce', 'shoe', 'retail', 'sale'],
    ['work', 'portfolio', 'case', 'gallery', 'mosaic', 'proof', 'testimonial', 'result']
  ];
  let score = 0;
  for (const group of groups) {
    const inAsset = group.some((word) => a.includes(word));
    const inPurpose = group.some((word) => p.includes(word));
    if (inAsset && inPurpose) score += 10;
  }
  for (const word of p.split(/[^a-z0-9]+/).filter((item) => item.length > 3)) {
    if (a.includes(word)) score += 2;
  }
  return score;
}

function cleanPagePurpose(site, pageItem, fallback = '') {
  const value = String(pageItem?.purpose || '').trim();
  const instructionLike = /^(provide|showcase|support|explain|create|include|present|describe|highlight|display|build|page for)\b/i.test(value);
  const tooThin = value.length < 48 && /\b(company|background|mission|services|team|contact|portfolio|page)\b/i.test(value);
  if (!value || instructionLike || tooThin) return fallback || site.content.hero.subtext || site.brief.aboutText;
  return value;
}

function pageHeadline(site, pageItem) {
  const title = String(pageItem?.title || '').trim();
  const text = `${title} ${pageItem?.slug || ''}`.toLowerCase();
  if (/about|story|mission|values/.test(text)) return `About ${site.brief.businessName}`;
  if (/team|people|staff|expert/.test(text)) return `Meet the people behind ${site.brief.businessName}`;
  if (/portfolio|work|case|gallery|lookbook/.test(text)) return `Selected work from ${site.brief.businessName}`;
  if (/service|solution|offer/.test(text)) return `${site.brief.businessName} services`;
  if (/contact|enquiry|booking|visit|map|location/.test(text)) return `Speak to ${site.brief.businessName}`;
  if (/blog|journal|article|insight|news/.test(text)) return `Ideas from ${site.brief.businessName}`;
  return title || site.brief.businessName;
}

function pageDescription(site, pageItem, title = '') {
  const text = `${title} ${pageItem?.slug || ''}`.toLowerCase();
  if (/about|story|mission|values/.test(text)) return cleanPagePurpose(site, pageItem, site.brief.aboutText || site.content.localProof);
  if (/team|people|staff|expert/.test(text)) return cleanPagePurpose(site, pageItem, `Meet the people behind ${site.brief.businessName}.`);
  if (/portfolio|work|case|gallery|lookbook/.test(text)) return cleanPagePurpose(site, pageItem, `Selected work, results, and project thinking from ${site.brief.businessName}.`);
  if (/service|solution|offer/.test(text)) return cleanPagePurpose(site, pageItem, `${site.brief.businessName} services, process, and useful guidance.`);
  if (/contact|enquiry|booking|visit|map|location/.test(text)) return cleanPagePurpose(site, pageItem, `Contact ${site.brief.businessName} for enquiries, directions, and next steps.`);
  return cleanPagePurpose(site, pageItem, site.content.hero.subtext || `${title} for ${site.brief.businessName}.`);
}

function trustPills(site) {
  return (site.content.trustSignals || []).slice(0, 5).map((item) => `<span>${esc(item)}</span>`).join('');
}

function hashNumber(value) {
  return [...String(value)].reduce((sum, char) => sum + char.charCodeAt(0), 0);
}

function pageIntent(pageItem) {
  const title = `${pageItem.title || ''} ${pageItem.slug || ''}`.toLowerCase();
  const text = `${title} ${pageItem.purpose || ''} ${(pageItem.sections || []).join(' ')} ${pageItem.conversionTarget || ''}`.toLowerCase();
  if (/home|landing|welcome/.test(title)) return 'home';
  if (/contact|enquiry|booking|visit|map|location/.test(title)) return 'contact';
  if (/sale|offer|discount|deal|clearance/.test(title)) return 'campaign';
  if (/arrival|lookbook|gallery|portfolio|new/.test(title)) return 'lookbook';
  if (/shop|catalog|product|collection|store|browse/.test(title)) return 'catalog';
  if (/size|guide|faq|help|support|how|measurement/.test(title)) return 'guide';
  if (/about|story|mission|values/.test(title)) return 'story';
  if (/team|people|staff|expert/.test(title)) return 'people';
  if (/blog|journal|article|insight|news/.test(title)) return 'journal';
  if (/contact|enquiry|booking|visit|map|location/.test(text)) return 'contact';
  if (/sale|offer|discount|deal|clearance/.test(text)) return 'campaign';
  if (/arrival|lookbook|gallery|portfolio|new stock/.test(text)) return 'lookbook';
  if (/shop|catalog|product|collection|store|browse/.test(text)) return 'catalog';
  if (/size|guide|faq|help|support|how|measurement/.test(text)) return 'guide';
  if (/about|story|mission|values/.test(text)) return 'story';
  if (/team|people|staff|expert/.test(text)) return 'people';
  if (/blog|journal|article|insight|news/.test(text)) return 'journal';
  return 'general';
}

function layoutPoolFor(intent) {
  const pools = {
    home: ['heroSplit', 'heroEditorial', 'heroShowcase', 'heroMagazine', 'heroPoster', 'heroProductWall'],
    catalog: ['catalogSidebar', 'catalogEditorial', 'catalogRows'],
    campaign: ['campaignTicket', 'campaignStack', 'campaignComparison'],
    lookbook: ['lookbookLead', 'lookbookMasonry', 'lookbookStrip'],
    guide: ['guideTable', 'guideSteps', 'guideAccordion'],
    story: ['storyTimeline', 'storyManifesto', 'storySplit'],
    people: ['peopleEditorial', 'peopleDirectory', 'peopleSpotlight'],
    journal: ['journalFeature', 'journalIndex', 'journalSearch'],
    contact: ['contactSplit', 'contactPanel', 'contactStack'],
    general: ['genericEditorial', 'genericChecklist', 'genericMosaic', 'genericBand']
  };
  return pools[intent] || pools.general;
}

function assignPageLayouts(site) {
  const used = new Set();
  return site.blueprint.pages.map((pageItem, index) => {
    const intent = pageIntent(pageItem);
    const pool = layoutPoolFor(intent);
    const requested = String(pageItem.layoutArchetype || pageItem.layout || '').trim();
    if (site.metadata?.lockLayouts && requested && pool.includes(requested) && !used.has(requested)) {
      used.add(requested);
      return { ...pageItem, __intent: intent, __layout: requested };
    }
    const seed = hashNumber(`${site.generationSeed}-${site.brief.businessName}-${site.brief.industry}-${pageItem.title}-${pageItem.purpose}-${index}`);
    let layout = pool[seed % pool.length];
    let tries = 0;
    while (used.has(layout) && tries < pool.length) {
      layout = pool[(seed + tries + 1) % pool.length];
      tries += 1;
    }
    used.add(layout);
    return { ...pageItem, __intent: intent, __layout: layout };
  });
}

function pageSectionItems(pageItem) {
  const sections = Array.isArray(pageItem.sections) && pageItem.sections.length ? pageItem.sections : ['Overview', 'Proof', 'Next step'];
  return sections.map((section) => String(section));
}

function goalCopy(site, pageItem, section) {
  const goal = pageItem.conversionTarget || pageItem.purpose || site.blueprint?.primaryGoal || site.content.microcopy.contactHint;
  return `${section} is shaped around one job: ${goal}. The layout keeps the visitor moving with context, proof, and a clear action.`;
}

function projectNature(site) {
  const declared = String(site.blueprint?.projectNature || '').toLowerCase();
  if (['commerce', 'hospitality', 'care', 'professional', 'fitness', 'portfolio', 'software', 'property', 'event', 'education', 'service'].includes(declared)) return declared;
  const text = `${site.brief.industry || ''} ${site.blueprint?.businessType || ''} ${site.blueprint?.primaryGoal || ''} ${site.metadata?.prompt || ''}`.toLowerCase();
  if (/insolvency|restructuring|business advisory|financial distress|advisory|accountant|accounting|consultant|consulting|finance|solicitor|law|legal|professional/.test(text)) return 'professional';
  if (/tutor|tuition|teacher|student|school|course|education|academy|learning|lesson|gcse|a-level|maths|english/.test(text)) return 'education';
  if (/shoe|shop|retail|e-?commerce|store|product|fashion|clothing|jewellery|jewelry/.test(text)) return 'commerce';
  if (/restaurant|cafe|bar|bakery|takeaway|food|menu|reservation/.test(text)) return 'hospitality';
  if (/clinic|dental|physio|health|therapy|medical|wellness|salon|spa/.test(text)) return 'care';
  if (/saas|software|app|platform|dashboard|automation|crm/.test(text)) return 'software';
  if (/gym|fitness|trainer|yoga|pilates|sport/.test(text)) return 'fitness';
  if (/portfolio|photography|artist|designer|architect|studio|creative/.test(text)) return 'portfolio';
  if (/estate|property|real estate|letting|homes|apartments/.test(text)) return 'property';
  if (/event|conference|festival|wedding|venue|ticket/.test(text)) return 'event';
  return 'service';
}

function visualMood(site) {
  return ['ink', 'paper', 'contrast', 'soft'][site.designVariant % 4];
}

function alternateHref(site, fallback = 'contact.html') {
  const links = navLinks(site).filter(([href]) => href !== 'index.html' && !href.includes('privacy'));
  return links[(site.designVariant + links.length) % Math.max(links.length, 1)]?.[0] || fallback;
}

function dynamicCustomerPage(site, pageItem, index = 0) {
  if (pageIntent(pageItem) === 'home') return withHomeDepth(site, natureHome(site, pageItem));
  const layout = pageItem.__layout || layoutPoolFor(pageIntent(pageItem))[index % layoutPoolFor(pageIntent(pageItem)).length];
  const renderers = {
    heroSplit: dynamicHomeSplit,
    heroEditorial: dynamicHomeEditorial,
    heroShowcase: dynamicHomeShowcase,
    heroMagazine: dynamicHomeMagazine,
    heroPoster: dynamicHomePoster,
    heroProductWall: dynamicHomeProductWall,
    catalogSidebar: retailShopPage,
    catalogEditorial: retailCatalogEditorial,
    catalogRows: retailCatalogRows,
    campaignTicket: retailSalePage,
    campaignStack: retailCampaignStack,
    campaignComparison: retailCampaignComparison,
    lookbookLead: retailArrivalsPage,
    lookbookMasonry: retailLookbookMasonry,
    lookbookStrip: retailLookbookStrip,
    guideTable: sizeGuidePage,
    guideSteps: guideStepsPage,
    guideAccordion: guideAccordionPage,
    storyTimeline: storyTimelinePage,
    storyManifesto: storyManifestoPage,
    storySplit: storySplitPage,
    peopleEditorial: premiumTeam,
    peopleDirectory: peopleDirectoryPage,
    peopleSpotlight: peopleSpotlightPage,
    journalFeature: premiumBlog,
    journalIndex: journalIndexPage,
    journalSearch: journalSearchPage,
    contactSplit: premiumContact,
    contactPanel: contactPanelPage,
    contactStack: contactStackPage,
    genericEditorial: blueprintGenericPage,
    genericChecklist: genericChecklistPage,
    genericMosaic: genericMosaicPage,
    genericBand: genericBandPage
  };
  return (renderers[layout] || blueprintGenericPage)(site, pageItem, index);
}

function withHomeDepth(site, heroMarkup) {
  const modules = homeDepthPlan(site).map((module) => homeDepthModule(site, module)).filter(Boolean).join('');
  return `${heroMarkup}${modules}`;
}

function homeDepthPlan(site) {
  const nature = projectNature(site);
  const plans = {
    commerce: ['services', 'proof', 'benefits', 'keywords', 'cta'],
    hospitality: ['image', 'services', 'proof', 'faq', 'cta'],
    care: ['benefits', 'image', 'services', 'faq', 'proof', 'cta'],
    professional: ['benefits', 'services', 'proof', 'faq', 'cta'],
    fitness: ['services', 'proof', 'image', 'benefits', 'cta'],
    portfolio: ['image', 'proof', 'benefits', 'cta'],
    software: ['benefits', 'proof', 'services', 'faq', 'cta'],
    property: ['image', 'services', 'proof', 'benefits', 'cta'],
    event: ['services', 'image', 'proof', 'faq', 'cta'],
    education: ['image', 'services', 'benefits', 'proof', 'faq', 'cta'],
    service: ['image', 'benefits', 'services', 'proof', 'faq', 'cta']
  };
  const base = [...(plans[nature] || plans.service)];
  const first = base.shift();
  const last = base.pop();
  const rotation = site.designVariant % Math.max(base.length, 1);
  const middle = base.slice(rotation).concat(base.slice(0, rotation));
  return [first, ...middle, last].filter(Boolean);
}

function homeDepthModule(site, module) {
  if (module === 'image') return homeImageDepth(site);
  if (module === 'keywords') return homeKeywordDepth(site);
  if (module === 'benefits') return homeBenefitDepth(site);
  if (module === 'services') return homeServiceDepth(site);
  if (module === 'proof') return homeProofDepth(site);
  if (module === 'faq') return homeFaqDepth(site);
  if (module === 'cta') return homeCtaDepth(site);
  return '';
}

function homeImageDepth(site) {
  return `<section class="home-image-depth">
    <figure class="reveal"><img src="${imageUrl(site, 'hero home visual', 1200, 820)}" alt="${esc(site.brief.businessName)} ${esc(site.brief.industry)} visual direction"><figcaption>${esc(site.content.hero.kicker || `${site.brief.location} ${site.brief.industry}`)}</figcaption></figure>
    <div class="reveal"><p class="eyebrow">Built for the decision visitors are making</p><h2>${esc(site.content.hero.headline)}</h2><p>${esc(site.content.hero.subtext)}</p><p>${esc(site.content.microcopy.contactHint)}</p><a class="button" href="contact.html">${esc(site.content.hero.primaryCta || 'Start the conversation')}</a></div>
  </section>`;
}

function homeKeywordDepth(site) {
  return `<section class="home-keyword-depth">
    <div class="section-heading reveal"><p class="eyebrow">${esc(site.brief.location)} ${esc(site.brief.industry)}</p><h2>${esc(site.content.brandThesis)}</h2><p>${esc(site.content.localProof)}</p></div>
    <div class="keyword-cloud reveal">${homeKeywords(site).map((keyword) => `<span>${esc(keyword)}</span>`).join('')}</div>
  </section>`;
}

function homeBenefitDepth(site) {
  const labels = {
    commerce: 'Why shoppers trust it',
    hospitality: 'Why guests choose it',
    care: 'Why patients feel confident',
    professional: `Why choose ${site.brief.businessName}`,
    education: 'Why families enquire',
    software: 'Why teams request a demo',
    property: 'Why sellers and buyers keep reading',
    event: 'Why attendees commit',
    portfolio: 'Why the work stands out',
    fitness: 'Why members stay consistent'
  };
  return `<section class="home-benefit-board">
    <aside class="reveal"><p class="eyebrow">${esc(labels[projectNature(site)] || `Why choose ${site.brief.businessName}`)}</p><h2>Useful proof before visitors make contact.</h2><p>${esc(site.content.microcopy.bookingReassurance)}</p></aside>
    <div>${site.content.differentiators.slice(0, 4).map((item, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join('')}</div>
  </section>`;
}

function homeServiceDepth(site) {
  const title = {
    commerce: 'Featured products, sale routes, and product questions.',
    hospitality: 'Menu, booking, and visit decisions made easier.',
    care: 'Treatments and reassurance visitors can compare.',
    professional: 'Clear routes for high-trust decisions.',
    education: 'Learning options, outcomes, and enquiry routes.',
    software: 'Product workflows and practical use cases.',
    property: 'Property services, local intent, and next steps.',
    event: 'Programme, tickets, and attendance decisions.',
    fitness: 'Classes, memberships, and first-session paths.'
  }[projectNature(site)] || 'Clear routes for the exact things people are looking for.';
  return `<section class="home-service-depth">
    <div class="section-heading reveal"><p class="eyebrow">Services and search topics</p><h2>Clear routes for the exact things people are looking for.</h2></div>
    <div class="premium-list">${site.content.services.slice(0, 6).map((service) => `<article class="reveal"><h3>${esc(service.title)}</h3><p>${esc(service.description)}</p><ul>${(service.bullets || []).slice(0, 3).map((bullet) => `<li>${esc(bullet)}</li>`).join('')}</ul><a class="text-link" href="${alternateHref(site, 'services.html')}">Explore ${esc(service.title)}</a></article>`).join('')}</div>
  </section>`.replace('Clear routes for the exact things people are looking for.', esc(title));
}

function homeProofDepth(site) {
  return `<section class="home-proof-depth">
    <div class="stats-depth">${site.content.stats.map((stat) => `<article class="reveal"><strong data-count="${stat.value}">0</strong><span>${esc(stat.label)}</span></article>`).join('')}</div>
    <div class="testimonial-rail">${site.content.testimonials.slice(0, 3).map((testimonial) => `<blockquote class="reveal"><p>"${esc(testimonial.quote)}"</p><cite>${esc(testimonial.name)}${testimonial.context ? ` / ${esc(testimonial.context)}` : ''}</cite></blockquote>`).join('')}</div>
  </section>`;
}

function homeFaqDepth(site) {
  return `<section class="home-faq-depth">
    <div class="section-heading reveal"><p class="eyebrow">Questions before enquiry</p><h2>Answers that help people decide faster.</h2></div>
    <div class="faq-columns">${site.content.faqs.slice(0, 5).map((faq) => `<details class="reveal"><summary>${esc(faq.question)}</summary><p>${esc(faq.answer)}</p></details>`).join('')}</div>
  </section>`;
}

function homeCtaDepth(site) {
  return `<section class="journal-cta home-final-cta"><div class="reveal"><p class="eyebrow">Next step</p><h2>${esc(site.content.conversionPrompts[0]?.title || `Start with ${site.brief.businessName}`)}</h2><p>${esc(site.content.conversionPrompts[0]?.text || site.content.microcopy.contactHint)}</p></div><div class="cta-card reveal"><h2>${esc(site.content.blogPosts[0]?.title || 'Useful guide')}</h2><p>${esc(site.content.blogPosts[0]?.intro || site.content.microcopy.newsletter)}</p><a class="button" href="contact.html">${esc(site.content.conversionPrompts[0]?.cta || 'Contact us')}</a></div></section>`;
}

function homeKeywords(site) {
  const strategy = site.content?.seoStrategy || normalizeSiteSeoStrategy(site);
  const base = [
    site.brief.businessName,
    site.brief.industry,
    site.brief.location,
    `${site.brief.industry} in ${site.brief.location}`,
    site.blueprint?.businessType,
    site.blueprint?.primaryGoal,
    ...strategy.primaryKeywords,
    ...strategy.secondaryKeywords,
    ...strategy.localModifiers
  ];
  const serviceTerms = site.content.services.flatMap((service) => [service.title, ...(service.bullets || [])]);
  return [...new Set(base.concat(serviceTerms).filter(Boolean).map((item) => String(item).trim()).filter((item) => item.length > 2))].slice(0, 16);
}

function natureHome(site, pageItem) {
  const renderers = {
    commerce: commerceHome,
    hospitality: hospitalityHome,
    care: careHome,
    professional: professionalHome,
    fitness: fitnessHome,
    portfolio: portfolioHome,
    software: softwareHome,
    property: propertyHome,
    event: eventHome,
    education: educationHome,
    service: serviceHome
  };
  return (renderers[projectNature(site)] || serviceHome)(site, pageItem);
}

function commerceHome(site, pageItem) {
  const products = retailProducts(site).slice(0, 6);
  const heroFirst = site.designVariant % 2 === 0;
  const wall = `<section class="commerce-wall"><div class="commerce-copy reveal"><p class="eyebrow">${esc(site.brief.businessName)}</p><h1>${esc(site.content.hero.headline)}</h1><p>${esc(site.content.hero.subtext)}</p><a class="button" href="${alternateHref(site, 'shop.html')}">${esc(site.content.hero.primaryCta || 'Shop now')}</a></div><div class="wall-products">${products.map((product, i) => `<article class="reveal"><img src="${imageUrl(site, `commerce product ${product.title} ${i}`, 560, 700)}" alt="${esc(product.title)}"><h2>${esc(product.title)}</h2><p>${product.price}</p></article>`).join('')}</div></section>`;
  const edit = `<section class="commerce-edit"><div class="section-heading reveal"><p class="eyebrow">The edit</p><h2>${esc(site.content.localProof)}</h2></div><div class="deal-grid">${products.slice(0, 3).map((product, i) => productCard(site, product, i, i === 0 ? 'Best pick' : product.category)).join('')}</div></section>`;
  return heroFirst ? wall + edit : edit + wall;
}

function hospitalityHome(site, pageItem) {
  const items = site.content.services.slice(0, 5);
  return `<section class="hospitality-hero"><div class="reveal"><p class="eyebrow">${esc(site.brief.location)}</p><h1>${esc(site.content.hero.headline)}</h1><p>${esc(site.content.hero.subtext)}</p><a class="button" href="contact.html">Reserve a table</a></div><img class="reveal" src="${imageUrl(site, `restaurant room ${site.generationSeed}`, 1200, 900)}" alt="${esc(site.brief.businessName)}"></section>
  <section class="menu-board"><div><p class="eyebrow">Menu highlights</p><h2>What people come in for.</h2></div>${items.map((item) => `<article class="reveal"><h2>${esc(item.title)}</h2><p>${esc(item.description)}</p></article>`).join('')}</section>
  <section class="booking-strip reveal"><strong>Open this week</strong><span>${esc(site.brief.address)}</span><a class="button secondary" href="contact.html">Book now</a></section>`;
}

function careHome(site, pageItem) {
  return `<section class="care-hero"><div class="reveal"><p class="eyebrow">${esc(site.brief.industry)}</p><h1>${esc(site.content.hero.headline)}</h1><p>${esc(site.content.hero.subtext)}</p><div class="trust-pills">${trustPills(site)}</div><a class="button" href="contact.html">${esc(site.content.hero.primaryCta || 'Book an appointment')}</a></div><div class="care-card reveal"><h2>Start with clarity</h2><ol>${site.content.processSteps.slice(0, 3).map((step) => `<li><strong>${esc(step.title)}</strong><span>${esc(step.text)}</span></li>`).join('')}</ol></div></section>
  <section class="service-showcase">${site.content.services.slice(0, 4).map((s, i) => `<article class="service-row reveal"><div><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(s.title)}</h2><p>${esc(s.description)}</p></div><ul>${(s.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></article>`).join('')}</section>`;
}

function professionalHome(site, pageItem) {
  return `<section class="professional-hero"><aside class="reveal"><p class="eyebrow">${esc(site.brief.industry)}</p><h1>${esc(site.content.hero.headline)}</h1></aside><div class="reveal"><p class="lede">${esc(site.content.hero.subtext)}</p><a class="button" href="contact.html">Request consultation</a></div></section>
  <section class="proof-ledger">${site.content.differentiators.slice(0, 3).map((item, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p></article>`).join('')}</section>
  <section class="practice-matrix">${site.content.services.slice(0, 6).map((s) => `<article class="reveal"><h2>${esc(s.title)}</h2><p>${esc(s.description)}</p></article>`).join('')}</section>`;
}

function fitnessHome(site, pageItem) {
  return `<section class="fitness-hero"><div class="reveal"><p class="eyebrow">${esc(site.brief.location)}</p><h1>${esc(site.content.hero.headline)}</h1><p>${esc(site.content.hero.subtext)}</p><a class="button" href="contact.html">Join now</a></div></section>
  <section class="fitness-programs">${site.content.services.slice(0, 4).map((s, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(s.title)}</h2><p>${esc(s.description)}</p></article>`).join('')}</section>
  <section class="home-proof-ledger">${site.content.stats.map((s) => `<article class="reveal"><strong data-count="${s.value}">0</strong><span>${esc(s.label)}</span></article>`).join('')}</section>`;
}

function portfolioHome(site, pageItem) {
  const work = site.content.services.slice(0, 5);
  return `<section class="portfolio-hero"><p class="eyebrow reveal">${esc(site.brief.businessName)}</p><h1 class="reveal">${esc(site.content.hero.headline)}</h1><p class="reveal">${esc(site.content.hero.subtext)}</p></section>
  <section class="case-wall">${work.map((item, i) => `<article class="reveal ${i === 0 ? 'case-large' : ''}"><img src="${imageUrl(site, `case work ${i} ${site.generationSeed}`, 900, 650)}" alt=""><div><h2>${esc(item.title)}</h2><p>${esc(item.description)}</p></div></article>`).join('')}</section>`;
}

function softwareHome(site, pageItem) {
  return `<section class="software-hero"><div class="reveal"><p class="eyebrow">${esc(site.brief.industry)}</p><h1>${esc(site.content.hero.headline)}</h1><p>${esc(site.content.hero.subtext)}</p><a class="button" href="contact.html">Request demo</a></div><div class="product-signal-board reveal">${site.content.differentiators.slice(0, 4).map((item, i) => `<article><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p></article>`).join('')}</div></section>
  <section class="feature-flow">${site.content.differentiators.slice(0, 4).map((item, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p></article>`).join('')}</section>`;
}

function propertyHome(site, pageItem) {
  return `<section class="property-hero"><div class="reveal"><p class="eyebrow">${esc(site.brief.location)}</p><h1>${esc(site.content.hero.headline)}</h1><p>${esc(site.content.hero.subtext)}</p></div><form class="property-search reveal"><label>Area<input value="${esc(site.brief.location)}"></label><label>Budget<input placeholder="£"></label><button class="button">Search</button></form></section>
  <section class="property-listings">${site.content.services.slice(0, 4).map((s, i) => `<article class="reveal"><img src="${imageUrl(site, `property ${i} ${site.generationSeed}`, 800, 560)}" alt=""><h2>${esc(s.title)}</h2><p>${esc(s.description)}</p></article>`).join('')}</section>`;
}

function eventHome(site, pageItem) {
  return `<section class="event-hero"><p class="eyebrow reveal">${esc(site.brief.location)}</p><h1 class="reveal">${esc(site.content.hero.headline)}</h1><p class="reveal">${esc(site.content.hero.subtext)}</p><a class="button reveal" href="contact.html">Get tickets</a></section>
  <section class="schedule-board">${site.content.processSteps.slice(0, 4).map((step, i) => `<article class="reveal"><time>${10 + i}:00</time><h2>${esc(step.title)}</h2><p>${esc(step.text)}</p></article>`).join('')}</section>`;
}

function educationHome(site, pageItem) {
  return `<section class="education-hero"><div class="reveal"><p class="eyebrow">${esc(site.brief.industry)}</p><h1>${esc(site.content.hero.headline)}</h1><p>${esc(site.content.hero.subtext)}</p><a class="button" href="contact.html">Enquire about tutoring</a></div><figure class="education-visual reveal"><img src="${imageUrl(site, 'education tutor hero learning', 1100, 820)}" alt="${esc(site.brief.businessName)} tutoring session"><figcaption>${esc(site.content.trustSignals[0] || 'Focused private learning')}</figcaption></figure><div class="learning-card reveal"><h2>Learning path</h2>${site.content.processSteps.slice(0, 3).map((step) => `<p><strong>${esc(step.title)}</strong><br>${esc(step.text)}</p>`).join('')}</div></section>
  <section class="course-grid">${site.content.services.slice(0, 6).map((s, i) => serviceRichCard(site, s, i, 'learning option')).join('')}</section>
  <section class="education-proof-panel"><div class="reveal"><p class="eyebrow">Parent and student confidence</p><h2>${esc(site.content.brandThesis)}</h2><p>${esc(site.content.localProof)}</p></div><div>${site.content.faqs.slice(0, 3).map((faq) => `<details class="reveal"><summary>${esc(faq.question)}</summary><p>${esc(faq.answer)}</p></details>`).join('')}</div></section>`;
}

function serviceRichCard(site, service, index, label = 'service') {
  const bullets = (service.bullets || []).slice(0, 3).map((bullet) => `<li>${esc(bullet)}</li>`).join('');
  const trustSignals = Array.isArray(site.content.trustSignals) ? site.content.trustSignals : [];
  const proof = trustSignals[index % Math.max(trustSignals.length, 1)] || site.content.microcopy.bookingReassurance;
  return `<article class="service-rich-card reveal"><span>${String(index + 1).padStart(2, '0')} ${esc(label)}</span><h2>${esc(service.title)}</h2><p>${esc(service.description)}</p>${bullets ? `<ul>${bullets}</ul>` : ''}<p class="card-proof">${esc(service.outcome || proof)}</p></article>`;
}

function serviceHome(site, pageItem) {
  return dynamicHomeEditorial(site, pageItem);
}

function dynamicHomeSplit(site, pageItem) {
  const cls = site.designVariant % 2 === 0 ? 'home-split home-image-right' : 'home-split home-image-left';
  const html = premiumHome(site).replace('premium-hero immersive', `premium-hero immersive ${cls}`);
  return site.designVariant % 3 === 0 ? html.replace('<section class="proof-strip"', '<section class="brand-thesis compact-thesis"><p class="reveal">' + esc(site.content.localProof) + '</p></section><section class="proof-strip"') : html;
}

function dynamicHomeEditorial(site, pageItem) {
  const c = site.content;
  const flip = site.designVariant % 2 ? ' home-editorial-flip' : '';
  return `<section class="home-editorial${flip}"><div class="reveal"><p class="eyebrow">${esc(c.hero.kicker || site.brief.industry)}</p><h1>${esc(c.hero.headline)}</h1><p class="lede">${esc(c.hero.subtext)}</p><a class="button" href="${alternateHref(site)}">${esc(c.hero.primaryCta || 'Start browsing')}</a></div><img class="reveal" src="${imageUrl(site, `hero editorial ${site.generationSeed}`, 1200, 1400)}" alt="${esc(site.brief.industry)}"></section>
  <section class="home-proof-ledger">${site.content.stats.map((s) => `<article class="reveal"><strong data-count="${s.value}">0</strong><span>${esc(s.label)}</span></article>`).join('')}</section>
  <section class="generic-mosaic"><div class="reveal"><h2>${esc(site.content.brandThesis)}</h2><p>${esc(site.content.localProof)}</p></div>${site.content.differentiators.slice(0, 3).map((item, i) => `<article class="reveal"><img src="${imageUrl(site, `home proof ${i}`, 700, 520)}" alt=""><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p></article>`).join('')}</section>`;
}

function dynamicHomeShowcase(site, pageItem) {
  const products = retailProducts(site).slice(0, 3);
  const featuredFirst = site.designVariant % 2 === 0;
  const thesis = `<section class="brand-thesis ${site.designVariant % 3 === 1 ? 'brand-thesis-light' : ''}"><p class="reveal">${esc(site.content.brandThesis)}</p></section>`;
  const showcase = `<section class="home-showcase"><div class="reveal"><p class="eyebrow">${esc(site.brief.businessName)}</p><h1>${esc(site.content.hero.headline)}</h1><p>${esc(site.content.hero.subtext)}</p></div><div class="showcase-rail">${products.map((product, i) => productCard(site, product, i, i === 0 ? 'Featured' : product.category)).join('')}</div></section>`;
  return `${featuredFirst ? showcase + thesis : thesis + showcase}
  <section class="journal-cta"><div class="reveal"><h2>${esc(site.content.conversionPrompts[0]?.title || pageItem.conversionTarget || 'Ready to start?')}</h2><p>${esc(site.content.conversionPrompts[0]?.text || site.content.microcopy.contactHint)}</p></div><div class="cta-card reveal"><h2>${esc(site.content.blogPosts[0].title)}</h2><p>${esc(site.content.blogPosts[0].intro)}</p></div></section>`;
}

function dynamicHomeMagazine(site, pageItem) {
  const c = site.content;
  const products = retailProducts(site).slice(0, 4);
  return `<section class="home-magazine"><div class="magazine-kicker reveal"><p class="eyebrow">${esc(site.brief.industry)}</p><span>${esc(site.brief.location)}</span></div><div class="magazine-title reveal"><h1>${esc(c.hero.headline)}</h1><p>${esc(c.hero.subtext)}</p><a class="button" href="${alternateHref(site)}">${esc(c.hero.primaryCta || 'Explore')}</a></div><div class="magazine-image reveal"><img src="${imageUrl(site, `magazine hero ${site.generationSeed}`, 900, 1200)}" alt="${esc(site.brief.businessName)}"></div></section>
  <section class="magazine-grid">${products.map((product, i) => `<article class="reveal"><span>${esc(product.category)}</span><h2>${esc(product.title)}</h2><p>${esc(product.text)}</p></article>`).join('')}</section>
  <section class="brand-thesis brand-thesis-light"><p class="reveal">${esc(c.localProof)}</p></section>`;
}

function dynamicHomePoster(site, pageItem) {
  const c = site.content;
  return `<section class="home-poster"><p class="eyebrow reveal">${esc(site.brief.businessName)}</p><h1 class="reveal">${esc(c.hero.headline)}</h1><div class="poster-bottom reveal"><p>${esc(c.hero.subtext)}</p><a class="button" href="${alternateHref(site)}">${esc(c.hero.primaryCta || 'Start')}</a></div></section>
  <section class="poster-proof">${c.differentiators.slice(0, 3).map((item) => `<article class="reveal"><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p></article>`).join('')}</section>
  <section class="split feature-split reveal"><img src="${imageUrl(site, `poster detail ${site.generationSeed}`, 1100, 760)}" alt=""><div><p class="eyebrow">Why it works</p><h2>${esc(c.brandThesis)}</h2><p>${esc(c.localProof)}</p></div></section>`;
}

function dynamicHomeProductWall(site, pageItem) {
  const products = retailProducts(site).slice(0, 6);
  return `<section class="home-product-wall"><div class="wall-copy reveal"><p class="eyebrow">${esc(site.brief.businessName)}</p><h1>${esc(site.content.hero.headline)}</h1><p>${esc(site.content.hero.subtext)}</p><a class="button" href="${alternateHref(site)}">${esc(site.content.hero.primaryCta || 'Browse')}</a></div><div class="wall-products">${products.map((product, i) => `<article class="reveal"><img src="${imageUrl(site, `product wall ${product.title} ${i}`, 520, 640)}" alt="${esc(product.title)}"><h2>${esc(product.title)}</h2></article>`).join('')}</div></section>
  <section class="home-proof-ledger">${site.content.stats.map((s) => `<article class="reveal"><strong data-count="${s.value}">0</strong><span>${esc(s.label)}</span></article>`).join('')}</section>`;
}

function premiumHome(site) {
  const { brief: b, content: c } = site;
  const serviceFeature = c.services[0] || { title: 'Specialist support', description: 'Focused help shaped around your goals.', bullets: [] };
  const proof = c.stats.map((s) => `<li><strong data-count="${s.value}">0</strong><span>${esc(s.label)}</span></li>`).join('');
  return `<section class="premium-hero immersive" data-parallax>
    <div class="hero-copy reveal">
      <p class="eyebrow">${esc(c.hero.kicker || `${b.location} ${b.industry}`)}</p>
      <h1>${esc(c.hero.headline)}</h1>
      <p class="lede">${esc(c.hero.subtext)}</p>
      <div class="trust-pills">${trustPills(site)}</div>
      <div class="hero-actions"><a class="button" href="contact.html">${esc(c.hero.primaryCta || 'Start with a conversation')}</a><a class="text-link" href="services.html">${esc(c.hero.secondaryCta || 'Explore services')}</a></div>
    </div>
    <div class="image-composition reveal">
      <img class="image-main" src="${imageUrl(site, 'heroSeed', 1100, 1400)}" alt="${esc(b.industry)} environment">
      <img class="image-inset" src="${imageUrl(site, 'textureSeed', 640, 820)}" alt="">
      <div class="floating-proof"><strong>${esc(b.location)}</strong><span>${esc(b.tagline)}</span></div>
    </div>
  </section>
  <section class="proof-strip" aria-label="Business highlights"><ul>${proof}</ul></section>
  <section class="brand-thesis"><p class="reveal">${esc(c.brandThesis)}</p></section>
  <section class="editorial split-scroll">
    <div class="sticky-note reveal"><p class="eyebrow">Why clients choose us</p><h2>${esc(c.localProof)}</h2></div>
    <div class="story-stack">${c.differentiators.map((item, i) => `<article class="story-card reveal"><span>0${i + 1}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></div></article>`).join('')}</div>
  </section>
  <section class="signature-service">
    <div class="section-heading reveal"><p class="eyebrow">Signature service</p><h2>${esc(serviceFeature.title)}</h2><p>${esc(serviceFeature.description)}</p></div>
    <div class="service-panel reveal"><img src="${imageUrl(site, 'serviceSeed', 1000, 650)}" alt=""><div><p class="service-outcome">${esc(serviceFeature.outcome || '')}</p><ul>${(serviceFeature.bullets || []).map((item) => `<li>${esc(item)}</li>`).join('')}</ul></div></div>
  </section>
  <section class="service-index"><div class="section-heading reveal"><p class="eyebrow">Services</p><h2>Structured offers that help visitors understand the next best step.</h2></div><div class="service-list premium-list">${c.services.map((s, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h3>${esc(s.title)}</h3><p>${esc(s.description)}</p><a href="services.html">View details</a></article>`).join('')}</div></section>
  <section class="process-band"><div class="section-heading reveal"><p class="eyebrow">How it works</p><h2>A calm, conversion-focused path from first visit to first enquiry.</h2></div><ol class="process">${c.processSteps.map((step, i) => `<li class="reveal"><span>${i + 1}</span><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></li>`).join('')}</ol></section>
  <section class="testimonials-premium"><div class="section-heading reveal"><p class="eyebrow">Client words</p><h2>Testimonials that sound human, specific, and believable.</h2></div><div class="testimonial-rail">${c.testimonials.map((t) => `<blockquote class="reveal"><p>"${esc(t.quote)}"</p><cite>${esc(t.name)}</cite></blockquote>`).join('')}</div></section>
  <section class="journal-cta"><div class="reveal"><p class="eyebrow">Latest guide</p><h2>${esc(c.blogPosts[0].title)}</h2><p>${esc(c.blogPosts[0].intro)}</p><a class="text-link" href="blog-post.html">Read the article</a></div><div class="cta-card reveal"><h2>${esc(c.conversionPrompts[0]?.title || 'Ready to make a confident enquiry?')}</h2><p>${esc(c.conversionPrompts[0]?.text || c.microcopy.contactHint)}</p><a class="button" href="contact.html">${esc(c.conversionPrompts[0]?.cta || `Contact ${b.businessName}`)}</a></div></section>`;
}

function premiumAbout(site) {
  const c = site.content;
  return `<section class="page-hero about-hero"><p class="eyebrow">About</p><h1>${esc(site.brief.aboutText)}</h1><div class="trust-pills">${trustPills(site)}</div></section>
  <section class="editorial"><div class="sticky-note reveal"><p class="eyebrow">The standard</p><h2>${esc(c.brandThesis)}</h2></div><div class="story-stack">${c.aboutParagraphs.map((p, i) => `<article class="story-card reveal"><span>${String(i + 1).padStart(2, '0')}</span><p>${esc(p)}</p></article>`).join('')}</div></section>
  <section class="values-band"><div class="section-heading reveal"><p class="eyebrow">What shapes the experience</p><h2>Clear thinking before decoration.</h2></div><div class="premium-list">${c.differentiators.map((item) => `<article class="reveal"><h3>${esc(item.title)}</h3><p>${esc(item.text)}</p></article>`).join('')}</div></section>
  <section class="split feature-split reveal"><img src="${imageUrl(site, 'heroSeed', 1100, 760)}" alt=""><div><p class="eyebrow">Local proof</p><h2>${esc(site.brief.location)} presence, specialist polish.</h2><p>${esc(c.localProof)}</p><a class="button" href="contact.html">Talk to us</a></div></section>`;
}

function premiumServices(site) {
  const c = site.content;
  return `<section class="page-hero"><p class="eyebrow">Services</p><h1>Choose the route that matches the problem, not a generic package.</h1><p>${esc(c.microcopy.bookingReassurance)}</p></section>
  <section class="service-showcase">${c.services.map((s, i) => `<article class="service-row reveal"><div><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(s.title)}</h2><p>${esc(s.description)}</p><p class="service-outcome">${esc(s.outcome || '')}</p></div><ul>${(s.bullets || []).map((b) => `<li>${esc(b)}</li>`).join('')}</ul></article>`).join('')}</section>
  <section class="process-band"><div class="section-heading reveal"><p class="eyebrow">Process</p><h2>Visitors should feel the method before they send the enquiry.</h2></div><ol class="process">${c.processSteps.map((step, i) => `<li class="reveal"><span>${i + 1}</span><h3>${esc(step.title)}</h3><p>${esc(step.text)}</p></li>`).join('')}</ol></section>
  <section class="content-narrow faq-list"><h2>Questions people ask before booking</h2>${c.faqs.map((f) => `<details><summary>${esc(f.question)}</summary><p>${esc(f.answer)}</p></details>`).join('')}</section>`;
}

function premiumTeam(site) {
  const c = site.content;
  return `<section class="page-hero"><p class="eyebrow">Team</p><h1>People visitors can believe in before they meet them.</h1><p>${esc(c.microcopy.bookingReassurance)}</p></section>
  <section class="team-editorial">${c.teamMembers.map((m, i) => `<article class="team-profile reveal"><img src="${imageUrl(site, `team editorial ${m.name} ${i}`, 720, 860)}" alt=""><div><p class="eyebrow">${esc(m.role)}</p><h2>${esc(m.name)}</h2><p>${esc(m.bio)}</p><a class="text-link" href="contact.html">Ask about availability</a></div></article>`).join('')}</section>
  <section class="cta-card team-cta reveal"><h2>${esc(c.conversionPrompts[1]?.title || 'Not sure who to see?')}</h2><p>${esc(c.conversionPrompts[1]?.text || c.microcopy.contactHint)}</p><a class="button" href="contact.html">${esc(c.conversionPrompts[1]?.cta || 'Ask a question')}</a></section>`;
}

function premiumBlog(site) {
  const posts = site.content.blogPosts;
  return `<section class="page-hero"><p class="eyebrow">Journal</p><h1>Useful thinking before someone becomes a client.</h1><p>Articles should earn trust, answer real objections, and create internal links with purpose.</p><input class="search" type="search" placeholder="Search articles"></section>
  <section class="journal-grid">${posts.map((p, i) => `<article class="${i === 0 ? 'featured-post' : ''} reveal"><p class="eyebrow">${esc(p.category)}</p><h2><a href="blog-post.html">${esc(p.title)}</a></h2><p>${esc(p.intro)}</p><a class="text-link" href="blog-post.html">Read guide</a></article>`).join('')}</section>`;
}

function premiumArticle(site) {
  const p = site.content.blogPosts[0];
  return `<article class="article-layout"><aside class="article-aside reveal"><p class="eyebrow">${today()} / ${esc(p.category)}</p><a class="text-link" href="${alternateHref(site, 'contact.html')}">Related service</a></aside><div class="article-body reveal"><h1>${esc(p.title)}</h1><p class="lede">${esc(p.intro)}</p><p>Good advice should reduce uncertainty. Start with the situation as it is now, not the ideal version of it. Notice what changes symptoms, what helps, and what makes the next step harder to take.</p><p>The strongest plans are specific enough to follow and flexible enough to change. That is why the best first step is often a clear assessment, a small number of priorities, and a review point that keeps progress honest.</p><h2>What to do next</h2><p>${esc(site.content.microcopy.contactHint)}</p><a class="button" href="contact.html">Ask ${esc(site.brief.businessName)}</a></div></article>`;
}

function premiumContact(site) {
  const b = site.brief;
  const c = site.content;
  return `<section class="page-hero contact-hero"><p class="eyebrow">Contact</p><h1>Start with a short message. We will help you find the right first step.</h1><p>${esc(c.microcopy.contactHint)}</p></section>
  <section class="contact-layout"><form method="post" action="admin/contact.php" class="form contact-form reveal" data-secure-form><input type="hidden" name="_csrf" value=""><label>Name<input name="name" required></label><label>Email<input type="email" name="email" required></label><label>Phone<input name="phone"></label><label>Message<textarea name="message" required></textarea></label><button class="button">Send message</button><p>${esc(c.microcopy.bookingReassurance)}</p></form><aside class="contact-panel reveal"><div id="map" class="map" data-lat="${esc(b.googleMapsLat)}" data-lng="${esc(b.googleMapsLng)}" data-name="${esc(b.businessName)}">Configure Maps API key to enable the interactive map.</div><h2>${esc(b.businessName)}</h2><p>${esc(b.address)}</p><p>${esc(b.contactPhone)}<br>${esc(b.contactEmail)}</p><a class="button secondary" href="https://www.google.com/maps/dir/?api=1&destination=${esc(b.googleMapsLat)},${esc(b.googleMapsLng)}">Get directions</a></aside></section>`;
}

function retailProducts(site) {
  const c = site.content;
  return c.services.slice(0, 8).map((service, i) => ({
    title: cleanProductTitle(retailProductName(service.title, i)),
    text: service.description,
    price: productPrice(service.title) || ['£39', '£49', '£59', '£69', '£79', '£89'][i % 6],
    old: ['£79', '£95', '£110', '£120', '£135', '£150'][i % 6],
    category: ['Trainers', 'Flats', 'Loafers', 'Boots'][i % 4]
  }));
}

function cleanProductTitle(title) {
  return String(title || '').replace(/£\s*\d+(?:\s*[-–]\s*£?\s*\d+)?/g, '').replace(/\s+/g, ' ').trim();
}

function productPrice(title) {
  const match = String(title || '').match(/£\s*\d+(?:\s*[-–]\s*£?\s*\d+)?/);
  return match ? match[0].replace(/\s+/g, '') : '';
}

function productCard(site, product, i, label = 'Sale') {
  return `<article class="product-card reveal"><img src="${imageUrl(site, `product card ${product.title} ${i}`, 720, 880)}" alt="${esc(product.title)}"><div><span>${esc(label)}</span><h2>${esc(product.title)}</h2><p>${esc(product.text)}</p><p><strong>${product.price}</strong> <s>${product.old}</s></p><a class="text-link" href="contact.html">Enquire about this pair</a></div></article>`;
}

function retailShopPage(site, pageItem) {
  const products = retailProducts(site);
  const categories = [...new Set(products.map((product) => product.category))];
  return `<section class="page-hero retail-hero"><p class="eyebrow">Catalogue</p><h1>Browse ${esc(site.brief.businessName)} without making customers work for the right pair.</h1><p>${esc(pageItem.purpose || site.blueprint?.primaryGoal || site.content.hero.subtext)}</p></section>
  <section class="shop-layout"><aside class="shop-filter reveal"><p class="eyebrow">Shop by need</p><h2>Clear choices first.</h2>${categories.map((category) => `<a href="#${slugify(category, { lower: true, strict: true })}">${esc(category)}</a>`).join('')}<div><strong>Delivery note</strong><p>Fast local dispatch, simple returns, and honest product notes before enquiry.</p></div></aside><div class="catalog-grid">${products.map((product, i) => productCard(site, product, i, product.category)).join('')}</div></section>
  <section class="retail-toolbar reveal"><strong>${esc(site.brief.businessName)}</strong><span>${esc(pageItem.conversionTarget || 'Product view or purchase enquiry')}</span><a class="button" href="contact.html">Ask about availability</a></section>`;
}

function retailSalePage(site, pageItem) {
  const products = retailProducts(site).slice(0, 6);
  return `<section class="sale-campaign"><div class="reveal"><p class="eyebrow">Limited sale</p><h1>Discounted shoes presented like desirable stock, not a clearance bin.</h1><p>${esc(pageItem.purpose || 'Make discounted products feel easy and exciting to explore.')}</p><a class="button" href="#sale-pairs">View sale pairs</a></div><div class="sale-ticket reveal"><span>Up to</span><strong>50%</strong><span>off selected pairs</span></div></section>
  <section class="sale-band reveal"><strong>Today&apos;s edit</strong><span>Comfort pairs, everyday trainers, smarter flats, and weekend shoes selected for quick decisions.</span></section>
  <section id="sale-pairs" class="deal-grid">${products.map((product, i) => productCard(site, product, i, i < 2 ? 'Best reduction' : 'Sale pick')).join('')}</section>`;
}

function retailArrivalsPage(site, pageItem) {
  const products = retailProducts(site).slice(0, 4);
  const lead = products[0];
  return `<section class="page-hero arrivals-hero"><p class="eyebrow">New arrivals</p><h1>Fresh stock with an editorial feel, so returning visitors see something worth coming back for.</h1><p>${esc(pageItem.purpose || 'Show fresh stock and give customers a reason to browse again.')}</p></section>
  <section class="arrival-lookbook"><article class="arrival-feature reveal"><img src="${imageUrl(site, 'new arrivals lead shoe', 1000, 1200)}" alt="${esc(lead.title)}"><div><p class="eyebrow">Just landed</p><h2>${esc(lead.title)}</h2><p>${esc(lead.text)}</p><a class="button" href="contact.html">Ask for this style</a></div></article><div class="arrival-strip">${products.slice(1).map((product, i) => `<article class="reveal"><img src="${imageUrl(site, `arrival product ${product.title} ${i}`, 640, 780)}" alt="${esc(product.title)}"><h2>${esc(product.title)}</h2><p>${esc(product.category)} / ${product.price}</p></article>`).join('')}</div></section>`;
}

function retailCatalogEditorial(site, pageItem) {
  const products = retailProducts(site).slice(0, 5);
  return `<section class="catalog-editorial"><aside class="reveal"><p class="eyebrow">Curated catalogue</p><h1>${esc(pageItem.title)}</h1><p>${esc(cleanPagePurpose(site, pageItem, site.content.hero.subtext))}</p><a class="button" href="contact.html">${esc(pageItem.conversionTarget || 'Ask about stock')}</a></aside><div>${products.map((product, i) => `<article class="reveal"><img src="${imageUrl(site, `catalog product ${product.title} ${i}`, 760, 900)}" alt="${esc(product.title)}"><div><span>${esc(product.category)}</span><h2>${esc(product.title)}</h2><p>${esc(product.text)}</p><strong>${product.price}</strong></div></article>`).join('')}</div></section>`;
}

function retailCatalogRows(site, pageItem) {
  const products = retailProducts(site).slice(0, 6);
  return `<section class="page-hero"><p class="eyebrow">Browse by decision</p><h1>${esc(pageItem.title)}</h1><p>${esc(pageItem.purpose || 'A product page structured for quick comparison.')}</p></section>
  <section class="catalog-rows">${products.map((product, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><img src="${imageUrl(site, `catalog row ${product.title} ${i}`, 520, 420)}" alt="${esc(product.title)}"><div><p class="eyebrow">${esc(product.category)}</p><h2>${esc(product.title)}</h2><p>${esc(product.text)}</p></div><strong>${product.price}</strong><a class="text-link" href="contact.html">Check availability</a></article>`).join('')}</section>`;
}

function retailCampaignStack(site, pageItem) {
  const sections = pageSectionItems(pageItem);
  return `<section class="campaign-stack"><div class="reveal"><p class="eyebrow">Offer journey</p><h1>${esc(pageItem.title)}</h1><p>${esc(pageItem.purpose || site.blueprint?.primaryGoal || site.content.hero.subtext)}</p></div>${sections.map((section, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(section)}</h2><p>${esc(goalCopy(site, pageItem, section))}</p></article>`).join('')}</section>
  <section class="deal-grid">${retailProducts(site).slice(0, 3).map((product, i) => productCard(site, product, i, 'Campaign pick')).join('')}</section>`;
}

function retailCampaignComparison(site, pageItem) {
  const products = retailProducts(site).slice(0, 4);
  return `<section class="page-hero"><p class="eyebrow">Compare the offer</p><h1>${esc(pageItem.title)}</h1><p>${esc(pageItem.purpose || 'Help customers see value clearly before they enquire.')}</p></section>
  <section class="comparison-board">${products.map((product, i) => `<article class="reveal"><h2>${esc(product.title)}</h2><dl><div><dt>Now</dt><dd>${product.price}</dd></div><div><dt>Was</dt><dd>${product.old}</dd></div><div><dt>Best for</dt><dd>${esc(product.category)}</dd></div></dl><p>${esc(product.text)}</p><a class="button" href="contact.html">Ask about this pair</a></article>`).join('')}</section>`;
}

function retailLookbookMasonry(site, pageItem) {
  const products = retailProducts(site).slice(0, 6);
  return `<section class="page-hero"><p class="eyebrow">Visual edit</p><h1>${esc(pageItem.title)}</h1><p>${esc(pageItem.purpose || 'Show products through a more editorial browsing experience.')}</p></section>
  <section class="lookbook-masonry">${products.map((product, i) => `<article class="reveal ${i % 3 === 0 ? 'tall' : ''}"><img src="${imageUrl(site, `lookbook product ${product.title} ${i}`, 720, i % 3 === 0 ? 980 : 620)}" alt="${esc(product.title)}"><h2>${esc(product.title)}</h2><p>${esc(product.category)} / ${product.price}</p></article>`).join('')}</section>`;
}

function retailLookbookStrip(site, pageItem) {
  const products = retailProducts(site).slice(0, 5);
  return `<section class="lookbook-strip-page"><div class="reveal"><p class="eyebrow">Style notes</p><h1>${esc(pageItem.title)}</h1><p>${esc(cleanPagePurpose(site, pageItem, site.content.microcopy.contactHint))}</p></div><div class="horizontal-lookbook">${products.map((product, i) => `<article class="reveal"><img src="${imageUrl(site, `lookbook strip ${product.title} ${i}`, 620, 820)}" alt="${esc(product.title)}"><h2>${esc(product.title)}</h2><p>${esc(product.text)}</p></article>`).join('')}</div></section>`;
}

function sizeGuidePage(site, pageItem) {
  const rows = [['UK 3', 'EU 36', '22.9 cm'], ['UK 4', 'EU 37', '23.7 cm'], ['UK 5', 'EU 38', '24.6 cm'], ['UK 6', 'EU 39', '25.4 cm'], ['UK 7', 'EU 40', '26.2 cm'], ['UK 8', 'EU 42', '27.1 cm']];
  return `<section class="page-hero"><p class="eyebrow">Fit guide</p><h1>Help customers choose the right size before they buy.</h1><p>${esc(pageItem.purpose || 'Reduce hesitation with clear sizing advice.')}</p></section>
  <section class="size-guide-layout"><div class="reveal"><p class="eyebrow">Measure first</p><h2>A practical fit check that reduces returns and support messages.</h2><ol class="fit-steps">${['Place heel against a wall on paper.', 'Mark the longest toe on both feet.', 'Use the larger measurement.', 'Choose the fit note that matches the shoe style.'].map((item) => `<li>${esc(item)}</li>`).join('')}</ol></div><table class="size-table reveal"><thead><tr><th>UK</th><th>EU</th><th>Foot length</th></tr></thead><tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></section>
  <section class="content-narrow faq-list"><h2>Size and fit notes</h2>${['For wide feet, consider sizing up by half a size where available.', 'If you are between sizes, choose based on sock thickness and shoe shape.', 'For gifts, check the returns window before ordering.'].map((item) => `<details open><summary>${esc(item)}</summary><p>Clear sizing guidance helps customers feel confident and reduces avoidable returns.</p></details>`).join('')}</section>`;
}

function guideStepsPage(site, pageItem) {
  const sections = pageSectionItems(pageItem);
  return `<section class="guide-steps-page"><aside class="reveal"><p class="eyebrow">Guided help</p><h1>${esc(pageItem.title)}</h1><p>${esc(pageItem.purpose || 'Give visitors confidence before they act.')}</p></aside><ol>${sections.map((section, i) => `<li class="reveal"><span>${i + 1}</span><h2>${esc(section)}</h2><p>${esc(goalCopy(site, pageItem, section))}</p></li>`).join('')}</ol></section>`;
}

function guideAccordionPage(site, pageItem) {
  const sections = pageSectionItems(pageItem);
  return `<section class="page-hero"><p class="eyebrow">Answers</p><h1>${esc(pageItem.title)}</h1><p>${esc(pageItem.purpose || 'Reduce hesitation with clear guidance.')}</p></section>
  <section class="content-narrow faq-list">${sections.concat(site.content.faqs.map((f) => f.question)).slice(0, 7).map((item, i) => `<details ${i < 2 ? 'open' : ''}><summary>${esc(item)}</summary><p>${esc(goalCopy(site, pageItem, item))}</p></details>`).join('')}</section>`;
}

function storyTimelinePage(site, pageItem) {
  const items = site.content.aboutParagraphs.concat(pageSectionItems(pageItem)).slice(0, 5);
  return `<section class="page-hero"><p class="eyebrow">Story</p><h1>${esc(pageHeadline(site, pageItem))}</h1><p>${esc(cleanPagePurpose(site, pageItem, site.brief.aboutText))}</p></section>
  <section class="story-timeline">${items.map((item, i) => `<article class="reveal"><span>${today().slice(0, 4 - Math.min(i, 3))}${i ? '' : ''}</span><h2>${esc(i === 0 ? 'Where it starts' : pageSectionItems(pageItem)[i - 1] || 'What changed')}</h2><p>${esc(item)}</p></article>`).join('')}</section>`;
}

function storyManifestoPage(site, pageItem) {
  return `<section class="manifesto-page"><p class="eyebrow">${esc(pageItem.title)}</p><h1>${esc(site.content.brandThesis)}</h1><p>${esc(cleanPagePurpose(site, pageItem, site.brief.aboutText))}</p></section>
  <section class="values-band"><div class="premium-list">${site.content.differentiators.map((item) => `<article class="reveal"><h2>${esc(item.title)}</h2><p>${esc(item.text)}</p></article>`).join('')}</div></section>`;
}

function storySplitPage(site, pageItem) {
  return `<section class="story-split-page"><img class="reveal" src="${imageUrl(site, 'about story', 1000, 1200)}" alt="${esc(site.brief.businessName)}"><div class="reveal"><p class="eyebrow">${esc(pageItem.title || 'About')}</p><h1>${esc(pageHeadline(site, pageItem))}</h1>${site.content.aboutParagraphs.slice(0, 3).map((p) => `<p>${esc(p)}</p>`).join('')}<a class="button" href="contact.html">Speak to us</a></div></section>`;
}

function peopleDirectoryPage(site, pageItem) {
  return `<section class="page-hero"><p class="eyebrow">Directory</p><h1>${esc(pageHeadline(site, pageItem))}</h1><p>${esc(cleanPagePurpose(site, pageItem, 'Meet the people behind the business.'))}</p></section>
  <section class="people-directory">${site.content.teamMembers.map((m, i) => `<article class="reveal"><img src="${imageUrl(site, `portrait ${m.name} ${i}`, 420, 420)}" alt="${esc(m.name)}"><h2>${esc(m.name)}</h2><p><strong>${esc(m.role)}</strong></p><p>${esc(m.bio)}</p></article>`).join('')}</section>`;
}

function peopleSpotlightPage(site, pageItem) {
  const lead = site.content.teamMembers[0];
  return `<section class="people-spotlight"><img class="reveal" src="${imageUrl(site, `portrait lead ${lead.name}`, 920, 1100)}" alt="${esc(lead.name)}"><div class="reveal"><p class="eyebrow">${esc(lead.role)}</p><h1>${esc(lead.name)}</h1><p>${esc(lead.bio)}</p><a class="button" href="contact.html">Ask the team</a></div></section>
  <section class="arrival-strip">${site.content.teamMembers.slice(1).map((m, i) => `<article class="reveal"><img src="${imageUrl(site, `portrait strip ${m.name} ${i}`, 640, 780)}" alt="${esc(m.name)}"><h2>${esc(m.name)}</h2><p>${esc(m.role)}</p></article>`).join('')}</section>`;
}

function journalIndexPage(site, pageItem) {
  return `<section class="journal-index-page"><aside class="reveal"><p class="eyebrow">Read next</p><h1>${esc(pageItem.title)}</h1><p>${esc(pageItem.purpose || 'Useful content built for search and trust.')}</p></aside><div>${site.content.blogPosts.map((post) => `<article class="reveal"><p class="eyebrow">${esc(post.category)}</p><h2><a href="blog-post.html">${esc(post.title)}</a></h2><p>${esc(post.intro)}</p></article>`).join('')}</div></section>`;
}

function journalSearchPage(site, pageItem) {
  return `<section class="page-hero"><p class="eyebrow">Search guides</p><h1>${esc(pageItem.title)}</h1><p>${esc(pageItem.purpose || 'Help visitors find useful answers fast.')}</p><input class="search" type="search" placeholder="Search articles"></section>
  <section class="generic-checklist">${site.content.blogPosts.map((post, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h2><a href="blog-post.html">${esc(post.title)}</a></h2><p>${esc(post.intro)}</p></article>`).join('')}</section>`;
}

function contactPanelPage(site, pageItem) {
  const b = site.brief;
  return `<section class="contact-panel-page"><div class="contact-panel reveal"><p class="eyebrow">Visit or message</p><h1>${esc(pageItem.title)}</h1><p>${esc(pageItem.purpose || site.content.microcopy.contactHint)}</p><p>${esc(b.address)}<br>${esc(b.contactPhone)}<br>${esc(b.contactEmail)}</p><a class="button secondary" href="https://www.google.com/maps/dir/?api=1&destination=${esc(b.googleMapsLat)},${esc(b.googleMapsLng)}">Get directions</a></div><form method="post" action="admin/contact.php" class="form contact-form reveal" data-secure-form><input type="hidden" name="_csrf" value=""><label>Name<input name="name" required></label><label>Email<input type="email" name="email" required></label><label>Phone<input name="phone"></label><label>Message<textarea name="message" required></textarea></label><button class="button">Send message</button></form><div id="map" class="map reveal" data-lat="${esc(b.googleMapsLat)}" data-lng="${esc(b.googleMapsLng)}" data-name="${esc(b.businessName)}">Configure Maps API key to enable the interactive map.</div></section>`;
}

function contactStackPage(site, pageItem) {
  const b = site.brief;
  return `<section class="page-hero contact-hero"><p class="eyebrow">Contact</p><h1>${esc(pageHeadline(site, pageItem))}</h1><p>${esc(site.content.microcopy.contactHint)}</p></section>
  <section class="contact-stack"><form method="post" action="admin/contact.php" class="form contact-form reveal" data-secure-form><input type="hidden" name="_csrf" value=""><label>Name<input name="name" required></label><label>Email<input type="email" name="email" required></label><label>Message<textarea name="message" required></textarea></label><button class="button">Send message</button></form><article class="reveal"><h2>Details</h2><p>${esc(b.address)}<br>${esc(b.contactPhone)}<br>${esc(b.contactEmail)}</p></article><div id="map" class="map reveal" data-lat="${esc(b.googleMapsLat)}" data-lng="${esc(b.googleMapsLng)}" data-name="${esc(b.businessName)}">Configure Maps API key to enable the interactive map.</div></section>`;
}

function blueprintGenericPage(site, pageItem, index = 0) {
  const sections = pageItem.sections || ['Overview', 'Proof', 'Next step'];
  const hero = `<section class="page-hero"><p class="eyebrow">${esc(site.blueprint?.businessType || site.brief.industry)}</p><h1>${esc(pageHeadline(site, pageItem))}</h1><p>${esc(cleanPagePurpose(site, pageItem, site.content.hero.subtext))}</p></section>`;
  if (index % 3 === 1) return `${hero}<section class="generic-checklist">${sections.map((section, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(section)}</h2><p>${esc(sectionCopy(site, section, pageItem))}</p></article>`).join('')}</section>`;
  if (index % 3 === 2) return `${hero}<section class="generic-mosaic"><div class="reveal"><h2>${esc(pageItem.conversionTarget || 'A focused next step')}</h2><p>${esc(site.blueprint?.primaryGoal || site.content.microcopy.contactHint)}</p></div>${sections.map((section, i) => `<article class="reveal"><img src="${imageUrl(site, `${pageItem.title} ${section} ${i}`, 700, 520)}" alt=""><h2>${esc(section)}</h2><p>${esc(sectionCopy(site, section, pageItem))}</p></article>`).join('')}</section>`;
  return `${hero}<section class="generic-editorial"><aside class="reveal"><p class="eyebrow">Page purpose</p><h2>${esc(pageItem.conversionTarget || site.blueprint?.primaryGoal || 'Help visitors take action')}</h2></aside><div>${sections.map((section, i) => `<article class="story-card reveal"><span>${String(i + 1).padStart(2, '0')}</span><div><h3>${esc(section)}</h3><p>${esc(sectionCopy(site, section, pageItem))}</p></div></article>`).join('')}</div></section>`;
}

function genericChecklistPage(site, pageItem) {
  const sections = pageSectionItems(pageItem);
  return `<section class="page-hero"><p class="eyebrow">${esc(site.brief.industry)}</p><h1>${esc(pageHeadline(site, pageItem))}</h1><p>${esc(cleanPagePurpose(site, pageItem, site.content.hero.subtext))}</p></section>
  <section class="generic-checklist">${sections.map((section, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(section)}</h2><p>${esc(goalCopy(site, pageItem, section))}</p></article>`).join('')}</section>`;
}

function genericMosaicPage(site, pageItem) {
  const sections = pageSectionItems(pageItem);
  return `<section class="generic-mosaic generic-mosaic-page"><div class="reveal"><p class="eyebrow">${esc(pageItem.title)}</p><h1>${esc(pageItem.conversionTarget || pageHeadline(site, pageItem))}</h1><p>${esc(site.content.microcopy.contactHint)}</p></div>${sections.map((section, i) => `<article class="reveal"><img src="${imageUrl(site, `generic mosaic ${pageItem.title} ${section} ${i}`, 700, 520)}" alt=""><h2>${esc(section)}</h2><p>${esc(goalCopy(site, pageItem, section))}</p></article>`).join('')}</section>`;
}

function genericBandPage(site, pageItem) {
  const sections = pageSectionItems(pageItem);
  return `<section class="generic-band-page"><div class="reveal"><p class="eyebrow">${esc(site.blueprint?.businessType || site.brief.industry)}</p><h1>${esc(pageHeadline(site, pageItem))}</h1><p>${esc(cleanPagePurpose(site, pageItem, site.content.hero.subtext))}</p></div></section>
  <section class="generic-bands">${sections.map((section, i) => `<article class="reveal"><span>${String(i + 1).padStart(2, '0')}</span><h2>${esc(section)}</h2><p>${esc(goalCopy(site, pageItem, section))}</p></article>`).join('')}</section>`;
}

function sectionCopy(site, section, pageItem) {
  return `${section} supports the page goal: ${pageItem.conversionTarget || pageItem.purpose || site.blueprint?.primaryGoal || 'help visitors take the next step'}.`;
}

function retailProductName(title, index) {
  const names = ['Everyday Leather Trainer', 'City Walking Shoe', 'Minimal Court Sneaker', 'Soft Loafer', 'Weekend Runner', 'Classic Ankle Boot'];
  if (!title || title.length > 40) return names[index % names.length];
  return title;
}

function premiumCss(site) {
  const t = site.tokens;
  return `:root{--primary:${t.colors.primary};--secondary:${t.colors.secondary};--accent:${t.colors.accent};--ink:${t.colors.ink};--surface:${t.colors.surface};--muted:${t.colors.muted};--line:color-mix(in srgb,var(--ink),transparent 86%);--radius-sm:${t.radius.sm};--radius-md:${t.radius.md};--radius-lg:${t.radius.lg};--shadow-sm:${t.shadow.sm};--shadow-md:${t.shadow.md};--space-xs:${t.spacing.xs};--space-sm:${t.spacing.sm};--space-md:${t.spacing.md};--space-lg:${t.spacing.lg};--space-xl:${t.spacing.xl};--font-display:"${t.fonts.display}",serif;--font-body:"${t.fonts.body}",system-ui,sans-serif}body.dark{--ink:${t.colors.darkInk};--surface:${t.colors.darkSurface};--secondary:#17262b;--muted:#c6d6dc}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;font-family:var(--font-body);line-height:1.6;color:var(--ink);background:var(--surface);text-rendering:optimizeLegibility}.scroll-progress{position:fixed;top:0;left:0;height:3px;width:0;background:var(--accent);z-index:100}a{color:inherit}img{max-width:100%;display:block;border-radius:var(--radius-md)}.site-header{position:sticky;top:0;z-index:20;display:flex;align-items:center;justify-content:space-between;gap:var(--space-sm);padding:.8rem clamp(1rem,4vw,4rem);background:color-mix(in srgb,var(--surface),transparent 8%);backdrop-filter:blur(16px);border-bottom:1px solid var(--line)}.brand{display:inline-flex;align-items:center;gap:.65rem;font:700 1.05rem var(--font-display);text-decoration:none}.brand-logo{width:auto;max-width:150px;height:42px;object-fit:contain;border-radius:0}.site-header nav{display:flex;gap:var(--space-sm);flex-wrap:wrap}.site-header a{text-decoration:none}.theme-toggle,.button,button{min-width:44px;min-height:44px;border:0;border-radius:var(--radius-sm);background:var(--primary);color:white;padding:.75rem 1rem;font-weight:700;cursor:pointer}.button{display:inline-flex;align-items:center;text-decoration:none}.text-link{font-weight:800;text-underline-offset:.3em}.secondary{background:var(--ink)}section{padding:clamp(4rem,8vw,8rem) clamp(1rem,6vw,6rem)}.premium-hero{min-height:calc(100vh - 70px);display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.72fr);gap:clamp(2rem,6vw,7rem);align-items:center;background:linear-gradient(90deg,var(--secondary),color-mix(in srgb,var(--surface),var(--secondary) 38%))}.hero-copy{max-width:860px}.eyebrow{text-transform:uppercase;letter-spacing:.12em;font-size:.78rem;font-weight:900;color:var(--primary);margin:0 0 var(--space-sm)}h1,h2,h3{font-family:var(--font-display);line-height:1.02;letter-spacing:0}h1{font-size:clamp(3rem,7.6vw,7.8rem);margin:0 0 var(--space-md)}h2{font-size:clamp(2rem,4.5vw,5rem);margin:.1rem 0 var(--space-md)}h3{font-size:clamp(1.25rem,2vw,2rem)}.lede{font-size:clamp(1.1rem,1.6vw,1.45rem);max-width:720px;color:var(--muted)}.hero-actions{display:flex;align-items:center;gap:var(--space-md);flex-wrap:wrap;margin-top:var(--space-lg)}.hero-media{margin:0;align-self:stretch;display:grid;grid-template-rows:1fr auto;gap:.8rem}.hero-media img{height:min(72vh,780px);width:100%;object-fit:cover}.hero-media figcaption{font-weight:800}.proof-strip{padding:1rem clamp(1rem,6vw,6rem);border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:var(--surface)}.proof-strip ul{display:grid;grid-template-columns:repeat(3,1fr);gap:1rem;margin:0;padding:0;list-style:none}.proof-strip li{display:grid;gap:.15rem}.proof-strip strong{font:700 clamp(2rem,4vw,4rem) var(--font-display)}.proof-strip span{color:var(--muted)}.editorial{display:grid;grid-template-columns:.8fr 1.2fr;gap:clamp(2rem,6vw,7rem);align-items:start}.sticky-note{position:sticky;top:100px}.story-stack{display:grid;gap:var(--space-md)}.story-card,.service-panel,.premium-list article,.process li,blockquote,.cta-card,details,article{border:1px solid var(--line);border-radius:var(--radius-md);background:var(--surface);box-shadow:var(--shadow-sm)}.story-card{display:grid;grid-template-columns:70px 1fr;gap:var(--space-md);padding:var(--space-lg)}.story-card span,.premium-list span,.process span{font:700 1rem var(--font-display);color:var(--accent)}.signature-service,.process-band,.band{background:color-mix(in srgb,var(--secondary),var(--surface) 44%)}.section-heading{max-width:820px}.service-panel{display:grid;grid-template-columns:1.1fr .9fr;gap:var(--space-lg);padding:var(--space-md);align-items:center}.service-panel img{height:460px;width:100%;object-fit:cover}.service-panel ul{display:grid;gap:1rem;margin:0;padding:0;list-style:none}.service-panel li{padding:1rem;border-bottom:1px solid var(--line)}.service-list,.cards,.testimonials,.stats,.premium-list,.process,.testimonial-rail{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:var(--space-md)}.premium-list article,.process li,blockquote{padding:var(--space-md)}.premium-list article{display:grid;align-content:start;min-height:270px}.process{list-style:none;margin:0;padding:0}.testimonials-premium{overflow:hidden}.testimonial-rail{grid-auto-flow:column;grid-auto-columns:minmax(280px,430px);overflow-x:auto;padding-bottom:1rem}.testimonial-rail blockquote p{font-size:1.25rem}.journal-cta{display:grid;grid-template-columns:1fr .82fr;gap:var(--space-lg);align-items:stretch}.cta-card{padding:var(--space-lg);background:var(--ink);color:var(--surface)}.page-hero,.hero{padding:clamp(4rem,9vw,8rem) clamp(1rem,6vw,6rem);background:var(--secondary)}.page-hero h1,.hero h1{max-width:980px}.page-hero p,.hero p{max-width:760px;color:var(--muted)}.content-narrow{max-width:880px;margin:auto}.form{display:grid;gap:var(--space-sm)}label{display:grid;gap:.35rem;font-weight:700}input,textarea,.search{width:100%;min-height:44px;border:1px solid var(--line);border-radius:var(--radius-sm);padding:.85rem;background:var(--surface);color:var(--ink)}textarea{min-height:150px}.map{min-height:340px;display:grid;place-items:center;background:var(--secondary);border-radius:var(--radius-md);padding:var(--space-md);margin-bottom:var(--space-sm)}footer{display:flex;justify-content:space-between;gap:var(--space-md);flex-wrap:wrap;padding:var(--space-lg) clamp(1rem,6vw,6rem);border-top:1px solid var(--line)}.reveal{opacity:0;transform:translateY(26px);transition:opacity .75s ease,transform .75s ease}.reveal.visible{opacity:1;transform:none}@media(max-width:900px){.premium-hero,.editorial,.service-panel,.journal-cta{grid-template-columns:1fr}.sticky-note{position:static}.hero-media img{height:440px}.proof-strip ul{grid-template-columns:1fr 1fr}}@media(max-width:620px){.site-header{align-items:flex-start;flex-direction:column}.premium-hero{min-height:auto}.hero-actions{align-items:flex-start;flex-direction:column}.proof-strip ul{grid-template-columns:1fr}.story-card{grid-template-columns:1fr}h1{font-size:2.8rem}}`;
}

function premiumJs() {
  return `document.querySelector('[data-theme-toggle]')?.addEventListener('click',()=>document.body.classList.toggle('dark'));const progress=document.querySelector('[data-scroll-progress]');const updateProgress=()=>{const max=document.documentElement.scrollHeight-innerHeight;progress&&(progress.style.width=(max>0?(scrollY/max)*100:0)+'%')};addEventListener('scroll',updateProgress,{passive:true});updateProgress();const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting){e.target.classList.add('visible');io.unobserve(e.target)}}),{threshold:.14,rootMargin:'0px 0px -8% 0px'});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));document.querySelectorAll('[data-count]').forEach(el=>{let started=false;const run=()=>{if(started)return;started=true;let end=Number(el.dataset.count),n=0,step=Math.max(1,Math.round(end/70));let id=setInterval(()=>{n+=step;if(n>=end){n=end;clearInterval(id)}el.textContent=end===49?(n/10).toFixed(1):n.toLocaleString()},22)};new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)run()}),{threshold:.5}).observe(el)});document.querySelectorAll('[data-parallax]').forEach(el=>addEventListener('scroll',()=>{el.style.setProperty('--scroll',Math.min(80,scrollY*.04)+'px')},{passive:true}));fetch('admin/csrf.php').then(r=>r.json()).then(d=>document.querySelectorAll('[name="_csrf"]').forEach(i=>i.value=d.token)).catch(()=>{});window.initMap=function(){const el=document.getElementById('map');if(!el||!window.google)return;const pos={lat:Number(el.dataset.lat),lng:Number(el.dataset.lng)};const map=new google.maps.Map(el,{center:pos,zoom:15});new google.maps.Marker({position:pos,map,title:el.dataset.name})};`;
}

function premiumCssV2(site) {
  return premiumCss(site) + `
.immersive{position:relative;overflow:hidden}.immersive:before{content:"";position:absolute;inset:auto 0 0 0;height:34%;background:var(--surface);z-index:0}.immersive>*{position:relative;z-index:1}.image-composition{position:relative;min-height:720px;display:grid;align-items:end}.image-main{width:82%;height:680px;object-fit:cover;justify-self:end;border-radius:0 var(--radius-lg) var(--radius-lg) var(--radius-lg);box-shadow:var(--shadow-md);transform:translateY(var(--scroll,0))}.image-inset{position:absolute;left:0;bottom:4rem;width:46%;height:300px;object-fit:cover;border:10px solid var(--surface);box-shadow:var(--shadow-md)}.floating-proof{position:absolute;right:8%;bottom:2rem;max-width:260px;padding:1rem;background:var(--surface);border:1px solid var(--line);box-shadow:var(--shadow-sm)}.floating-proof strong,.floating-proof span{display:block}.trust-pills{display:flex;gap:.55rem;flex-wrap:wrap;margin:1rem 0}.trust-pills span{border:1px solid var(--line);border-radius:999px;padding:.45rem .75rem;background:color-mix(in srgb,var(--surface),transparent 4%);font-size:.88rem;font-weight:800}.brand-thesis{padding:clamp(5rem,9vw,9rem) clamp(1rem,10vw,12rem);background:var(--ink);color:var(--surface)}.brand-thesis p{font:500 clamp(2rem,4.5vw,5rem)/1.05 var(--font-display);max-width:1200px;margin:0}.service-outcome{font:700 1.1rem var(--font-body);color:var(--primary);border-left:4px solid var(--accent);padding-left:1rem}.about-hero h1,.contact-hero h1{max-width:1180px}.values-band{background:color-mix(in srgb,var(--secondary),var(--surface) 36%)}.feature-split{display:grid;grid-template-columns:1fr .85fr;gap:var(--space-lg);align-items:center}.feature-split img{height:620px;width:100%;object-fit:cover}.service-showcase{display:grid;gap:0;padding-top:0}.service-row{display:grid;grid-template-columns:.92fr 1.08fr;gap:clamp(1.5rem,5vw,5rem);padding:clamp(2rem,5vw,5rem) 0;border-top:1px solid var(--line);background:transparent;box-shadow:none;border-left:0;border-right:0;border-bottom:0;border-radius:0}.service-row>div{position:sticky;top:110px;align-self:start}.service-row span{color:var(--accent);font-weight:900}.service-row ul{display:grid;gap:1rem;margin:0;padding:0;list-style:none}.service-row li{padding:1.1rem;border:1px solid var(--line);background:var(--surface)}.faq-list details{margin:1rem 0;padding:1rem}.team-editorial{display:grid;gap:clamp(2rem,6vw,6rem)}.team-profile{display:grid;grid-template-columns:minmax(260px,.72fr) 1fr;gap:var(--space-lg);align-items:center;border:0;box-shadow:none;background:transparent}.team-profile:nth-child(even){grid-template-columns:1fr minmax(260px,.72fr)}.team-profile:nth-child(even) img{order:2}.team-profile img{height:620px;width:100%;object-fit:cover}.team-cta{margin:0 clamp(1rem,6vw,6rem) clamp(4rem,8vw,8rem)}.journal-grid{display:grid;grid-template-columns:1.1fr .9fr;gap:var(--space-md)}.journal-grid article{padding:var(--space-lg);min-height:310px}.journal-grid .featured-post{grid-row:span 2;background:var(--ink);color:var(--surface)}.article-layout{display:grid;grid-template-columns:260px minmax(0,820px);gap:var(--space-lg);align-items:start;padding:clamp(4rem,8vw,8rem) clamp(1rem,6vw,6rem);border:0;box-shadow:none;background:transparent}.article-aside{position:sticky;top:110px}.article-body h1{font-size:clamp(2.7rem,6vw,6.2rem)}.contact-layout{display:grid;grid-template-columns:minmax(0,1fr) minmax(320px,.82fr);gap:var(--space-lg);align-items:start}.contact-form,.contact-panel{border:1px solid var(--line);padding:var(--space-lg);background:var(--surface);box-shadow:var(--shadow-sm)}.contact-form p{color:var(--muted)}@media(max-width:980px){.image-composition{min-height:auto}.image-main{height:520px;width:100%}.image-inset,.floating-proof{position:static;width:100%;margin-top:1rem}.feature-split,.service-row,.team-profile,.team-profile:nth-child(even),.journal-grid,.article-layout,.contact-layout{grid-template-columns:1fr}.service-row>div,.article-aside{position:static}.team-profile:nth-child(even) img{order:0}.team-profile img,.feature-split img{height:440px}}@media(max-width:620px){.image-main{height:420px}.brand-thesis p{font-size:2.2rem}.journal-grid article{padding:1rem}}`;
}

function premiumCssV3(site) {
  return premiumCssV2(site) + `
.retail-hero{background:var(--surface);border-bottom:1px solid var(--line)}.shop-layout{display:grid;grid-template-columns:280px 1fr;gap:var(--space-lg);align-items:start}.shop-filter{position:sticky;top:100px;display:grid;gap:.8rem;padding:var(--space-md);border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow-sm)}.shop-filter a{min-height:44px;display:flex;align-items:center;border-bottom:1px solid var(--line);text-decoration:none;font-weight:800}.catalog-grid,.deal-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--space-md)}.product-card{padding:0;overflow:hidden}.product-card img{width:100%;height:420px;object-fit:cover;border-radius:0}.product-card div{padding:1rem}.product-card span{font-size:.75rem;text-transform:uppercase;letter-spacing:.12em;font-weight:900;color:var(--primary)}.product-card h2{font-size:clamp(1.35rem,2vw,2.1rem);margin:.35rem 0}.product-card strong{font-size:1.25rem}.product-card s{color:var(--muted);margin-left:.4rem}.retail-toolbar,.sale-band{margin:0 clamp(1rem,6vw,6rem) clamp(4rem,8vw,8rem);display:flex;align-items:center;justify-content:space-between;gap:var(--space-md);padding:1rem;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.sale-campaign{min-height:calc(100vh - 70px);display:grid;grid-template-columns:1fr minmax(280px,.45fr);gap:var(--space-lg);align-items:center;background:var(--ink);color:var(--surface)}.sale-campaign p{color:color-mix(in srgb,var(--surface),transparent 18%)}.sale-ticket{aspect-ratio:1;display:grid;place-items:center;text-align:center;border:1px solid color-mix(in srgb,var(--surface),transparent 65%);border-radius:50%;padding:2rem}.sale-ticket strong{font:700 clamp(4rem,10vw,9rem)/.85 var(--font-display)}.sale-ticket span{display:block;text-transform:uppercase;letter-spacing:.12em;font-weight:900}.sale-band{margin-top:var(--space-lg);margin-bottom:0}.arrival-lookbook{display:grid;gap:var(--space-lg)}.arrival-feature{display:grid;grid-template-columns:.78fr 1fr;gap:var(--space-lg);align-items:end;border:0;box-shadow:none;background:transparent}.arrival-feature img{height:720px;width:100%;object-fit:cover;border-radius:var(--radius-lg) var(--radius-lg) 0 var(--radius-lg)}.arrival-strip{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-md)}.arrival-strip article{padding:0;overflow:hidden}.arrival-strip img{height:360px;width:100%;object-fit:cover;border-radius:0}.arrival-strip h2,.arrival-strip p{padding:0 1rem}.size-guide-layout{display:grid;grid-template-columns:.8fr 1.2fr;gap:var(--space-lg);align-items:start}.fit-steps{display:grid;gap:.8rem;padding:0;counter-reset:fit;list-style:none}.fit-steps li{counter-increment:fit;padding:1rem;border:1px solid var(--line)}.fit-steps li:before{content:counter(fit) ". ";font-weight:900;color:var(--primary)}.size-table{width:100%;border-collapse:collapse;border:1px solid var(--line);background:var(--surface);box-shadow:var(--shadow-sm)}.size-table th,.size-table td{padding:1rem;border-bottom:1px solid var(--line);text-align:left}.size-table th{background:var(--ink);color:var(--surface)}.generic-editorial{display:grid;grid-template-columns:.7fr 1.3fr;gap:var(--space-lg)}.generic-editorial aside{position:sticky;top:100px;align-self:start}.generic-checklist{display:grid;gap:0}.generic-checklist article{display:grid;grid-template-columns:90px 1fr 1fr;gap:var(--space-md);align-items:start;padding:clamp(1.5rem,4vw,4rem);border-left:0;border-right:0;border-radius:0;box-shadow:none}.generic-checklist span{font-weight:900;color:var(--accent)}.generic-mosaic{display:grid;grid-template-columns:1fr 1fr;gap:var(--space-md);align-items:start}.generic-mosaic>div{grid-row:span 2;padding:var(--space-lg);background:var(--ink);color:var(--surface)}.generic-mosaic article{padding:0;overflow:hidden}.generic-mosaic img{height:260px;width:100%;object-fit:cover;border-radius:0}.generic-mosaic h2,.generic-mosaic p{padding:0 1rem}.home-editorial,.home-showcase,.catalog-editorial,.people-spotlight,.story-split-page{display:grid;grid-template-columns:1fr .9fr;gap:var(--space-lg);align-items:center}.home-editorial img,.story-split-page img,.people-spotlight img{height:760px;width:100%;object-fit:cover}.home-proof-ledger{display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding-top:0;padding-bottom:0}.home-proof-ledger article{border-left:0;border-right:0;border-radius:0;box-shadow:none}.home-proof-ledger strong{display:block;font:700 clamp(2.5rem,7vw,7rem)/1 var(--font-display)}.showcase-rail,.horizontal-lookbook{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(280px,420px);gap:var(--space-md);overflow-x:auto;padding-bottom:1rem}.catalog-editorial>div{display:grid;gap:var(--space-md)}.catalog-editorial article{display:grid;grid-template-columns:220px 1fr;padding:0;overflow:hidden}.catalog-editorial img{height:100%;min-height:260px;object-fit:cover;border-radius:0}.catalog-editorial article div{padding:var(--space-md)}.catalog-rows{display:grid;gap:0}.catalog-rows article{display:grid;grid-template-columns:70px 180px 1fr auto auto;gap:var(--space-md);align-items:center;border-left:0;border-right:0;border-radius:0;box-shadow:none}.catalog-rows img{height:140px;width:180px;object-fit:cover}.campaign-stack{display:grid;grid-template-columns:.95fr 1fr 1fr;gap:var(--space-md);background:var(--ink);color:var(--surface)}.campaign-stack>div{grid-row:span 2}.campaign-stack article{background:transparent;color:inherit;border-color:color-mix(in srgb,var(--surface),transparent 70%)}.comparison-board{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-md)}.comparison-board dl{display:grid;gap:.5rem}.comparison-board div{display:flex;justify-content:space-between;border-bottom:1px solid var(--line)}.lookbook-masonry{columns:3 260px;column-gap:var(--space-md)}.lookbook-masonry article{break-inside:avoid;margin:0 0 var(--space-md);padding:0;overflow:hidden}.lookbook-masonry img{width:100%;object-fit:cover;border-radius:0}.lookbook-strip-page{display:grid;gap:var(--space-lg)}.guide-steps-page,.journal-index-page{display:grid;grid-template-columns:.7fr 1.3fr;gap:var(--space-lg);align-items:start}.guide-steps-page aside,.journal-index-page aside{position:sticky;top:100px}.guide-steps-page ol{display:grid;gap:var(--space-md);margin:0;padding:0;list-style:none}.guide-steps-page li{padding:var(--space-lg);border:1px solid var(--line)}.story-timeline{display:grid;gap:0}.story-timeline article{display:grid;grid-template-columns:180px 1fr 1.2fr;gap:var(--space-md);border-left:0;border-right:0;border-radius:0;box-shadow:none}.manifesto-page,.generic-band-page{min-height:72vh;display:grid;align-content:center;background:var(--ink);color:var(--surface)}.manifesto-page h1,.generic-band-page h1{max-width:1200px}.people-directory{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:var(--space-md)}.people-directory img{aspect-ratio:1;object-fit:cover}.journal-index-page>div{display:grid;gap:var(--space-md)}.contact-panel-page{display:grid;grid-template-columns:.85fr 1fr;gap:var(--space-md);align-items:start}.contact-panel-page .map{grid-column:1/-1}.contact-stack{display:grid;grid-template-columns:1fr .75fr;gap:var(--space-md)}.contact-stack .map{grid-column:1/-1}.generic-bands{display:grid;gap:0;padding-top:0}.generic-bands article{display:grid;grid-template-columns:80px 1fr 1fr;gap:var(--space-md);border-left:0;border-right:0;border-radius:0;box-shadow:none}@media(max-width:1050px){.shop-layout,.sale-campaign,.arrival-feature,.size-guide-layout,.generic-editorial,.generic-mosaic,.home-editorial,.home-showcase,.catalog-editorial,.people-spotlight,.story-split-page,.guide-steps-page,.journal-index-page,.contact-panel-page,.contact-stack{grid-template-columns:1fr}.shop-filter,.generic-editorial aside,.guide-steps-page aside,.journal-index-page aside{position:static}.catalog-grid,.deal-grid,.arrival-strip,.comparison-board,.home-proof-ledger{grid-template-columns:repeat(2,minmax(0,1fr))}.arrival-feature img,.home-editorial img,.story-split-page img,.people-spotlight img{height:520px}.campaign-stack{grid-template-columns:1fr}.catalog-rows article,.story-timeline article,.generic-bands article{grid-template-columns:1fr}.catalog-rows img{width:100%;height:260px}}@media(max-width:680px){.catalog-grid,.deal-grid,.arrival-strip,.comparison-board,.home-proof-ledger{grid-template-columns:1fr}.retail-toolbar,.sale-band{align-items:flex-start;flex-direction:column}.product-card img,.arrival-strip img{height:340px}.generic-checklist article{grid-template-columns:1fr}.sale-campaign{min-height:auto}.sale-ticket{border-radius:var(--radius-md)}}`;
}

function premiumCssV4(site) {
  return premiumCssV3(site) + `
body.mood-ink{--hero-bg:var(--ink);--hero-fg:var(--surface);--hero-muted:color-mix(in srgb,var(--surface),transparent 24%)}body.mood-paper{--hero-bg:var(--surface);--hero-fg:var(--ink);--hero-muted:var(--muted)}body.mood-contrast{--hero-bg:var(--primary);--hero-fg:#fff;--hero-muted:color-mix(in srgb,#fff,transparent 18%)}body.mood-soft{--hero-bg:var(--secondary);--hero-fg:var(--ink);--hero-muted:var(--muted)}.home-image-left .image-composition{order:-1}.home-split{background:var(--hero-bg);color:var(--hero-fg)}.home-split .lede,.home-split p{color:var(--hero-muted)}.compact-thesis{padding-top:clamp(3rem,6vw,6rem);padding-bottom:clamp(3rem,6vw,6rem)}.brand-thesis-light{background:var(--secondary);color:var(--ink)}.home-editorial-flip img{order:-1}.home-magazine{min-height:calc(100vh - 70px);display:grid;grid-template-columns:.42fr 1.1fr .72fr;gap:var(--space-lg);align-items:end;background:var(--hero-bg);color:var(--hero-fg)}.home-magazine h1{font-size:clamp(3.5rem,9vw,10rem)}.home-magazine p{color:var(--hero-muted)}.magazine-kicker{align-self:start}.magazine-kicker span{font:700 clamp(3rem,8vw,8rem)/.9 var(--font-display);writing-mode:vertical-rl}.magazine-image img{height:72vh;width:100%;object-fit:cover;border-radius:0}.magazine-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:0;padding-top:0}.magazine-grid article{border-radius:0;box-shadow:none;border-left:0;border-bottom:0}.magazine-grid span{font-size:.75rem;text-transform:uppercase;font-weight:900;color:var(--primary)}.home-poster{min-height:calc(100vh - 70px);display:grid;align-content:space-between;background:var(--hero-bg);color:var(--hero-fg)}.home-poster h1{max-width:1400px;font-size:clamp(4rem,12vw,13rem);line-height:.86}.home-poster .poster-bottom{display:grid;grid-template-columns:minmax(0,680px) auto;gap:var(--space-md);align-items:end}.home-poster p{color:var(--hero-muted)}.poster-proof{display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding-top:0;padding-bottom:0}.poster-proof article{border-radius:0;box-shadow:none;border-left:0;border-right:0}.home-product-wall{display:grid;grid-template-columns:.72fr 1.28fr;gap:var(--space-lg);align-items:start;background:var(--hero-bg);color:var(--hero-fg)}.wall-copy{position:sticky;top:110px}.wall-copy p{color:var(--hero-muted)}.wall-products{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-sm)}.wall-products article{padding:0;overflow:hidden;background:color-mix(in srgb,var(--surface),transparent 6%)}.wall-products img{height:300px;width:100%;object-fit:cover;border-radius:0}.wall-products h2{font-size:1.1rem;padding:0 1rem 1rem}.design-v1 .button,.design-v5 .button,.design-v9 .button{background:var(--accent);color:var(--ink)}.design-v2 .site-header,.design-v6 .site-header{justify-content:flex-start}.design-v2 .site-header nav,.design-v6 .site-header nav{margin-left:auto}.design-v3 .page-hero,.design-v7 .page-hero{background:var(--ink);color:var(--surface)}.design-v3 .page-hero p,.design-v7 .page-hero p{color:color-mix(in srgb,var(--surface),transparent 20%)}.design-v4 .product-card img,.design-v8 .product-card img{height:520px}.design-v10 section{scroll-margin-top:110px}.design-v11 .brand-thesis{background:var(--primary)}@media(max-width:1050px){.home-magazine,.home-product-wall{grid-template-columns:1fr}.magazine-kicker span{writing-mode:horizontal-tb}.magazine-grid,.poster-proof,.wall-products{grid-template-columns:repeat(2,1fr)}.wall-copy{position:static}}@media(max-width:680px){.home-poster .poster-bottom{grid-template-columns:1fr}.magazine-grid,.poster-proof,.wall-products{grid-template-columns:1fr}.home-magazine h1,.home-poster h1{font-size:3.4rem}.magazine-image img{height:420px}}`;
}

function premiumCssV5(site) {
  return premiumCssV4(site) + `
.commerce-wall{display:grid;grid-template-columns:.68fr 1.32fr;gap:var(--space-lg);align-items:start;background:var(--hero-bg);color:var(--hero-fg)}.commerce-copy{position:sticky;top:110px}.commerce-copy p{color:var(--hero-muted)}.commerce-edit{background:var(--secondary)}.hospitality-hero{min-height:calc(100vh - 70px);display:grid;grid-template-columns:.78fr 1fr;gap:var(--space-lg);align-items:end;background:var(--ink);color:var(--surface)}.hospitality-hero img{height:76vh;width:100%;object-fit:cover;border-radius:var(--radius-lg) var(--radius-lg) 0 0}.menu-board{display:grid;grid-template-columns:.8fr repeat(2,1fr);gap:0}.menu-board article{border-radius:0;box-shadow:none;border-left:0}.booking-strip{margin:0 clamp(1rem,6vw,6rem) clamp(4rem,8vw,8rem);display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem;border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.care-hero{display:grid;grid-template-columns:1fr .75fr;gap:var(--space-lg);align-items:center;background:var(--secondary)}.care-card{padding:var(--space-lg);background:var(--surface);border:1px solid var(--line)}.care-card ol{display:grid;gap:1rem;margin:0;padding:0;list-style:none}.care-card li{display:grid;gap:.35rem;padding-bottom:1rem;border-bottom:1px solid var(--line)}.professional-hero{min-height:72vh;display:grid;grid-template-columns:1fr .75fr;gap:var(--space-lg);align-items:end;background:var(--surface)}.professional-hero aside{border-top:6px solid var(--ink);padding-top:var(--space-md)}.proof-ledger,.practice-matrix{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.proof-ledger article,.practice-matrix article{border-radius:0;box-shadow:none;border-left:0}.fitness-hero{min-height:calc(100vh - 70px);display:grid;align-items:end;background:var(--ink);color:var(--surface)}.fitness-hero h1{max-width:1100px}.fitness-programs{display:grid;grid-template-columns:repeat(4,1fr);gap:0}.fitness-programs article{border-radius:0;box-shadow:none;border-left:0}.portfolio-hero{min-height:70vh;display:grid;align-content:center;background:var(--surface)}.portfolio-hero h1{font-size:clamp(4rem,11vw,12rem);max-width:1400px}.case-wall{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-md)}.case-wall article{padding:0;overflow:hidden}.case-wall img{height:360px;width:100%;object-fit:cover;border-radius:0}.case-wall .case-large{grid-column:span 2;grid-row:span 2}.case-wall .case-large img{height:760px}.case-wall div{padding:1rem}.software-hero{display:grid;grid-template-columns:.85fr 1.15fr;gap:var(--space-lg);align-items:center;background:var(--ink);color:var(--surface)}.software-hero h1,.education-hero h1{font-size:clamp(2.8rem,7vw,6rem)}.dashboard-mock{display:grid;grid-template-columns:1fr 1fr;gap:1rem;padding:1rem;border:1px solid color-mix(in srgb,var(--surface),transparent 70%)}.dashboard-mock div{min-height:120px;background:color-mix(in srgb,var(--surface),transparent 88%);border:1px solid color-mix(in srgb,var(--surface),transparent 76%)}.dashboard-mock div:first-child{grid-column:1/-1;min-height:220px}.feature-flow{display:grid;grid-template-columns:repeat(4,1fr);gap:0}.feature-flow article{border-radius:0;box-shadow:none;border-left:0}.property-hero{display:grid;grid-template-columns:1fr .8fr;gap:var(--space-lg);align-items:end;background:var(--secondary)}.property-search{display:grid;grid-template-columns:1fr 1fr auto;gap:.8rem;padding:1rem;background:var(--surface);border:1px solid var(--line)}.property-listings{display:grid;grid-template-columns:repeat(4,1fr);gap:var(--space-md)}.property-listings article{padding:0;overflow:hidden}.property-listings img{height:260px;width:100%;object-fit:cover;border-radius:0}.property-listings h2,.property-listings p{padding:0 1rem}.event-hero{min-height:calc(100vh - 70px);display:grid;align-content:end;background:var(--primary);color:#fff}.event-hero h1{font-size:clamp(4rem,11vw,12rem)}.schedule-board{display:grid;gap:0}.schedule-board article{display:grid;grid-template-columns:160px 1fr 1.2fr;gap:var(--space-md);border-left:0;border-right:0;border-radius:0;box-shadow:none}.schedule-board time{font:700 2rem var(--font-display)}.education-hero{display:grid;grid-template-columns:.9fr .78fr .62fr;gap:var(--space-lg);align-items:center;background:var(--secondary)}.education-visual{margin:0;display:grid;gap:.7rem}.education-visual img{width:100%;height:560px;object-fit:cover;border-radius:var(--radius-lg)}.education-visual figcaption{font-weight:900;color:var(--primary)}.learning-card{padding:var(--space-lg);background:var(--surface);border:1px solid var(--line)}.course-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--space-md)}@media(max-width:1050px){.commerce-wall,.hospitality-hero,.care-hero,.professional-hero,.software-hero,.property-hero,.education-hero{grid-template-columns:1fr}.commerce-copy{position:static}.menu-board,.proof-ledger,.practice-matrix,.fitness-programs,.case-wall,.feature-flow,.property-listings,.course-grid{grid-template-columns:repeat(2,1fr)}.case-wall .case-large{grid-column:span 1;grid-row:span 1}.case-wall .case-large img{height:360px}.schedule-board article{grid-template-columns:1fr}.property-search{grid-template-columns:1fr}.education-visual img{height:420px}}@media(max-width:680px){.menu-board,.proof-ledger,.practice-matrix,.fitness-programs,.case-wall,.feature-flow,.property-listings,.course-grid{grid-template-columns:1fr}.booking-strip{align-items:flex-start;flex-direction:column}.hospitality-hero img{height:420px}.education-visual img{height:320px}}`;
}

function premiumCssV6(site) {
  return premiumCssV5(site) + `
.site-header{overflow:hidden}.site-header nav{min-width:0}.theme-toggle{width:46px;height:46px;min-width:46px;padding:0;border-radius:999px;background:color-mix(in srgb,var(--ink),transparent 6%);color:var(--surface);display:inline-grid;place-items:center;font-size:1.05rem}.theme-toggle span{display:block;width:18px;height:18px;border:2px solid currentColor;border-radius:50%;background:linear-gradient(90deg,currentColor 50%,transparent 50%)}.header-actions{display:flex;align-items:center;gap:.65rem;flex-wrap:wrap}.header-cta{min-height:44px;display:inline-flex;align-items:center;padding:.7rem 1rem;background:var(--ink);color:var(--surface);border-radius:var(--radius-sm);font-weight:900;text-decoration:none}.brand{max-width:min(420px,42vw)}.brand span{line-height:1.05}.brand-logo{object-position:left center}.brand-logo-short{height:42px;max-width:136px}.brand-logo-medium{height:54px;max-width:188px}.brand-logo-large{height:66px;max-width:230px}.brand-logo-hero{height:74px;max-width:260px}.brand-stacked,.brand-vertical{display:grid;gap:.2rem;line-height:1.05}.brand-vertical{align-items:start}.brand-logo-only .brand-logo{max-width:220px}.header-classic{justify-content:space-between}.header-minimal{border-bottom:0;background:color-mix(in srgb,var(--surface),transparent 3%)}.header-minimal nav{margin-left:auto}.header-split{display:grid;grid-template-columns:1fr auto 1fr auto;align-items:center}.header-split nav:first-child{justify-content:flex-start}.header-split nav:nth-of-type(2){justify-content:flex-end}.header-split .brand{justify-self:center;text-align:center}.header-stacked{display:grid;grid-template-columns:1fr;align-items:center;padding-bottom:.55rem}.header-brand-row{display:flex;align-items:center;justify-content:space-between;gap:1rem}.header-stacked nav{justify-content:center;border-top:1px solid color-mix(in srgb,var(--ink),transparent 94%);padding-top:.55rem}.header-editorial{display:grid;grid-template-columns:auto minmax(160px,360px) 1fr auto;align-items:center}.header-editorial>p{margin:0;color:var(--muted);font-size:.92rem}.company-house-note{font-size:.86rem;color:var(--muted);max-width:420px}h1{font-size:clamp(2.8rem,5.7vw,6.8rem);line-height:.96}.professional-hero h1,.software-hero h1,.portfolio-hero h1,.event-hero h1{font-size:clamp(3rem,6.8vw,7.4rem);line-height:.92;max-width:1050px}.page-hero h1,.hero h1,.story-split-page h1,.generic-mosaic h1{overflow-wrap:break-word}.story-split-page{display:grid;grid-template-columns:minmax(320px,.82fr) minmax(0,1fr);gap:var(--space-lg);align-items:center}.story-split-page img{width:100%;height:min(74vh,760px);object-fit:cover;object-position:center}.story-split-page h1{font-size:clamp(2.45rem,5vw,5.8rem);line-height:.98;max-width:900px;margin:0 0 var(--space-md)}.story-split-page p{font-size:1.05rem;max-width:720px}.story-split-page .eyebrow{font-size:.78rem}.people-directory img,.team-profile img,.people-spotlight img{object-fit:cover;filter:saturate(.92) contrast(1.03)}.generic-mosaic img,.product-card img,.wall-products img,.catalog-editorial img,.arrival-strip img,.lookbook-masonry img,.horizontal-lookbook img{background:var(--secondary);object-fit:cover}
.home-image-depth{display:grid;grid-template-columns:1.12fr .88fr;gap:var(--space-lg);align-items:center;background:var(--surface)}.home-image-depth figure{margin:0;display:grid;gap:.75rem}.home-image-depth img{width:100%;height:min(70vh,720px);object-fit:cover;border-radius:var(--radius-lg)}.home-image-depth figcaption{font-weight:900;color:var(--primary)}.home-keyword-depth{background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}.home-keyword-depth .section-heading{max-width:1100px}.keyword-cloud{display:flex;flex-wrap:wrap;gap:.6rem;margin-top:var(--space-md)}.keyword-cloud span{border:1px solid var(--line);padding:.55rem .8rem;border-radius:999px;font-weight:800;background:color-mix(in srgb,var(--secondary),var(--surface) 64%)}.home-benefit-board{display:grid;grid-template-columns:.68fr 1.32fr;gap:var(--space-lg);align-items:start}.home-benefit-board aside{position:sticky;top:110px}.home-benefit-board>div{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-md)}.home-benefit-board article{padding:var(--space-md)}.home-benefit-board article span{font-weight:900;color:var(--accent)}.home-service-depth{background:color-mix(in srgb,var(--secondary),var(--surface) 48%)}.home-service-depth ul{margin:1rem 0 0;padding-left:1.1rem}.home-proof-depth{display:grid;grid-template-columns:.8fr 1.2fr;gap:var(--space-lg);align-items:start;background:var(--ink);color:var(--surface)}.stats-depth{display:grid;grid-template-columns:repeat(3,1fr);gap:0}.stats-depth article{background:transparent;color:inherit;border-color:color-mix(in srgb,var(--surface),transparent 72%);border-radius:0}.stats-depth strong{display:block;font:800 clamp(2.2rem,5vw,5rem)/1 var(--font-display)}.home-proof-depth blockquote{background:color-mix(in srgb,var(--surface),transparent 90%);color:var(--surface);border-color:color-mix(in srgb,var(--surface),transparent 70%)}.home-faq-depth{display:grid;grid-template-columns:.7fr 1.3fr;gap:var(--space-lg);align-items:start}.faq-columns{columns:2 320px;column-gap:var(--space-md)}.faq-columns details{break-inside:avoid;margin:0 0 var(--space-md);padding:1rem}.home-final-cta{border-top:1px solid var(--line)}
.course-grid article h2,.premium-list article h2,.generic-mosaic article h2,.cards article h2,.service-rich-card h2,.proof-ledger article h2,.practice-matrix article h2{font-size:clamp(1.45rem,2vw,2.35rem);line-height:1.08;overflow-wrap:break-word}.course-grid article p,.premium-list article p,.generic-mosaic article p,.cards article p,.service-rich-card p,.proof-ledger article p,.practice-matrix article p{font-size:clamp(1rem,1.08vw,1.12rem);line-height:1.72}.premium-list article,.proof-ledger article,.practice-matrix article,.feature-flow article,.cards article,.service-rich-card{border:0!important;box-shadow:0 20px 60px color-mix(in srgb,var(--ink),transparent 92%);background:color-mix(in srgb,var(--surface),var(--secondary) 10%)}.proof-ledger,.practice-matrix,.feature-flow{gap:var(--space-md)}.service-rich-card{display:grid;gap:.95rem;align-content:start;min-height:360px;padding:clamp(1.25rem,2.4vw,2.1rem)}.service-rich-card>span{font-size:.75rem;text-transform:uppercase;letter-spacing:.12em;font-weight:900;color:var(--primary)}.service-rich-card ul{margin:.2rem 0 0;padding-left:1.1rem;display:grid;gap:.45rem}.service-rich-card .card-proof{margin-top:auto;padding-top:.8rem;border-top:1px solid color-mix(in srgb,var(--ink),transparent 90%);font-weight:800;color:var(--primary)}.product-signal-board{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-sm)}.product-signal-board article{border:0;padding:var(--space-md);background:color-mix(in srgb,var(--surface),transparent 8%);box-shadow:0 18px 50px color-mix(in srgb,var(--ink),transparent 88%)}.product-signal-board h2{font-size:clamp(1.35rem,2.2vw,2.4rem)}.product-signal-board span{font-weight:900;color:var(--accent)}.education-proof-panel{display:grid;grid-template-columns:.86fr 1.14fr;gap:var(--space-lg);background:var(--secondary)}.education-proof-panel>div:last-child{display:grid;gap:var(--space-sm)}.education-proof-panel details{padding:1rem}.motion-title{word-spacing:normal}.motion-title .motion-word{margin-right:.18em}.motion-title .motion-word:last-of-type{margin-right:0}
footer.footer-minimal,footer.footer-utility,footer.footer-doormat,footer.footer-mega,footer.footer-cta,footer.footer-hub,footer.footer-product,footer.footer-contextual,footer.footer-invisible{align-items:start}footer nav{display:flex;gap:.75rem;flex-wrap:wrap}footer h2{font-size:clamp(2rem,4vw,4rem)}footer h3{font-size:1rem;text-transform:uppercase;letter-spacing:.12em}.footer-legal{font-size:.9rem;color:var(--muted)}.footer-minimal{display:flex;justify-content:space-between;gap:1rem}.footer-utility{display:grid;grid-template-columns:1fr auto;gap:var(--space-md);background:var(--secondary)}.footer-doormat{display:grid;grid-template-columns:.9fr 1.2fr auto;gap:var(--space-lg)}.footer-doormat nav:not(.footer-legal){align-content:start}.footer-mega{display:grid;grid-template-columns:1.2fr .7fr .8fr .9fr;gap:var(--space-lg);background:var(--ink);color:var(--surface)}.footer-mega a,.footer-mega .footer-legal,.footer-mega address{color:color-mix(in srgb,var(--surface),transparent 18%)}.footer-mega .newsletter{grid-column:1/3}.footer-mega .footer-legal{grid-column:3/5}.footer-statement{max-width:820px}.footer-statement p{font:500 clamp(1.55rem,3vw,3.5rem)/1.08 var(--font-display);margin:.5rem 0}.footer-cta{display:grid;grid-template-columns:1.2fr .8fr auto;gap:var(--space-lg);background:var(--primary);color:#fff}.footer-cta .eyebrow,.footer-cta .footer-legal,.footer-cta a{color:#fff}.footer-hub{display:grid;grid-template-columns:1fr .7fr .7fr .7fr;gap:var(--space-lg)}.footer-product{display:grid;grid-template-columns:.7fr 1.3fr;gap:var(--space-lg);background:color-mix(in srgb,var(--secondary),var(--surface) 38%)}.footer-product-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:var(--space-sm)}.footer-product-grid article{padding:1rem;min-height:210px}.footer-product .footer-legal{grid-column:1/-1}.footer-contextual{display:grid;grid-template-columns:1fr .9fr .8fr .7fr;gap:var(--space-lg)}.footer-invisible{padding-top:1rem;padding-bottom:1rem;border-top:0;background:transparent}.footer-invisible .footer-legal{width:100%;justify-content:center}.footer-proof{display:grid;grid-template-columns:repeat(3,1fr);gap:.75rem}.footer-proof span{display:grid;border-top:1px solid currentColor;padding-top:.75rem}.footer-proof strong{font:800 clamp(2rem,4vw,4rem)/1 var(--font-display)}.newsletter{display:grid;gap:.65rem;min-width:min(100%,320px)}address{font-style:normal;color:var(--muted)}
[data-motion-ready] .reveal{will-change:transform,opacity;transition-delay:var(--reveal-delay,0ms)}[data-motion-ready] .reveal:nth-child(2n){--reveal-delay:70ms}[data-motion-ready] .reveal:nth-child(3n){--reveal-delay:140ms}.motion-word{display:inline-block;opacity:0;transform:translateY(.75em);transition:opacity .65s ease,transform .65s cubic-bezier(.2,.8,.2,1);transition-delay:calc(var(--word-index,0)*42ms)}.visible .motion-word,.motion-title.visible .motion-word{opacity:1;transform:none}.motion-media{overflow:hidden;transform:translate3d(0,var(--motion-y,0),0);transition:filter .45s ease}.motion-media img,.motion-media{will-change:transform}.motion-media img{transform:scale(1.055);transition:transform 1.1s cubic-bezier(.2,.8,.2,1)}.motion-media.visible img,.visible.motion-media img{transform:scale(1)}.parallax-soft{transform:translate3d(0,var(--parallax-y,0),0)}.parallax-deep{transform:translate3d(0,var(--parallax-y-deep,0),0)}.section-inview{--section-progress:1}.site-header{transition:transform .35s ease,background .35s ease}.site-header.header-hidden{transform:translateY(-105%)}.magnetic-hover{transition:transform .22s ease}.magnetic-hover:hover{transform:translateY(-3px)}.service-row.active{background:color-mix(in srgb,var(--secondary),transparent 60%)}.scroll-progress{box-shadow:0 0 18px color-mix(in srgb,var(--accent),transparent 25%)}h1{font-size:clamp(2.8rem,5.2vw,6.1rem);line-height:1.02;word-spacing:.08em}.professional-hero h1,.software-hero h1,.portfolio-hero h1,.event-hero h1{font-size:clamp(3rem,5.9vw,6.3rem);line-height:1.01;max-width:880px}.professional-hero .motion-word{margin-right:.12em}.professional-hero .motion-word:last-child{margin-right:0}@media(prefers-reduced-motion:reduce){*,*:before,*:after{animation:none!important;transition:none!important;scroll-behavior:auto!important}.reveal,.motion-word{opacity:1!important;transform:none!important}.parallax-soft,.parallax-deep,.motion-media{transform:none!important}}@media(max-width:1050px){.header-split,.header-editorial,.footer-utility,.footer-doormat,.footer-mega,.footer-cta,.footer-hub,.footer-product,.footer-contextual,.story-split-page,.home-image-depth,.home-benefit-board,.home-proof-depth,.home-faq-depth,.education-proof-panel,.product-signal-board{grid-template-columns:1fr}.footer-mega .newsletter,.footer-mega .footer-legal,.footer-product .footer-legal{grid-column:auto}.header-split .brand{justify-self:start}.header-editorial>p{display:none}.story-split-page img{height:460px;order:-1}.home-benefit-board aside{position:static}.home-benefit-board>div,.stats-depth,.footer-proof,.footer-product-grid{grid-template-columns:repeat(2,1fr)}.home-image-depth img{height:460px}}@media(max-width:680px){.story-split-page h1{font-size:clamp(2.2rem,14vw,3.7rem)}.professional-hero h1,.software-hero h1,.portfolio-hero h1,.event-hero h1,h1{font-size:clamp(2.45rem,12vw,4rem);line-height:1.04}.story-split-page img{height:340px}.site-header{align-items:flex-start}.header-brand-row,.header-actions,.footer-minimal{align-items:flex-start;flex-direction:column}.brand{max-width:100%}.theme-toggle{width:44px;height:44px}.brand-logo-hero{height:64px;max-width:220px}.home-benefit-board>div,.stats-depth,.footer-proof,.footer-product-grid{grid-template-columns:1fr}.faq-columns{columns:1}.home-image-depth img{height:340px}}`;
}

function premiumJsV2() {
  return premiumJs() + `
document.documentElement.setAttribute('data-motion-ready','true');
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)').matches;
document.querySelectorAll('h1,h2,.brand-thesis p').forEach((el)=>{if(el.dataset.motionSplit||el.textContent.trim().length>140)return;el.dataset.motionSplit='true';const words=el.textContent.trim().split(/\\s+/);el.textContent='';words.forEach((word,index)=>{const span=document.createElement('span');span.className='motion-word';span.style.setProperty('--word-index',index);span.textContent=word;el.appendChild(span);if(index<words.length-1)el.appendChild(document.createTextNode(' '))});el.classList.add('motion-title','reveal')});
document.querySelectorAll('img').forEach((img,index)=>{const parent=img.parentElement;if(parent&&['PICTURE','FIGURE','ARTICLE','DIV','SECTION'].includes(parent.tagName)){parent.classList.add('motion-media',index%3===0?'parallax-deep':'parallax-soft')}else{img.classList.add('motion-media',index%3===0?'parallax-deep':'parallax-soft')}});
document.querySelectorAll('article,blockquote,details,.button,.text-link').forEach((el)=>el.classList.add('magnetic-hover'));
document.querySelectorAll('.reveal,.motion-media').forEach(el=>{try{io.observe(el)}catch{}});
let lastY=scrollY;const header=document.querySelector('.site-header');const motionTick=()=>{const y=scrollY;const vh=innerHeight||1;document.querySelectorAll('.parallax-soft,.parallax-deep').forEach((el)=>{const rect=el.getBoundingClientRect();if(rect.bottom<0||rect.top>vh)return;const center=(rect.top+rect.height/2)-vh/2;el.style.setProperty('--parallax-y',(-center*.035).toFixed(2)+'px');el.style.setProperty('--parallax-y-deep',(-center*.065).toFixed(2)+'px')});document.querySelectorAll('section').forEach((section)=>{const rect=section.getBoundingClientRect();const progress=Math.max(0,Math.min(1,1-Math.abs((rect.top+rect.height/2)-vh/2)/(vh*.85)));section.style.setProperty('--section-progress',progress.toFixed(3));if(progress>.12)section.classList.add('section-inview')});if(header){if(y>lastY&&y>180)header.classList.add('header-hidden');else header.classList.remove('header-hidden')}lastY=y};if(!reduceMotion){addEventListener('scroll',()=>requestAnimationFrame(motionTick),{passive:true});addEventListener('resize',motionTick);motionTick()}
document.querySelectorAll('.service-row').forEach(row=>{const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting)row.classList.add('active');else row.classList.remove('active')}),{threshold:.45});observer.observe(row)});`;
}

function css(site) {
  const t = site.tokens;
  return `:root{--primary:${t.colors.primary};--secondary:${t.colors.secondary};--accent:${t.colors.accent};--ink:${t.colors.ink};--surface:${t.colors.surface};--muted:${t.colors.muted};--radius-sm:${t.radius.sm};--radius-md:${t.radius.md};--radius-lg:${t.radius.lg};--shadow-sm:${t.shadow.sm};--shadow-md:${t.shadow.md};--space-xs:${t.spacing.xs};--space-sm:${t.spacing.sm};--space-md:${t.spacing.md};--space-lg:${t.spacing.lg};--space-xl:${t.spacing.xl};--font-display:"${t.fonts.display}",serif;--font-body:"${t.fonts.body}",system-ui,sans-serif}body.dark{--ink:${t.colors.darkInk};--surface:${t.colors.darkSurface};--secondary:#17262b;--muted:#c6d6dc}*{box-sizing:border-box}body{margin:0;font-family:var(--font-body);line-height:1.6;color:var(--ink);background:var(--surface)}a{color:inherit}img{max-width:100%;display:block;border-radius:var(--radius-md)}.site-header{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:var(--space-sm);padding:var(--space-sm) clamp(1rem,4vw,4rem);background:color-mix(in srgb,var(--surface),transparent 8%);backdrop-filter:blur(14px);border-bottom:1px solid color-mix(in srgb,var(--ink),transparent 88%)}.brand{display:inline-flex;align-items:center;gap:.65rem;font:700 1.15rem var(--font-display);text-decoration:none}.brand-logo{width:auto;max-width:150px;height:42px;object-fit:contain;border-radius:0}.site-header nav{display:flex;gap:var(--space-sm);flex-wrap:wrap}.site-header a{text-decoration:none}.theme-toggle,.button,button{min-width:44px;min-height:44px;border:0;border-radius:var(--radius-sm);background:var(--primary);color:white;padding:.75rem 1rem;font-weight:700;cursor:pointer}.button{display:inline-flex;align-items:center;text-decoration:none}.secondary{background:var(--ink)}.hero,.page-hero{padding:clamp(4rem,9vw,8rem) clamp(1rem,6vw,6rem);text-align:center;background:var(--secondary)}.hero h1,.page-hero h1{font-family:var(--font-display);font-size:clamp(2.4rem,6vw,6rem);line-height:1;margin:0 auto var(--space-md);max-width:980px}.hero p,.page-hero p{max-width:760px;margin:0 auto var(--space-md);color:var(--muted)}section{padding:var(--space-xl) clamp(1rem,6vw,6rem)}h2{font-family:var(--font-display);font-size:clamp(1.7rem,3vw,3rem);line-height:1.08}.band{background:color-mix(in srgb,var(--secondary),var(--surface) 42%)}.service-list,.cards,.testimonials,.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:var(--space-md)}article,details,blockquote,.stats div{border:1px solid color-mix(in srgb,var(--ink),transparent 86%);border-radius:var(--radius-md);padding:var(--space-md);box-shadow:var(--shadow-sm);background:var(--surface)}.split{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));align-items:center;gap:var(--space-lg)}.content-narrow{max-width:860px;margin:auto}.form{display:grid;gap:var(--space-sm)}label{display:grid;gap:.35rem;font-weight:700}input,textarea,.search{width:100%;min-height:44px;border:1px solid color-mix(in srgb,var(--ink),transparent 78%);border-radius:var(--radius-sm);padding:.85rem;background:var(--surface);color:var(--ink)}textarea{min-height:150px}.map{min-height:340px;display:grid;place-items:center;background:var(--secondary);border-radius:var(--radius-md);padding:var(--space-md);margin-bottom:var(--space-sm)}footer{display:flex;justify-content:space-between;gap:var(--space-md);flex-wrap:wrap;padding:var(--space-lg) clamp(1rem,6vw,6rem);border-top:1px solid color-mix(in srgb,var(--ink),transparent 86%)}.reveal{opacity:0;transform:translateY(18px);transition:.6s ease}.reveal.visible{opacity:1;transform:none}@media(max-width:760px){.site-header{align-items:flex-start}.site-header nav{font-size:.95rem}.hero,.page-hero{text-align:left}.hero p,.page-hero p,.hero h1,.page-hero h1{margin-left:0}.stats{grid-template-columns:1fr 1fr}}`;
}

function js(site) {
  return `document.querySelector('[data-theme-toggle]')?.addEventListener('click',()=>document.body.classList.toggle('dark'));const io=new IntersectionObserver(es=>es.forEach(e=>{if(e.isIntersecting)e.target.classList.add('visible')}),{threshold:.12});document.querySelectorAll('.reveal').forEach(el=>io.observe(el));document.querySelectorAll('[data-count]').forEach(el=>{let end=Number(el.dataset.count),n=0,step=Math.max(1,Math.round(end/60));let id=setInterval(()=>{n+=step;if(n>=end){n=end;clearInterval(id)}el.textContent=end===49?(n/10).toFixed(1):n.toLocaleString()},24)});fetch('admin/csrf.php').then(r=>r.json()).then(d=>document.querySelectorAll('[name="_csrf"]').forEach(i=>i.value=d.token)).catch(()=>{});window.initMap=function(){const el=document.getElementById('map');if(!el||!window.google)return;const pos={lat:Number(el.dataset.lat),lng:Number(el.dataset.lng)};const map=new google.maps.Map(el,{center:pos,zoom:15});new google.maps.Marker({position:pos,map,title:el.dataset.name})};`;
}

function faqSchema(site) {
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: site.content.faqs.map((f) => ({ '@type': 'Question', name: f.question, acceptedAnswer: { '@type': 'Answer', text: f.answer } })) })}</script>`;
}

function articleSchema(site) {
  const p = site.content.blogPosts[0];
  return `<script type="application/ld+json">${JSON.stringify({ '@context': 'https://schema.org', '@type': 'Article', headline: p.title, datePublished: today(), author: { '@type': 'Organization', name: site.brief.businessName } })}</script>`;
}

function sitemap(site) {
  const pages = site.blueprint?.pages?.length ? site.blueprint.pages.map((pageItem) => pageFileName(pageItem)).concat(['blog-post.html', 'privacy.html']) : ['index.html', 'about.html', 'team.html', 'services.html', 'blog.html', 'blog-post.html', 'contact.html', 'privacy.html'];
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map((p) => `<url><loc>https://${site.domain}/${p}</loc><lastmod>${today()}</lastmod></url>`).join('')}</urlset>`;
}

function feed(site) {
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${esc(site.brief.businessName)} Blog</title>${site.content.blogPosts.map((p) => `<item><title>${esc(p.title)}</title><description>${esc(p.intro)}</description></item>`).join('')}</channel></rss>`;
}

function seoKeywordReport(site) {
  const strategy = site.content?.seoStrategy || normalizeSiteSeoStrategy(site);
  const sections = [
    site.content.hero.headline,
    site.content.hero.subtext,
    site.content.brandThesis,
    site.content.localProof,
    ...site.content.aboutParagraphs,
    ...site.content.services.flatMap((service) => [service.title, service.description, ...(service.bullets || [])]),
    ...site.content.faqs.flatMap((faq) => [faq.question, faq.answer]),
    ...site.content.blogPosts.flatMap((post) => [post.title, post.intro])
  ].join(' ');
  const words = wordCount(sections);
  const rows = [...strategy.primaryKeywords, ...strategy.secondaryKeywords.slice(0, 10)].map((keyword) => {
    const count = phraseCount(sections, keyword);
    const density = words ? (count / words) * 100 : 0;
    const target = strategy.primaryKeywords.includes(keyword) ? strategy.densityTargets.primary : strategy.densityTargets.secondary;
    return `| ${keyword} | ${count} | ${density.toFixed(2)}% | ${target} |`;
  }).join('\n');
  const primaryTotal = strategy.primaryKeywords.reduce((sum, keyword) => sum + phraseCount(sections, keyword), 0);
  const secondaryTotal = strategy.secondaryKeywords.reduce((sum, keyword) => sum + phraseCount(sections, keyword), 0);
  const primaryDensity = words ? (primaryTotal / words) * 100 : 0;
  const secondaryDensity = words ? (secondaryTotal / words) * 100 : 0;
  const maxSecondary = Math.max(0, ...strategy.secondaryKeywords.map((keyword) => words ? (phraseCount(sections, keyword) / words) * 100 : 0));
  return `# SEO Keyword Report: ${site.brief.businessName}

Formula used: exact keyword occurrences / total visible content words × 100.

Target guidance:
- Primary keyword family: ${strategy.densityTargets.primary}
- Secondary keyword family: ${strategy.densityTargets.secondary}
- Rule: prefer natural semantic usage over repeated exact-match stuffing.

Total analysed words: ${words}

## Density Summary
| Keyword family | Total exact matches | Density | Target |
| --- | ---: | ---: | --- |
| Primary | ${primaryTotal} | ${primaryDensity.toFixed(2)}% | ${strategy.densityTargets.primary} |
| Secondary total | ${secondaryTotal} | ${secondaryDensity.toFixed(2)}% | Per-term target below |
| Highest secondary term | - | ${maxSecondary.toFixed(2)}% | ${strategy.densityTargets.secondary} |

## Primary Keywords
${strategy.primaryKeywords.map((keyword) => `- ${keyword}`).join('\n')}

## Secondary Keywords
${strategy.secondaryKeywords.map((keyword) => `- ${keyword}`).join('\n')}

## Page Keyword Map
${Object.entries(strategy.pageKeywordMap || {}).map(([pageName, keywords]) => `- ${pageName}: ${(Array.isArray(keywords) ? keywords : []).join(', ')}`).join('\n')}

## Density Table
| Keyword | Count | Density | Target |
| --- | ---: | ---: | --- |
${rows}

## Natural Usage Notes
${strategy.naturalUsageNotes}
`;
}

function wordCount(text) {
  return (String(text || '').match(/\b[\w'-]+\b/g) || []).length;
}

function learningMemoryReport(site) {
  const learning = site.learningContext || {};
  const rules = Array.isArray(learning.rules) ? learning.rules : [];
  return `# Learning Memory: ${site.brief.businessName}

This file records which feedback-derived rules influenced this generation. It is for the operator, not for public website visitors.

Industry matched: ${learning.industry || site.brief.industry || 'General'}
Learning rules applied: ${rules.length}

## Applied Guidance

${learning.promptGuidance || 'No previous feedback rules matched this generation yet.'}

## Rules

${rules.length ? rules.map((rule) => `- [${rule.signalType}] ${rule.scope}${rule.industry ? ` / ${rule.industry}` : ''}: ${rule.instruction} (weight ${rule.weight})`).join('\n') : '- No stored learning rules were available.'}

## How It Learns

- Feedback from previews is stored as structured ratings and notes.
- Positive feedback becomes repeatable guidance.
- Negative feedback becomes avoidance guidance.
- Suggested changes become future-priority guidance.
- Rules are grouped globally and by industry so one bad design does not blindly affect every future project.
`;
}

function creativeBrief(site) {
  const c = site.content;
  return `# Creative Brief: ${site.brief.businessName}

## Positioning

${c.brandThesis}

## Audience Promise

${c.hero.subtext}

## Differentiators

${c.differentiators.map((item) => `- ${item.title}: ${item.text}`).join('\n')}

## Trust Signals

${c.trustSignals.map((item) => `- ${item}`).join('\n')}

## SEO Keyword Strategy

- Primary: ${(c.seoStrategy?.primaryKeywords || []).join(', ')}
- Secondary: ${(c.seoStrategy?.secondaryKeywords || []).slice(0, 10).join(', ')}
- Density target: primary ${c.seoStrategy?.densityTargets?.primary || '0.8-1.4%'}, secondary ${c.seoStrategy?.densityTargets?.secondary || '0.2-0.7%'}
- Usage rule: ${c.seoStrategy?.naturalUsageNotes || 'Use terms naturally and avoid keyword stuffing.'}

## Conversion Prompts

${c.conversionPrompts.map((item) => `- ${item.title}: ${item.text} CTA: ${item.cta}`).join('\n')}

## Official Company Data

${site.metadata?.companyHouse ? `- Source: Companies House
- Company name: ${site.metadata.companyHouse.companyName}
- Company number: ${site.metadata.companyHouse.companyNumber || 'Not supplied'}
- Registered office: ${site.metadata.companyHouse.address || 'Not supplied'}
- Display on website: ${site.metadata.showCompanyHouse ? 'Yes' : 'No'}` : '- No Companies House company selected.'}

## Image Direction

- Hero: ${c.imageDirection?.heroSeed || site.brief.industry}
- Service: ${c.imageDirection?.serviceSeed || site.brief.industry}
- Detail: ${c.imageDirection?.textureSeed || site.brief.industry}

## Generation Matrix

${(site.blueprint?.pages || []).map((pageItem) => `- ${pageItem.title}: ${pageItem.purpose} / Layout: ${pageItem.layoutArchetype || 'auto'} / Conversion: ${pageItem.conversionTarget || 'enquiry'}`).join('\n')}

## AI Image Assets

${(site.generatedImages || []).length ? site.generatedImages.map((asset) => `- ${asset.id}: ${asset.file || `not generated (${asset.error || 'skipped'})`}${asset.fallback ? ` (designed fallback: ${asset.error})` : ' (AI generated)'}`).join('\n') : '- AI image generation was skipped or unavailable.'}
`;
}

function productionPlan(site) {
  const pages = site.blueprint?.pages || [];
  const matrix = site.metadata?.generationMatrix?.pageMatrix || [];
  return `# Production Plan: ${site.brief.businessName}

This file explains how the generator assembled the website so an operator can improve or extend it without guessing.

## Internal Design Standard

The site is generated under an elite-designer standard: no generic/repetitive layout by habit, clear reading flow, strong conversion logic, real persuasive copy, purposeful image placement, scroll-triggered motion, and semantic production structure.

## Text Creation

- Hero message: ${site.content.hero.headline}
- Positioning: ${site.content.brandThesis}
- Main audience: ${site.blueprint?.audience || 'Website visitors who need a clear reason to take action.'}
- Primary goal: ${site.blueprint?.primaryGoal || 'Generate qualified enquiries.'}

## Page Matrix

${pages.map((pageItem, index) => {
  const row = matrix.find((item) => String(item.page || '').toLowerCase() === String(pageItem.title || '').toLowerCase()) || {};
  return `### ${pageItem.title}

- Purpose: ${pageItem.purpose || row.visitorQuestion || 'Support the visitor journey.'}
- Sections: ${(pageItem.sections || []).join(', ') || 'Hero, content, proof, CTA'}
- Layout: ${pageItem.layoutArchetype || 'auto'}
- Visitor question: ${row.visitorQuestion || 'What should I understand before taking action?'}
- Visual move: ${row.visualMove || 'Use a distinct layout rhythm and image crop for this page.'}
- Primary CTA: ${pageItem.conversionTarget || row.primaryCta || 'Contact'}`;
}).join('\n\n')}

## Image Design And Placement

${(site.imagePlan || []).map((asset) => {
  const generated = (site.generatedImages || []).find((item) => item.id === asset.id || item.purpose === asset.purpose);
  return `- ${asset.id}: ${asset.purpose}, ${asset.aspect || 'auto'} image, ${generated?.file ? `available at ${generated.file}` : 'uses generated or curated fallback at render time'}${generated?.fallback ? `; fallback reason: ${generated.error}` : ''}.`;
}).join('\n') || '- No custom image plan was supplied.'}

## Motion System

- Headings are split into animated words on load.
- Images receive soft or deep parallax movement based on placement.
- Cards, links, and buttons receive subtle hover lift.
- Sections set in-view progress variables for future custom animation.
- Reduced-motion users receive static content automatically.
`;
}

async function auditGeneratedSite(site, outDir) {
  const indexPath = path.join(outDir, 'index.html');
  const html = await fs.readFile(indexPath, 'utf8');
  const nature = projectNature(site);
  const checks = [
    {
      name: 'Homepage has enough sections',
      passed: (html.match(/<section\b/g) || []).length >= 5,
      detail: `${(html.match(/<section\b/g) || []).length} sections found`
    },
    {
      name: 'Homepage displays generated/local imagery',
      passed: html.includes('assets/images/') || (html.match(/<img\b/g) || []).length >= 1,
      detail: `${(html.match(/<img\b/g) || []).length} image tags found`
    },
    {
      name: 'No random placeholder providers on homepage',
      passed: !/picsum\.photos|placeholder\.com|placehold\.co/.test(html),
      detail: /picsum\.photos|placeholder\.com|placehold\.co/.test(html) ? 'Random placeholder provider found' : 'No random placeholder provider found'
    },
    {
      name: 'Project type matches visible language',
      passed: !(nature !== 'software' && /software project|Request demo|dashboard-mock|Product<\/a>|Use Cases<\/a>/.test(html)),
      detail: `Detected nature: ${nature}`
    },
    {
      name: 'Hero is not only empty visual boxes',
      passed: !(/dashboard-mock/.test(html) && nature !== 'software'),
      detail: /dashboard-mock/.test(html) ? 'Dashboard mock present' : 'No dashboard mock placeholder'
    }
  ];
  const score = Math.round((checks.filter((check) => check.passed).length / checks.length) * 100);
  return { score, checks };
}

function presentabilityReport(site, audit) {
  return `# Presentability Report: ${site.brief.businessName}

Score: ${audit.score}/100

${audit.checks.map((check) => `- ${check.passed ? 'PASS' : 'NEEDS REVIEW'}: ${check.name} (${check.detail})`).join('\n')}

## Operator Note

This report is generated automatically after the website files are written. A score below 80 means the site should be regenerated or manually reviewed before showing it to a client.
`;
}

function styleGuide(site) {
  const t = site.tokens;
  const swatches = [['Primary', t.colors.primary], ['Secondary', t.colors.secondary], ['Accent', t.colors.accent], ['Ink', t.colors.ink], ['Surface', t.colors.surface]].map(([label, color]) => `<article><span style="background:${esc(color)}"></span><strong>${label}</strong><code>${esc(color)}</code></article>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Style Guide | ${esc(site.brief.businessName)}</title><style>body{font-family:${JSON.stringify(t.fonts.body)},system-ui,sans-serif;margin:0;color:${t.colors.ink};background:${t.colors.surface}}main{padding:clamp(2rem,6vw,6rem)}h1,h2{font-family:${JSON.stringify(t.fonts.display)},serif;line-height:1}h1{font-size:clamp(3rem,8vw,7rem)}.swatches{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:1rem}.swatches article{border:1px solid #d7e1e5;padding:1rem}.swatches span{display:block;height:120px;margin-bottom:1rem}code{display:block;margin-top:.5rem}</style></head><body><main><p>${esc(site.brief.industry)} / ${esc(site.brief.location)}</p><h1>${esc(site.brief.businessName)}</h1><p>${esc(site.content.brandThesis)}</p><h2>Colour System</h2><section class="swatches">${swatches}</section><h2>Typography</h2><p>Display: ${esc(t.fonts.display)}<br>Body: ${esc(t.fonts.body)}</p></main></body></html>`;
}

function generatedDatabaseSql() {
  return `CREATE TABLE admins(id INTEGER PRIMARY KEY AUTO_INCREMENT,email VARCHAR(190) UNIQUE,password_hash VARCHAR(255),must_change_password TINYINT DEFAULT 1,failed_logins INT DEFAULT 0,locked_until DATETIME NULL);INSERT INTO admins(email,password_hash,must_change_password) VALUES('admin@example.com','$2b$10$ANgAA/bCXaiZpIdcIMvvu.OQxqkNvT8/WjnwyvGI1mc85B.pihwPq',1);CREATE TABLE submissions(id INTEGER PRIMARY KEY AUTO_INCREMENT,name VARCHAR(190),email VARCHAR(190),phone VARCHAR(80),message TEXT,is_read TINYINT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);CREATE TABLE newsletter(id INTEGER PRIMARY KEY AUTO_INCREMENT,email VARCHAR(190),created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);CREATE TABLE pages(id INTEGER PRIMARY KEY AUTO_INCREMENT,slug VARCHAR(190) UNIQUE,title VARCHAR(190),content MEDIUMTEXT,meta_title VARCHAR(190),meta_description TEXT);CREATE TABLE team(id INTEGER PRIMARY KEY AUTO_INCREMENT,name VARCHAR(190),role VARCHAR(190),bio TEXT,photo VARCHAR(255),social_url VARCHAR(255));CREATE TABLE posts(id INTEGER PRIMARY KEY AUTO_INCREMENT,title VARCHAR(190),slug VARCHAR(190) UNIQUE,body MEDIUMTEXT,category VARCHAR(120),tags VARCHAR(255),published TINYINT DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);CREATE TABLE settings(setting_key VARCHAR(190) PRIMARY KEY,setting_value TEXT);`;
}

function generatedEnv() {
  return `DB_HOST=localhost\nDB_NAME=\nDB_USER=\nDB_PASS=\nGOOGLE_MAPS_API_KEY=\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_USER=\nSMTP_PASS=\nSMTP_FROM=\nGA4_ID=\nFACEBOOK_PIXEL_ID=\n`;
}

function generatedReadme(site) {
  return `# ${site.brief.businessName}

Generated website package.

## Structure

- Static public pages in the root.
- \`admin/\` contains the PHP CMS.
- \`database.sql\` contains schema and seed-ready tables.
- \`storage/uploads\` is intended for uploaded media and should be protected from direct script execution.

## Domain

Chosen domain: \`${site.domain}\`.

Check availability with a registrar before purchase. After purchase, point DNS to your hosting provider using either A records for a VPS or nameservers supplied by shared hosting.

## cPanel

Upload files to \`public_html\`, create a database, import \`database.sql\`, fill \`.env\`, then visit \`/admin\`. Default password is \`admin123\`; change it on first login.

## VPS Nginx

Use PHP-FPM and point the server root at this folder.

\`\`\`nginx
server {
  server_name ${site.domain};
  root /var/www/${site.siteId};
  index index.html index.php;
  location / { try_files $uri $uri/ /index.html; }
  location ~ \\.php$ { include snippets/fastcgi-php.conf; fastcgi_pass unix:/run/php/php8.2-fpm.sock; }
}
\`\`\`

## Static + CMS Split

Upload public HTML/assets to a static host, then host \`admin/\` on PHP hosting if CMS editing is required.

## Maps and SMTP

Set \`GOOGLE_MAPS_API_KEY\` for interactive maps. Configure SMTP variables for contact notifications.
`;
}
function adminBootstrap(site) {
  return `<?php
session_start();
function envv($key,$default=''){return getenv($key)?:$default;}
$pdo=new PDO('mysql:host='.envv('DB_HOST','localhost').';dbname='.envv('DB_NAME','').';charset=utf8mb4',envv('DB_USER',''),envv('DB_PASS',''),[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
function csrf(){if(empty($_SESSION['csrf']))$_SESSION['csrf']=bin2hex(random_bytes(32));return $_SESSION['csrf'];}
function check_csrf(){if(($_POST['_csrf']??'')!==($_SESSION['csrf']??'')){http_response_code(403);exit('Invalid CSRF');}}
function auth(){if(empty($_SESSION['admin_id'])){header('Location:index.php');exit;}}
function e($v){return htmlspecialchars((string)$v,ENT_QUOTES,'UTF-8');}
function upload_photo($file){$allowed=['image/jpeg'=>'jpg','image/png'=>'png','image/webp'=>'webp'];if(empty($file['tmp_name'])||!isset($allowed[$file['type']]))return null;$name=bin2hex(random_bytes(12)).'.'.$allowed[$file['type']];move_uploaded_file($file['tmp_name'],__DIR__.'/../storage/uploads/'.$name);return $name;}
$business='${esc(site.brief.businessName)}';
?>`;
}

function adminPhp(type, site) {
  const title = type === 'login' ? 'Admin Login' : type.replace(/-/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase());
  if (type === 'login') return `<?php require __DIR__.'/bootstrap.php'; if($_SERVER['REQUEST_METHOD']==='POST'){check_csrf();$stmt=$pdo->prepare('SELECT * FROM admins WHERE email=?');$stmt->execute([$_POST['email']??'']);$u=$stmt->fetch(PDO::FETCH_ASSOC);if($u&&empty($u['locked_until'])&&password_verify($_POST['password']??'',$u['password_hash'])){$_SESSION['admin_id']=$u['id'];header('Location:dashboard.php');exit;}$pdo->prepare('UPDATE admins SET failed_logins=failed_logins+1, locked_until=IF(failed_logins>=4,DATE_ADD(NOW(),INTERVAL 15 MINUTE),locked_until) WHERE email=?')->execute([$_POST['email']??'']);$error='Invalid login';} ?><!doctype html><html><head><title>${title}</title><link rel="stylesheet" href="../assets/css/styles.css"></head><body><main class="content-narrow"><h1>${title}</h1><form method="post" class="form"><input type="hidden" name="_csrf" value="<?=csrf()?>"><label>Email<input name="email" type="email" required></label><label>Password<input name="password" type="password" required></label><button>Login</button></form><p><?=e($error??'Default password: admin123')?></p></main></body></html>`;
  return `<?php require __DIR__.'/bootstrap.php'; auth(); ?><!doctype html><html><head><title>${title}</title><link rel="stylesheet" href="../assets/css/styles.css"><script src="https://cdn.quilljs.com/1.3.7/quill.min.js"></script><link href="https://cdn.quilljs.com/1.3.7/quill.snow.css" rel="stylesheet"></head><body><header class="site-header"><a class="brand" href="dashboard.php"><?=e($business)?></a><nav><a href="pages.php">Pages</a><a href="team.php">Team</a><a href="blog.php">Blog</a><a href="contact-settings.php">Contact</a><a href="seo.php">SEO</a><a href="social.php">Social</a><a href="submissions.php">Submissions</a><a href="settings.php">Settings</a></nav></header><main class="content-narrow"><h1>${title}</h1><p>Secure CMS screen for ${type}. All writes use prepared statements and CSRF validation.</p><form method="post" class="form" enctype="multipart/form-data"><input type="hidden" name="_csrf" value="<?=csrf()?>"><label>Title<input name="title"></label><label>Content<textarea name="content"></textarea></label><button>Save changes</button></form></main></body></html>`;
}

function generatedCsrfEndpoint() {
  return `<?php require __DIR__.'/bootstrap.php'; header('Content-Type: application/json'); echo json_encode(['token'=>csrf()]);`;
}

function generatedContactEndpoint() {
  return `<?php require __DIR__.'/bootstrap.php'; check_csrf(); $stmt=$pdo->prepare('INSERT INTO submissions(name,email,phone,message) VALUES(?,?,?,?)'); $stmt->execute([$_POST['name']??'',$_POST['email']??'',$_POST['phone']??'',$_POST['message']??'']); $to=getenv('SMTP_FROM')?:'admin@example.com'; @mail($to,'New website enquiry',($_POST['message']??''),'From: '.($_POST['email']??'no-reply@example.com')); header('Location: ../contact.html?sent=1');`;
}

function generatedNewsletterEndpoint() {
  return `<?php require __DIR__.'/bootstrap.php'; check_csrf(); $stmt=$pdo->prepare('INSERT INTO newsletter(email) VALUES(?)'); $stmt->execute([$_POST['email']??'']); header('Location: ../index.html?subscribed=1');`;
}



