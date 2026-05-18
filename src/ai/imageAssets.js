import fs from 'node:fs/promises';
import path from 'node:path';
import OpenAI from 'openai';
import slugify from 'slugify';

const client = process.env.OPENAI_API_KEY ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const DEFAULT_PURPOSES = [
  { id: 'hero', purpose: 'heroSeed', size: '1536x1024', aspect: 'landscape' },
  { id: 'texture', purpose: 'textureSeed', size: '1024x1024', aspect: 'square' },
  { id: 'service', purpose: 'serviceSeed', size: '1536x1024', aspect: 'landscape' },
  { id: 'about', purpose: 'about story', size: '1024x1536', aspect: 'portrait' },
  { id: 'product', purpose: 'productSeed', size: '1024x1024', aspect: 'square' },
  { id: 'work', purpose: 'workSeed', size: '1536x1024', aspect: 'landscape' }
];

export function normalizeImagePlan(plan, site) {
  const source = Array.isArray(plan) ? plan : Array.isArray(plan?.assets) ? plan.assets : [];
  const fallback = defaultImagePlan(site);
  const items = source.length ? source : fallback;
  return items.slice(0, imageLimit()).map((item, index) => ({
    id: safeId(item.id || item.name || item.purpose || `image_${index + 1}`),
    purpose: String(item.purpose || fallback[index % fallback.length]?.purpose || DEFAULT_PURPOSES[index % DEFAULT_PURPOSES.length].purpose),
    size: validSize(item.size) ? item.size : fallback[index % fallback.length]?.size || '1536x1024',
    aspect: item.aspect || fallback[index % fallback.length]?.aspect || 'landscape',
    prompt: String(item.prompt || fallback[index % fallback.length]?.prompt || '').slice(0, 2200)
  })).filter((item) => item.prompt);
}

export function defaultImagePlan(site) {
  const nature = site.blueprint?.projectNature || site.metadata?.blueprint?.projectNature || site.brief.industry || 'service';
  const visual = site.blueprint?.visualStrategy || 'premium, realistic, commercially useful website photography';
  const palette = `${site.tokens.colors.primary}, ${site.tokens.colors.secondary}, ${site.tokens.colors.accent}`;
  const base = [
    `${site.brief.businessName}, ${site.brief.industry}, ${site.brief.location}`,
    `Visual strategy: ${visual}`,
    `Use a restrained colour mood compatible with ${palette}.`,
    'Create realistic premium editorial website photography with believable lighting, natural composition, useful negative space, and a commercial art-direction standard.',
    'Avoid generic stock-photo smiles, random props, over-polished plastic skin, fake signage, visible text, typography, logos, watermarks, UI labels, surreal objects, and unrelated animals.'
  ].join(' ');
  return DEFAULT_PURPOSES.map((asset) => ({
    ...asset,
    prompt: `${base} Image role: ${asset.purpose}. ${directionForPurpose(asset.purpose, nature)}`
  }));
}

export async function generateSiteImages(site, outDir, progress = () => {}) {
  const imagePlan = normalizeImagePlan(site.metadata?.imagePlan, site);
  const enabled = site.metadata?.generateImages !== false && process.env.GENERATE_AI_IMAGES !== 'false';
  const assetMap = {};
  const generatedImages = [];
  if (!imagePlan.length) return { imagePlan, assetMap, generatedImages, skipped: true };

  const imageDir = path.join(outDir, 'assets', 'images');
  await fs.mkdir(imageDir, { recursive: true });
  if (!enabled || !client) {
    return {
      imagePlan,
      assetMap,
      generatedImages,
      skipped: true,
      reason: enabled ? 'OPENAI_API_KEY is missing or image client is unavailable; using curated photographic URLs in generated pages.' : 'AI image generation disabled; using curated photographic URLs in generated pages.'
    };
  }

  const model = process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1';
  const quality = process.env.OPENAI_IMAGE_QUALITY || 'medium';

  for (let index = 0; index < imagePlan.length; index += 1) {
    const asset = imagePlan[index];
    try {
      progress({ status: 'running', progress: 26 + Math.round((index / imagePlan.length) * 10), message: `Generating AI image: ${asset.id}` });
      const response = await client.images.generate({
        model,
        prompt: asset.prompt,
        size: asset.size,
        quality,
        n: 1
      });
      const b64 = response.data?.[0]?.b64_json;
      if (!b64) throw new Error('Image API returned no image data');
      const fileName = `${String(index + 1).padStart(2, '0')}-${safeId(asset.id)}.png`;
      await fs.writeFile(path.join(imageDir, fileName), Buffer.from(b64, 'base64'));
      const publicPath = `assets/images/${fileName}`;
      assetMap[asset.purpose] = publicPath;
      assetMap[asset.id] = publicPath;
      applyCanonicalAssetKeys(assetMap, asset, publicPath);
      generatedImages.push({ ...asset, file: publicPath });
    } catch (error) {
      console.warn(`AI image generation skipped for ${asset.id}: ${error.message}`);
      const fallback = await writeFallbackImage(site, imageDir, asset, index, error.message);
      assetMap[asset.purpose] = fallback.file;
      assetMap[asset.id] = fallback.file;
      applyCanonicalAssetKeys(assetMap, asset, fallback.file);
      generatedImages.push({ ...asset, file: fallback.file, fallback: true, error: error.message });
    }
  }
  return { imagePlan, assetMap, generatedImages, skipped: false };
}

async function createFallbackImages(site, imageDir, imagePlan, assetMap, generatedImages, reason) {
  for (let index = 0; index < imagePlan.length; index += 1) {
    const asset = imagePlan[index];
    const fallback = await writeFallbackImage(site, imageDir, asset, index, reason);
    assetMap[asset.purpose] = fallback.file;
    assetMap[asset.id] = fallback.file;
    applyCanonicalAssetKeys(assetMap, asset, fallback.file);
    generatedImages.push({ ...asset, file: fallback.file, fallback: true, error: reason });
  }
  return { imagePlan, assetMap, generatedImages, skipped: true };
}

function applyCanonicalAssetKeys(assetMap, asset, file) {
  const text = `${asset.id || ''} ${asset.purpose || ''}`.toLowerCase();
  const aliases = [
    [/hero|landing|above|home/, ['heroSeed']],
    [/texture|detail|material|atmosphere/, ['textureSeed']],
    [/service|subject|course|treatment|feature|offer/, ['serviceSeed']],
    [/about|story|founder|mission/, ['about story']],
    [/product|shop|catalog|arrival|lookbook|retail|shoe|sale|offer/, ['productSeed']],
    [/work|portfolio|case|gallery|proof|testimonial|result/, ['workSeed']]
  ];
  for (const [pattern, keys] of aliases) {
    if (pattern.test(text)) keys.forEach((key) => {
      if (!assetMap[key]) assetMap[key] = file;
    });
  }
}

async function writeFallbackImage(site, imageDir, asset, index, reason) {
  const fileName = `${String(index + 1).padStart(2, '0')}-${safeId(asset.id)}.svg`;
  await fs.writeFile(path.join(imageDir, fileName), fallbackSvg(site, asset, index, reason), 'utf8');
  return { file: `assets/images/${fileName}` };
}

function fallbackSvg(site, asset, index, reason) {
  const { width, height } = dimensionsFor(asset);
  const colors = site.tokens?.colors || {};
  const primary = colors.primary || '#111111';
  const secondary = colors.secondary || '#f4f4f4';
  const accent = colors.accent || '#777777';
  const ink = colors.ink || '#111111';
  const offset = (index % 5) * 34;
  const opacity = index % 2 ? '.16' : '.24';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${xml(asset.purpose)} visual asset">
  <defs>
    <linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${xml(secondary)}"/><stop offset="1" stop-color="${xml(primary)}"/></linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".85" numOctaves="2" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="table" tableValues="0 .08"/></feComponentTransfer></filter>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <rect width="${width}" height="${height}" filter="url(#grain)" opacity=".45"/>
  <path d="M${width * .08} ${height * .18} H${width * .82} V${height * .26} H${width * .08} Z" fill="${xml(ink)}" opacity="${opacity}"/>
  <path d="M${width * .12} ${height * .34} H${width * .58} V${height * .39} H${width * .12} Z" fill="${xml(accent)}" opacity=".42"/>
  <path d="M${width * .12} ${height * .46} H${width * .72} V${height * .5} H${width * .12} Z" fill="#fff" opacity=".28"/>
  <rect x="${width * .58 - offset}" y="${height * .55}" width="${width * .34}" height="${height * .28}" fill="#fff" opacity=".18"/>
  <rect x="${width * .1 + offset / 3}" y="${height * .58}" width="${width * .34}" height="${height * .22}" fill="${xml(ink)}" opacity=".14"/>
  <path d="M0 ${height * .88} C${width * .22} ${height * .7}, ${width * .5} ${height}, ${width} ${height * .72} V${height} H0 Z" fill="#fff" opacity=".18"/>
  <metadata>${xml(reason || 'Designed fallback image generated locally when AI image generation was unavailable.')}</metadata>
</svg>`;
}

function dimensionsFor(asset) {
  const size = String(asset.size || '');
  const match = size.match(/^(\d+)x(\d+)$/);
  if (match) return { width: Number(match[1]), height: Number(match[2]) };
  if (asset.aspect === 'portrait') return { width: 1024, height: 1536 };
  if (asset.aspect === 'square') return { width: 1024, height: 1024 };
  return { width: 1536, height: 1024 };
}

function xml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[char]));
}

function directionForPurpose(purpose, nature) {
  const p = String(purpose).toLowerCase();
  const natureCue = visualCueForNature(nature);
  if (/hero/.test(p)) return `Hero image for a ${nature} website: ${natureCue} strong first impression, layered foreground/background, credible environment, confident editorial crop.`;
  if (/texture|detail/.test(p)) return `Close detail image: ${natureCue} material texture, atmosphere, hands or tools when relevant, brand colour harmony, no fake text.`;
  if (/service|treatment|feature/.test(p)) return `Service experience image: ${natureCue} show the offer, environment, tools, product, or outcome with documentary realism, not staged stock-photo cliches.`;
  if (/about|story/.test(p)) return `Business story image: ${natureCue} workplace atmosphere, craft, owner/team presence when appropriate, credibility without fake signage.`;
  if (/product|shop|catalog|arrival|lookbook|commerce/.test(p)) return `Product-focused image: ${natureCue} clean commercial composition, realistic product detail, useful crop for e-commerce and homepage sections.`;
  if (/work|portfolio|case|gallery/.test(p)) return `Proof/case-study image: ${natureCue} polished project outcome, strong editorial crop, believable setting, enough negative space for layout.`;
  return `Website section image: ${natureCue} realistic premium photography and useful negative space for layout.`;
}

function visualCueForNature(nature) {
  const text = String(nature || '').toLowerCase();
  if (/commerce|shoe|retail/.test(text)) return 'product-led retail styling, tactile materials, clean shelves or studio surfaces, sale-ready but premium;';
  if (/hospitality|restaurant/.test(text)) return 'warm hospitality lighting, plated detail, room atmosphere, staff craft, reservation intent;';
  if (/care|physio|dental|clinic/.test(text)) return 'calm clinical environment, clean equipment, reassuring human presence, careful hands, trust-led detail;';
  if (/education|tutor|course/.test(text)) return 'focused learning environment, desks, notebooks, calm mentor/student energy, modern study detail;';
  if (/fitness|gym/.test(text)) return 'high-energy training environment, equipment detail, movement, grit, clean contrast;';
  if (/software|saas/.test(text)) return 'modern team workflow, devices without readable screens, analytical atmosphere, crisp office light;';
  if (/portfolio|creative/.test(text)) return 'studio process, materials, finished work, art-directed composition;';
  return 'credible local business environment, natural light, human-scale details, polished but not generic;';
}

function imageLimit() {
  const value = Number(process.env.AI_IMAGE_COUNT || 5);
  return Number.isFinite(value) ? Math.max(0, Math.min(8, value)) : 5;
}

function validSize(size) {
  return ['1024x1024', '1536x1024', '1024x1536', 'auto'].includes(String(size || ''));
}

function safeId(value) {
  return slugify(String(value || 'image'), { lower: true, strict: true }) || 'image';
}
