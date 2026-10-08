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
import { getLearningContext } from '../learning/feedbackMemory.js';
import { planDesign, renderStudioSite } from './studio/index.js';
import { css as oklchCss } from './studio/palette.js';

const root = process.cwd();

const esc = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
const today = () => new Date().toISOString().slice(0, 10);

export async function generatePipelineSite(prompt, progress = () => {}, metadata = {}) {
  progress({ status: 'running', progress: 8, message: 'Reading your brief' });
  // Classify from what the user actually wrote; the enriched prompt also carries image
  // plans and blueprint notes whose wording must not decide the industry.
  const userPrompt = metadata.userPrompt || prompt;
  const facts = parsePromptFacts(userPrompt, metadata);

  progress({ status: 'running', progress: 15, message: isAiTextEnabled() ? 'Writing the site copy with AI' : 'Writing the site copy' });
  let learning = { promptGuidance: '', rules: [] };
  try {
    learning = getLearningContext({ industry: facts.industry, prompt: userPrompt });
  } catch (error) {
    console.warn(`Learning context unavailable: ${error.message}`);
  }
  const ai = await generateSiteCopy(prompt, facts, learning.promptGuidance);
  const { brief, content: draftContent } = buildBriefAndContent({ facts, ai, metadata });
  const content = buildContentEngine(brief, draftContent);

  progress({ status: 'running', progress: 26, message: 'Designing a layout and colour system' });
  const generationSeed = crypto.randomBytes(6).toString('hex');
  const plan = planDesign({ brief, content, prompt: userPrompt, seed: generationSeed, aiDesign: draftContent.aiDesign || {} });
  console.log(`[pipeline] ${brief.business_name} | ${brief.industry} (${brief.project_nature}) | copy: ${ai ? 'AI' : 'rule-based fallback'} | learning rules applied: ${learning.rules?.length || 0} | design: ${plan.directionId}/${plan.palette.defaultMode} hero:${plan.variants.hero} services:${plan.variants.services}${plan.onePage ? ' | one-page' : ''}`);

  const siteId = `${slugify(brief.business_name, { lower: true, strict: true }) || 'generated-site'}-${crypto.randomBytes(3).toString('hex')}`;
  const outDir = path.join(root, 'generated-sites', siteId);
  await prepareOutput(outDir);

  const mode = plan.palette.defaultMode;
  const colours = plan.palette[mode];
  const site = {
    siteId,
    generationSeed,
    brief: snakeBriefToCamelBrief(brief, content),
    pipelineBrief: brief,
    content,
    tokens: { colors: { primary: oklchCss(colours.primary), secondary: oklchCss(colours.bg), accent: oklchCss(colours.accent), ink: oklchCss(colours.ink) }, fonts: { display: plan.direction.fonts.display, body: plan.direction.fonts.body } },
    design: { direction: plan.directionId, mode, variants: plan.variants },
    templateProfile: { mode: plan.onePage ? 'onePage' : 'multiPage', direction: plan.directionId },
    metadata: { ...metadata, prompt },
    blueprint: {
      projectNature: brief.project_nature,
      businessType: brief.industry,
      primaryGoal: brief.goal,
      audience: brief.target_audience,
      visualStrategy: `${plan.direction.name} design, ${mode} theme, ${content.aiDesign?.mood || brief.tone} mood`,
      researchBrief: researchBriefFor(brief),
      pages: brief.pages.map((title) => ({ title, slug: slugForPage(title), purpose: pagePurpose(title, brief), sections: [] }))
    },
    assetMap: {},
    generatedImages: []
  };

  progress({ status: 'running', progress: 34, message: 'Creating photography and artwork' });
  const imageResult = await generateSiteImages(site, outDir, progress);
  site.assetMap = imageResult.assetMap || {};
  site.generatedImages = imageResult.generatedImages || [];
  site.imagePlan = imageResult.imagePlan || [];

  let logo = null;
  if (metadata.logoPath) {
    try {
      logo = `assets/images/logo${path.extname(metadata.logoPath).toLowerCase()}`;
      await fs.copyFile(metadata.logoPath, path.join(outDir, logo));
    } catch (error) {
      console.warn(`Logo copy skipped: ${error.message}`);
      logo = null;
    }
  }

  progress({ status: 'running', progress: 62, message: 'Building pages, animations and interactions' });
  const domain = metadata.domainName || `${domainSlug(brief.business_name)}.co.uk`;
  const files = codeGenerator({ brief, content, plan, site, domain, logo });
  await writeFiles(outDir, files);

  progress({ status: 'running', progress: 78, message: 'Checking quality' });
  const validation = await validateGeneratedSite(outDir, brief, content, files, plan);
  await fs.writeFile(path.join(outDir, 'validator-report.md'), validatorMarkdown(validation), 'utf8');

  const audit = await runRealityCheck(site, outDir);
  await fs.writeFile(path.join(outDir, 'reality-check-report.md'), realityCheckMarkdown(site, audit), 'utf8');

  progress({ status: 'running', progress: 90, message: 'Packaging your website' });
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

function buildContentEngine(brief, draft) {
  const pages = Object.fromEntries(brief.pages.map((page) => [page, pageContent(page, brief, draft)]));
  return { ...draft, pages };
}

function codeGenerator({ brief, content, plan, site, domain, logo }) {
  const pageList = (plan.onePage ? ['Home'] : brief.pages).map((page) => ({ page, slug: slugForPage(page), data: content.pages[page] || pageContent(page, brief, content) }));
  const privacyBody = `<h2>Who we are</h2><p>${esc(brief.business_name)}${brief.address ? `, ${esc(brief.address)}` : ''}. Contact us at <a href="mailto:${esc(brief.contact_email)}">${esc(brief.contact_email)}</a>${brief.contact_phone ? ` or ${esc(brief.contact_phone)}` : ''}.</p><h2>What we collect</h2><p>When you use our contact form we collect your name, email address, phone number (if given) and your message, so we can reply to your enquiry.</p><h2>How we use it</h2><p>We only use your details to respond to you and provide the service you asked about. We never sell your information.</p><h2>How long we keep it</h2><p>Enquiries are kept for up to 24 months unless you become a customer, in which case records are kept as required by law.</p><h2>Your rights</h2><p>Under UK GDPR you can ask to see, correct or delete the information we hold about you. Email us and we will respond within one month.</p>`;
  const utility = [
    { page: 'Privacy Policy', slug: 'privacy.html', data: utilityData(brief, 'Privacy policy', 'How we collect, use and protect your information.'), utility: privacyBody },
    { page: 'Page not found', slug: '404.html', data: utilityData(brief, 'Page not found', 'Sorry, we could not find that page.'), utility: `<p>The page may have moved. <a href="index.html">Return to the home page</a> or <a href="${plan.onePage ? 'index.html#contact' : slugForPage('Contact')}">get in touch</a>.</p>` }
  ];
  const headFor = (item) => headMarkup({ item, brief, content, domain });
  const rendered = renderStudioSite({ brief, content, site, plan, pages: [...pageList, ...utility], headFor, logo });
  const allPages = pageList.map((item) => item.slug);
  return [
    ...Object.entries(rendered.html),
    ['assets/css/styles.css', rendered.css],
    ['assets/css/style.css', rendered.css],
    ['assets/js/app.js', rendered.js],
    ['assets/js/script.js', rendered.js],
    ['sitemap.xml', sitemapXml(domain, allPages)],
    ['robots.txt', `User-agent: *\nAllow: /\nSitemap: https://${domain}/sitemap.xml\n`],
    ['feed.xml', feedXml(brief, domain)],
    ['README.md', readme(brief, domain)],
    ['research-and-strategy.md', researchBriefFor(brief)],
    ['design-notes.md', designNotes(plan, brief)],
    ['validator-contract.md', pipelineContract()],
    ['database.sql', generatedDatabaseSql()],
    ['.env.example', generatedEnv()],
    ['admin/bootstrap.php', adminBootstrap()],
    ['admin/index.php', adminPage('Admin Login')],
    ['admin/dashboard.php', adminPage('Dashboard')],
    ['admin/content.php', adminPage('Content')],
    ['admin/media.php', adminPage('Media')],
    ['admin/settings.php', adminPage('Settings')],
    ['admin/contact.php', contactEndpoint()],
    ['admin/newsletter.php', newsletterEndpoint()],
    ['admin/csrf.php', csrfEndpoint()],
    ['storage/.htaccess', 'Require all denied\nDeny from all\n']
  ];
}

function utilityData(brief, title, intro) {
  return { h1: title, subheadline: intro, sections: [], cta: '', metaTitle: fitMetaTitle(`${title} | ${brief.business_name}`, brief.industry), metaDescription: fitMetaDescription(`${intro} ${brief.business_name}${brief.location ? `, ${brief.location}` : ''}.`) };
}

function headMarkup({ item, brief, content, domain }) {
  const data = item.data;
  const pagePath = item.slug === 'index.html' ? '' : item.slug;
  const keywords = content.seoKeywords?.length ? `\n<meta name="keywords" content="${esc(content.seoKeywords.join(', '))}">` : '';
  return `<title>${esc(data.metaTitle)}</title>
<meta name="description" content="${esc(data.metaDescription)}">${keywords}
<link rel="canonical" href="https://${esc(domain)}/${pagePath}">
<meta property="og:title" content="${esc(data.metaTitle)}">
<meta property="og:description" content="${esc(data.metaDescription)}">
<meta property="og:type" content="website">
<meta property="og:url" content="https://${esc(domain)}/${pagePath}">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${schemaForPage(item.page, brief, domain, content)}</script>`;
}

function designNotes(plan, brief) {
  const p = plan.palette;
  return `# Design notes: ${brief.business_name}

- Direction: ${plan.direction.name} (${plan.directionId})
- Theme: ${p.defaultMode} by default, with a light/dark toggle
- Typefaces: ${plan.direction.fonts.display} (display), ${plan.direction.fonts.body} (body)
- Layout: hero "${plan.variants.hero}", services "${plan.variants.services}", about "${plan.variants.about}", process "${plan.variants.process}", call to action "${plan.variants.cta}", footer "${plan.variants.footer}"${plan.onePage ? '\n- Format: one-page site with anchor navigation' : ''}
- Contrast (WCAG): light text ${p.report.light.text.toFixed(1)}:1, buttons ${p.report.light.button.toFixed(1)}:1; dark text ${p.report.dark.text.toFixed(1)}:1, buttons ${p.report.dark.button.toFixed(1)}:1
- Motion: scroll reveals, split-text headings, parallax layers, animated counters${plan.direction.motion.marquee ? ', marquee' : ''}${plan.direction.motion.magnetic ? ', magnetic buttons' : ''}${plan.direction.motion.tilt ? ', 3D tilt cards' : ''}${plan.direction.motion.cursor ? ', cursor glow' : ''}${plan.direction.motion.preloader ? ', preloader' : ''}. Respects reduced-motion settings.
`;
}

async function validateGeneratedSite(outDir, brief, content, files, plan) {
  const htmlFiles = files.filter(([name]) => name.endsWith('.html'));
  const css = files.find(([name]) => name === 'assets/css/styles.css')?.[1] || '';
  const checks = [];
  for (const [file, html] of htmlFiles) {
    const title = decodeEntities(html.match(/<title>([^<]*)<\/title>/i)?.[1] || '');
    const description = decodeEntities(html.match(/<meta name="description" content="([^"]*)"/i)?.[1] || '');
    checks.push(check(`${file}: one h1`, (html.match(/<h1\b/gi) || []).length === 1));
    checks.push(check(`${file}: heading order`, headingOrderIsValid(html)));
    checks.push(check(`${file}: meta title`, title.length >= 25 && title.length <= 60));
    checks.push(check(`${file}: meta description`, description.length >= 120 && description.length <= 160));
    checks.push(check(`${file}: JSON-LD`, /application\/ld\+json/i.test(html)));
    checks.push(check(`${file}: image alt text`, !/<img\b(?![^>]*alt=")/i.test(html)));
    checks.push(check(`${file}: two internal links`, (html.match(/href="(?!https?:|mailto:|tel:)[^"]+"/gi) || []).length >= 2));
  }
  checks.push(check('No broken internal links', internalLinksExist(files)));
  checks.push(check('CSS uses OKLCH colour tokens only', /oklch\(/i.test(css) && !/#[0-9a-f]{3,8}\b/i.test(css)));
  checks.push(check('Dark mode tokens present', /\[data-theme="dark"\]/.test(css)));
  checks.push(check('WCAG AA contrast for text, links and buttons (both themes)', plan.palette.contrastOk));
  checks.push(check('No rendered text below 12px', !/font-size:\s*(?:[0-9]|1[01])px/i.test(css)));
  checks.push(check('Mobile layout includes 375px-safe breakpoint', /@media\(max-width:767px\)/.test(css)));
  checks.push(check('Reduced-motion fallback present', /prefers-reduced-motion/.test(css)));
  checks.push(check('No local storage', !/localStorage|sessionStorage/.test(files.map(([, body]) => body).join('\n'))));
  checks.push(check('Sitemap lists pages', (plan.onePage ? ['Home'] : brief.pages).every((page) => sitemapContains(files, page))));
  checks.push(check('Primary keyword in first 100 words', firstWords(htmlFiles[0]?.[1] || '', 160).toLowerCase().includes(String(content.primaryKeyword || '').toLowerCase().split(' ')[0])));
  return { passed: checks.every((item) => item.passed), checks };
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

function slugForPage(page) {
  const label = String(page || 'page').trim();
  if (/^(home|homepage|home page)$/i.test(label)) return 'index.html';
  // Any "Contact", "Contact Us", "Contact & Booking" page is the contact page.
  if (/^contact\b/i.test(label)) return 'contact.html';
  const slug = slugify(label, { lower: true, strict: true }) || 'page';
  // Never let a content page overwrite a reserved file.
  if (['index', '404', 'privacy', 'privacy-policy'].includes(slug)) return `${slug}-page.html`;
  return `${slug}.html`;
}

function titleCase(value) {
  return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()).trim();
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
  return `CONTACT_TO=\nOPENAI_API_KEY=\nGOOGLE_MAPS_API_KEY=\nDB_HOST=localhost\nDB_NAME=\nDB_USER=\nDB_PASS=\nSMTP_HOST=\nSMTP_PORT=587\nSMTP_USER=\nSMTP_PASS=\nSMTP_FROM=\n`;
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
  // Validates CSRF + required fields, drops spam (honeypot), stores the enquiry in
  // storage/submissions.csv (blocked from the web by storage/.htaccess) and emails it
  // to CONTACT_TO when set. Always redirects back to the page the form was on.
  return `<?php
require __DIR__.'/bootstrap.php';
$back = (isset($_POST['_back']) && preg_match('/^[a-z0-9-]+\\.html$/', $_POST['_back'])) ? $_POST['_back'] : 'index.html';
function go($back, $ok) { header('Location: ../'.$back.'?sent='.($ok ? '1' : '0').'#contact'); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') go($back, false);
if (!empty($_POST['website'])) go($back, true);
if (empty($_SESSION['csrf']) || !hash_equals($_SESSION['csrf'], (string)($_POST['_csrf'] ?? ''))) go($back, false);
$name = trim((string)($_POST['name'] ?? ''));
$email = filter_var(trim((string)($_POST['email'] ?? '')), FILTER_VALIDATE_EMAIL);
$message = trim((string)($_POST['message'] ?? ''));
if ($name === '' || !$email || $message === '' || strlen($message) > 5000) go($back, false);
$row = [date('c'), $name, $email, substr((string)($_POST['phone'] ?? ''), 0, 40), substr((string)($_POST['topic'] ?? ''), 0, 120), $message];
$dir = __DIR__.'/../storage';
if (!is_dir($dir)) @mkdir($dir, 0750, true);
$fh = @fopen($dir.'/submissions.csv', 'a');
if ($fh) { fputcsv($fh, $row); fclose($fh); }
$to = getenv('CONTACT_TO');
if ($to) {
  $body = "Name: $name\\nEmail: $email\\nPhone: {$row[3]}\\nInterested in: {$row[4]}\\n\\n$message";
  @mail($to, 'New website enquiry from '.$name, $body, 'Reply-To: '.$email);
}
go($back, true);
`;
}

function newsletterEndpoint() {
  return `<?php require __DIR__.'/bootstrap.php'; header('Location: ../index.html?subscribed=1');`;
}
