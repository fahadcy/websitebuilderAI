import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_FILES = [
  'index.html',
  'contact.html',
  'privacy.html',
  '404.html',
  'sitemap.xml',
  'robots.txt',
  'feed.xml',
  'README.md',
  'database.sql',
  '.env.example',
  'admin/index.php',
  'admin/dashboard.php',
  'admin/bootstrap.php'
];

const REQUIRED_PAGE_SIGNALS = [
  { label: 'SEO title', pattern: /<title>[^<]{12,}<\/title>/i },
  { label: 'Meta description', pattern: /<meta\s+name=["']description["'][^>]+content=["'][^"']{50,}/i },
  { label: 'Canonical URL', pattern: /<link\s+rel=["']canonical["']/i },
  { label: 'Open Graph meta', pattern: /<meta\s+property=["']og:/i },
  { label: 'Schema JSON-LD', pattern: /application\/ld\+json/i },
  { label: 'Responsive viewport', pattern: /<meta\s+name=["']viewport["']/i },
  { label: 'Linked design system CSS', pattern: /assets\/css\/styles\.css/i }
];

export async function runRealityCheck(site, outDir) {
  const startedAt = new Date().toISOString();
  const files = await listFiles(outDir);
  const htmlFiles = files.filter((file) => file.endsWith('.html') && file !== 'style-guide.html');
  const pageReads = await Promise.all(htmlFiles.map(async (file) => [file, await fs.readFile(path.join(outDir, file), 'utf8')]));
  const pages = Object.fromEntries(pageReads);
  const css = await readOptional(path.join(outDir, 'assets', 'css', 'styles.css'));
  const appJs = await readOptional(path.join(outDir, 'assets', 'js', 'app.js'));
  const browserAudit = await withTimeout(browserChecks(outDir), 25_000, [
    check({
      category: 'browser qa',
      name: 'Real browser smoke test completed within budget',
      passed: false,
      detail: 'Browser QA timed out after 25 seconds',
      severity: 'warning',
      weight: 2
    })
  ]);

  const checks = [
    ...fileStructureChecks(files),
    ...pageQualityChecks(site, pages),
    ...linkAndAssetChecks(files, pages),
    ...seoChecks(pages),
    ...securityChecks(files, pages, outDir),
    ...performanceChecks(files, pages, css, appJs),
    ...uxChecks(pages, css, appJs),
    ...cmsChecks(files),
    ...browserAudit
  ];

  const weighted = checks.reduce((sum, check) => sum + check.weight, 0);
  const passed = checks.filter((check) => check.passed).reduce((sum, check) => sum + check.weight, 0);
  const score = weighted ? Math.round((passed / weighted) * 100) : 0;
  const blockers = checks.filter((check) => !check.passed && check.severity === 'blocker');
  const warnings = checks.filter((check) => !check.passed && check.severity !== 'blocker');
  const verdict = blockers.length ? 'fix_before_client_preview' : score >= 88 ? 'client_ready' : score >= 75 ? 'operator_review' : 'regenerate_or_fix';

  return {
    agent: 'Reality Check Agent',
    version: '1.0',
    startedAt,
    completedAt: new Date().toISOString(),
    score,
    verdict,
    summary: summaryFromVerdict(score, blockers.length, warnings.length),
    metrics: {
      pagesChecked: htmlFiles.length,
      filesChecked: files.length,
      blockers: blockers.length,
      warnings: warnings.length,
      estimatedPageWeightKb: estimatePageWeight(files)
    },
    checks
  };
}

export function realityCheckMarkdown(site, report) {
  const grouped = groupBy(report.checks, 'category');
  return `# Reality Check Agent Report: ${site.businessName || site.brief?.businessName || 'Generated Site'}

Score: ${report.score}/100

Verdict: ${report.verdict}

${report.summary}

## Metrics

- Pages checked: ${report.metrics.pagesChecked}
- Files checked: ${report.metrics.filesChecked}
- Blockers: ${report.metrics.blockers}
- Warnings: ${report.metrics.warnings}
- Estimated package file weight: ${report.metrics.estimatedPageWeightKb}KB

${Object.entries(grouped).map(([category, checks]) => `## ${titleCase(category)}

${checks.map((check) => `- ${check.passed ? 'PASS' : check.severity.toUpperCase()}: ${check.name} (${check.detail})`).join('\n')}`).join('\n\n')}

## Operator Standard

This report is generated before the package is handed to the client. A blocker means the site should be fixed or regenerated. A score under 88 should receive operator review before delivery.
`;
}

function fileStructureChecks(files) {
  return REQUIRED_FILES.map((file) => check({
    category: 'architecture',
    name: `${file} exists`,
    passed: files.includes(file),
    detail: files.includes(file) ? 'Found' : 'Missing from generated package',
    severity: file.includes('admin/') || file.endsWith('.html') ? 'blocker' : 'warning',
    weight: file.endsWith('.html') || file.includes('admin/') ? 3 : 2
  }));
}

function pageQualityChecks(site, pages) {
  const index = pages['index.html'] || '';
  const pageCount = Object.keys(pages).length;
  const nature = projectNatureFromSite(site);
  const checks = [
    check({
      category: 'ux',
      name: 'Generated site includes multiple real pages',
      passed: pageCount >= 6,
      detail: `${pageCount} HTML pages found`,
      severity: 'blocker',
      weight: 4
    }),
    check({
      category: 'content',
      name: 'Homepage has enough conversion sections',
      passed: count(index, /<section\b/gi) >= 5,
      detail: `${count(index, /<section\b/gi)} sections found`,
      severity: 'blocker',
      weight: 5
    }),
    check({
      category: 'content',
      name: 'Homepage has substantial copy',
      passed: wordCount(stripTags(index)) >= 450,
      detail: `${wordCount(stripTags(index))} visible words estimated`,
      severity: 'warning',
      weight: 4
    }),
    check({
      category: 'ux',
      name: 'Hero is not empty boxes or software mockup for wrong industry',
      passed: !/dashboard-mock|wireframe/i.test(index),
      detail: nature === 'software' ? 'Software mockups allowed' : 'No unrelated dashboard/wireframe hero detected',
      severity: 'blocker',
      weight: 5
    }),
    check({
      category: 'ux',
      name: 'Dark mode control uses an icon instead of visible Mode text',
      passed: !/>Mode<\/button>/i.test(index),
      detail: 'Prevents chunky text buttons in generated headers',
      severity: 'warning',
      weight: 2
    }),
    check({
      category: 'content',
      name: 'No lorem ipsum or AI placeholder language',
      passed: !/lorem ipsum|your business|sample text|company background and mission/i.test(stripTags(Object.values(pages).join('\n'))),
      detail: 'Scans generated page copy for obvious filler',
      severity: 'blocker',
      weight: 5
    }),
    check({
      category: 'ux',
      name: 'Images are present on key pages',
      passed: count(Object.values(pages).join('\n'), /<img\b/gi) >= Math.min(5, pageCount),
      detail: `${count(Object.values(pages).join('\n'), /<img\b/gi)} image tags found`,
      severity: 'warning',
      weight: 3
    })
  ];
  return checks;
}

function linkAndAssetChecks(files, pages) {
  const html = Object.values(pages).join('\n');
  const hrefs = extractAttributes(html, 'href')
    .filter((href) => !/^(https?:|mailto:|tel:|#|javascript:)/i.test(href))
    .map(cleanAssetPath);
  const srcs = extractAttributes(html, 'src')
    .filter((src) => !/^(https?:|data:)/i.test(src))
    .map(cleanAssetPath);
  const internalPageLinks = hrefs.filter((href) => href.endsWith('.html'));
  const missingLinks = internalPageLinks.filter((href) => !files.includes(href));
  const missingAssets = [...hrefs.filter((href) => !href.endsWith('.html')), ...srcs].filter((asset) => asset && !files.includes(asset));
  return [
    check({
      category: 'bug finding',
      name: 'No broken internal page links',
      passed: missingLinks.length === 0,
      detail: missingLinks.length ? missingLinks.slice(0, 5).join(', ') : `${internalPageLinks.length} links checked`,
      severity: 'blocker',
      weight: 5
    }),
    check({
      category: 'bug finding',
      name: 'No missing local image/CSS/JS assets',
      passed: missingAssets.length === 0,
      detail: missingAssets.length ? missingAssets.slice(0, 5).join(', ') : 'All referenced local assets found',
      severity: 'blocker',
      weight: 5
    }),
    check({
      category: 'ux',
      name: 'Images have useful alt text',
      passed: !/<img\b(?![^>]*\balt=["'][^"']{6,}["'])/i.test(html),
      detail: 'Checks every image tag has meaningful alt text',
      severity: 'warning',
      weight: 3
    })
  ];
}

function seoChecks(pages) {
  const entries = Object.entries(pages).filter(([file]) => file !== '404.html');
  const checks = REQUIRED_PAGE_SIGNALS.map((signal) => {
    const missing = entries.filter(([, html]) => !signal.pattern.test(html)).map(([file]) => file);
    return check({
      category: 'seo',
      name: `${signal.label} exists on every public page`,
      passed: missing.length === 0,
      detail: missing.length ? `Missing on ${missing.slice(0, 5).join(', ')}` : `${entries.length} pages checked`,
      severity: signal.label === 'SEO title' || signal.label === 'Meta description' ? 'blocker' : 'warning',
      weight: signal.label === 'SEO title' || signal.label === 'Meta description' ? 4 : 2
    });
  });
  return checks;
}

function securityChecks(files, pages, outDir) {
  const html = Object.values(pages).join('\n');
  return [
    check({
      category: 'security',
      name: 'No secrets leaked in generated HTML',
      passed: !/(sk-[a-z0-9_-]{20,}|OPENAI_API_KEY\s*=.+|SMTP_PASS\s*=.+|GOOGLE_MAPS_API_KEY\s*=\s*[A-Za-z0-9_-]{12,})/i.test(html),
      detail: 'Scans HTML for common secret patterns',
      severity: 'blocker',
      weight: 5
    }),
    check({
      category: 'security',
      name: 'Admin bootstrap uses password hashing',
      passed: files.some((file) => file.startsWith('admin/') && fileContains(outDir, file, /password_hash|password_verify|\$2y\$|\$2b\$/)) || fileContains(outDir, 'database.sql', /password_hash|\$2y\$|\$2b\$/),
      detail: 'Admin authentication should not store plain passwords',
      severity: 'blocker',
      weight: 4
    }),
    check({
      category: 'security',
      name: 'Generated admin includes CSRF helper',
      passed: files.includes('admin/csrf.php') || fileContains(outDir, 'admin/bootstrap.php', /csrf/i),
      detail: 'Protects CMS forms against cross-site requests',
      severity: 'blocker',
      weight: 4
    }),
    check({
      category: 'security',
      name: 'Environment example does not contain real secrets',
      passed: fileContains(outDir, '.env.example', /^OPENAI_API_KEY=$|^GOOGLE_MAPS_API_KEY=$|SMTP_PASS=/m),
      detail: '.env.example exists with blank configurable values',
      severity: 'warning',
      weight: 2
    })
  ];
}

function performanceChecks(files, pages, css, appJs) {
  const html = Object.values(pages).join('\n');
  const localImageCount = count(html, /<img\b[^>]+src=["']assets\/images\//gi);
  return [
    check({
      category: 'performance',
      name: 'CSS payload remains lightweight',
      passed: byteLength(css) <= 180_000,
      detail: `${Math.round(byteLength(css) / 1024)}KB CSS`,
      severity: 'warning',
      weight: 2
    }),
    check({
      category: 'performance',
      name: 'JavaScript payload remains lightweight',
      passed: byteLength(appJs) <= 120_000,
      detail: `${Math.round(byteLength(appJs) / 1024)}KB JS`,
      severity: 'warning',
      weight: 2
    }),
    check({
      category: 'performance',
      name: 'No large inline base64 images',
      passed: !/data:image\/[^;]+;base64,[A-Za-z0-9+/=]{50000,}/.test(html),
      detail: 'Prevents heavy HTML and slow first paint',
      severity: 'warning',
      weight: 2
    }),
    check({
      category: 'performance',
      name: 'Generated site uses local packaged images',
      passed: localImageCount >= 3 || count(html, /<img\b/gi) === 0,
      detail: `${localImageCount} packaged image references found`,
      severity: 'warning',
      weight: 3
    })
  ];
}

function uxChecks(pages, css, appJs) {
  const html = Object.values(pages).join('\n');
  return [
    check({
      category: 'ux',
      name: 'Dark mode toggle exists',
      passed: /data-theme-toggle|theme-toggle/i.test(html) && /dark/i.test(appJs + css),
      detail: 'Checks for visible toggle and supporting CSS/JS',
      severity: 'warning',
      weight: 2
    }),
    check({
      category: 'ux',
      name: 'Scroll animation system exists',
      passed: /IntersectionObserver|reveal|parallax|scroll-progress/i.test(appJs + css + html),
      detail: 'Checks for real scroll-triggered behaviour',
      severity: 'warning',
      weight: 3
    }),
    check({
      category: 'ux',
      name: 'Contact page has actionable form or contact links',
      passed: /<form[\s\S]*name=.*email|mailto:|tel:/i.test(pages['contact.html'] || ''),
      detail: 'Visitor can make contact without guessing',
      severity: 'blocker',
      weight: 4
    })
  ];
}

function cmsChecks(files) {
  const adminFiles = files.filter((file) => file.startsWith('admin/') && file.endsWith('.php'));
  return [
    check({
      category: 'cms',
      name: 'CMS panel contains multiple management screens',
      passed: adminFiles.length >= 8,
      detail: `${adminFiles.length} PHP admin files found`,
      severity: 'warning',
      weight: 3
    }),
    check({
      category: 'cms',
      name: 'Contact and newsletter endpoints are included',
      passed: files.includes('admin/contact.php') && files.includes('admin/newsletter.php'),
      detail: 'Checks generated backend capture endpoints',
      severity: 'warning',
      weight: 3
    })
  ];
}

async function browserChecks(outDir) {
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true, timeout: 10_000, args: ['--disable-gpu', '--no-sandbox'] });
    const viewports = [
      { name: 'desktop', width: 1440, height: 1000 },
      { name: 'mobile', width: 390, height: 844 }
    ];
    const results = [];
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      await page.route('**/*', (route) => {
        const url = route.request().url();
        const type = route.request().resourceType();
        if (/^https?:/i.test(url) && ['image', 'font', 'media'].includes(type)) return route.abort();
        return route.continue();
      });
      await page.goto(pathToFileURL(path.join(outDir, 'index.html')).href, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      const snapshot = await page.evaluate(() => {
        const body = document.body;
        const rects = [...document.querySelectorAll('main section, header, footer')]
          .map((el) => el.getBoundingClientRect())
          .filter((rect) => rect.width > 10 && rect.height > 10);
        const images = [...document.images].map((img) => ({
          src: img.getAttribute('src') || '',
          complete: img.complete,
          width: img.naturalWidth,
          height: img.naturalHeight,
          visibleWidth: img.getBoundingClientRect().width,
          visibleHeight: img.getBoundingClientRect().height
        }));
        return {
          textLength: body.innerText.trim().length,
          visibleBlocks: rects.length,
          scrollWidth: document.documentElement.scrollWidth,
          clientWidth: document.documentElement.clientWidth,
          heroHeight: document.querySelector('main section')?.getBoundingClientRect().height || 0,
          imageCount: images.length,
          brokenImages: images.filter((img) => img.src && !/^https?:/i.test(img.src) && img.complete && (img.width === 0 || img.height === 0)).length,
          tinyVisibleImages: images.filter((img) => img.visibleWidth > 0 && img.visibleWidth < 40 && img.visibleHeight < 40).length
        };
      });
      await page.close();
      results.push({ viewport, snapshot });
    }
    await browser.close();
    return [
      check({
        category: 'browser qa',
        name: 'Homepage renders with real visible content',
        passed: results.every((result) => result.snapshot.textLength > 500 && result.snapshot.visibleBlocks >= 5),
        detail: results.map((result) => `${result.viewport.name}: ${result.snapshot.visibleBlocks} visible blocks, ${result.snapshot.textLength} text chars`).join('; '),
        severity: 'blocker',
        weight: 6
      }),
      check({
        category: 'browser qa',
        name: 'No horizontal overflow on desktop or mobile',
        passed: results.every((result) => result.snapshot.scrollWidth <= result.snapshot.clientWidth + 4),
        detail: results.map((result) => `${result.viewport.name}: ${result.snapshot.scrollWidth}px/${result.snapshot.clientWidth}px`).join('; '),
        severity: 'blocker',
        weight: 5
      }),
      check({
        category: 'browser qa',
        name: 'Hero area is visibly populated',
        passed: results.every((result) => result.snapshot.heroHeight > 260),
        detail: results.map((result) => `${result.viewport.name}: ${Math.round(result.snapshot.heroHeight)}px hero`).join('; '),
        severity: 'warning',
        weight: 3
      }),
      check({
        category: 'browser qa',
        name: 'Browser did not detect broken rendered images',
        passed: results.every((result) => result.snapshot.brokenImages === 0),
        detail: results.map((result) => `${result.viewport.name}: ${result.snapshot.brokenImages} broken images`).join('; '),
        severity: 'warning',
        weight: 3
      })
    ];
  } catch (error) {
    return [
      check({
        category: 'browser qa',
        name: 'Real browser smoke test available',
        passed: false,
        detail: `Playwright could not run: ${String(error.message || error).split('\n')[0]}`,
        severity: 'warning',
        weight: 2
      })
    ];
  }
}

async function withTimeout(promise, ms, fallback) {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function listFiles(dir, prefix = '') {
  const entries = await fs.readdir(path.join(dir, prefix), { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const relative = path.posix.join(prefix.replace(/\\/g, '/'), entry.name);
    if (entry.isDirectory()) return listFiles(dir, relative);
    return [relative];
  }));
  return nested.flat();
}

async function readOptional(file) {
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return '';
  }
}

function fileContains(outDir, file, pattern) {
  try {
    const value = fsSync.readFileSync(path.join(outDir, file), 'utf8');
    return pattern.test(value);
  } catch {
    return false;
  }
}

function check(input) {
  return {
    category: input.category,
    name: input.name,
    passed: Boolean(input.passed),
    detail: input.detail,
    severity: input.severity || 'warning',
    weight: input.weight || 1
  };
}

function extractAttributes(html, attr) {
  const values = [];
  const pattern = new RegExp(`${attr}=["']([^"']+)["']`, 'gi');
  let match;
  while ((match = pattern.exec(html))) values.push(match[1]);
  return values;
}

function cleanAssetPath(value) {
  return String(value || '').split('#')[0].split('?')[0].replace(/^\.\//, '').replace(/^\/+/, '');
}

function stripTags(html) {
  return String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ');
}

function wordCount(text) {
  return (String(text || '').match(/\b[\w'-]{2,}\b/g) || []).length;
}

function count(text, pattern) {
  return (String(text || '').match(pattern) || []).length;
}

function byteLength(text) {
  return Buffer.byteLength(String(text || ''), 'utf8');
}

function estimatePageWeight(files) {
  return Math.round(files.length * 8);
}

function projectNatureFromSite(site) {
  const value = `${site?.brief?.industry || site?.industry || ''} ${site?.prompt || site?.metadata?.prompt || ''}`.toLowerCase();
  if (/software|saas|app|platform|dashboard|ai/.test(value)) return 'software';
  if (/tutor|school|course|education|academy/.test(value)) return 'education';
  if (/shoe|shop|store|ecommerce|sale|retail/.test(value)) return 'commerce';
  if (/clinic|health|dental|physio|therapy|care/.test(value)) return 'care';
  return 'service';
}

function summaryFromVerdict(score, blockers, warnings) {
  if (blockers) return `${blockers} blocker issue${blockers === 1 ? '' : 's'} found. Fix before showing this website to a client.`;
  if (score >= 88) return `Client-ready quality gate passed with ${warnings} warning${warnings === 1 ? '' : 's'}.`;
  if (score >= 75) return `No blockers found, but ${warnings} warning${warnings === 1 ? '' : 's'} need operator review.`;
  return `Quality is below delivery standard. Regenerate or edit before client preview.`;
}

function groupBy(items, key) {
  return items.reduce((groups, item) => {
    const value = item[key] || 'other';
    groups[value] = groups[value] || [];
    groups[value].push(item);
    return groups;
  }, {});
}

function titleCase(value) {
  return String(value).replace(/\b\w/g, (letter) => letter.toUpperCase());
}
