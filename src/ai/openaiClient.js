import OpenAI from 'openai';
import { analysisPrompt, contentPrompt, tokenPrompt, promptAnalysisSystem, contentGenerationSystem, designTokenSystem, eliteDesignerDirective, qualityWebsiteContract } from './prompts.js';
import { fallbackBrief, fallbackContent, fallbackTokens } from './fallback.js';
import { classifyNature } from './classifier.js';

const client = process.env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: Number(process.env.OPENAI_TIMEOUT_MS || 90000),
      maxRetries: Number(process.env.OPENAI_MAX_RETRIES ?? 2)
    })
  : null;

const TEXT_MODEL = process.env.OPENAI_TEXT_MODEL || 'gpt-4o';

// Reasoning models (gpt-5 family, o1/o3/o4) reject custom sampling params such as
// temperature/top_p and only accept the default. Detect them up front, and also
// remember at runtime if the API tells us a model refuses the parameter.
const FIXED_SAMPLING_MODEL = /^(gpt-5|o\d)/i;
let temperatureSupported = !FIXED_SAMPLING_MODEL.test(TEXT_MODEL);

function configuredTemperature() {
  const raw = process.env.OPENAI_TEXT_TEMPERATURE;
  if (raw === undefined || raw === '') return 0.65;
  const value = Number(raw);
  return Number.isFinite(value) ? value : 0.65;
}

function isUnsupportedParamError(error, param) {
  const message = String(error?.message || '');
  return error?.status === 400 && (error?.param === param || message.includes(`'${param}'`)) && /unsupported/i.test(message);
}

function parseJsonResponse(text) {
  const raw = String(text || '').trim();
  try {
    return JSON.parse(raw);
  } catch {
    // Some models wrap JSON in markdown fences or add a sentence around it.
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start !== -1 && end > start) return JSON.parse(raw.slice(start, end + 1));
    throw new Error('Model response was not valid JSON');
  }
}

async function jsonCompletion(system, prompt) {
  if (!client) return null;
  const request = {
    model: TEXT_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: prompt }
    ]
  };
  try {
    let response;
    try {
      response = await client.chat.completions.create(
        temperatureSupported ? { ...request, temperature: configuredTemperature() } : request
      );
    } catch (error) {
      if (!temperatureSupported || !isUnsupportedParamError(error, 'temperature')) throw error;
      temperatureSupported = false;
      console.info(`OpenAI model "${TEXT_MODEL}" only supports the default temperature; retrying without it.`);
      response = await client.chat.completions.create(request);
    }
    return parseJsonResponse(response.choices?.[0]?.message?.content);
  } catch (error) {
    console.warn(`OpenAI generation unavailable, using local fallback: ${error.message}`);
    return null;
  }
}

export async function analysePrompt(prompt) {
  const generated = await jsonCompletion(promptAnalysisSystem, analysisPrompt(prompt));
  return normalizeBrief(generated, prompt);
}

export async function generateContent(brief) {
  const safeBrief = normalizeBrief(brief, '');
  const generated = await jsonCompletion(contentGenerationSystem, contentPrompt(safeBrief));
  return normalizeContent(generated, safeBrief);
}

export async function generateTokens(brief) {
  const safeBrief = normalizeBrief(brief, '');
  const generated = await jsonCompletion(designTokenSystem, tokenPrompt(safeBrief));
  return normalizeTokens(generated, safeBrief);
}

export async function reviewPrompt(rawPrompt) {
  const prompt = String(rawPrompt || '').trim().slice(0, 4000);
  const generated = await jsonCompletion(
    `${eliteDesignerDirective}
${qualityWebsiteContract}

You clean, enhance, and strategically expand spoken website-builder prompts. Return strict JSON only. The review must make the future website feel fresh, intentional, conversion-led, and non-repetitive.`,
    `Clean this rough spoken prompt, correct obvious speech-recognition mistakes, preserve the user's intent, and produce a better website-generation brief.

Return JSON with:
{
  "correctedPrompt": "clear corrected version, no filler words",
  "enhancedPrompt": "stronger detailed prompt for generating a high quality website",
  "businessName": "business name if present",
  "domainSuggestion": "lowercase .co.uk domain suggestion if business name is present",
  "pages": ["Home", "Shop", "..."],
  "features": ["..."],
  "notes": ["..."],
  "questions": [
    {
      "id": "team_members",
      "label": "Team members",
      "question": "Who should appear on the team page?",
      "type": "textarea",
      "placeholder": "Name, role, email/phone/social link, short bio",
      "required": true,
      "appliesTo": ["Team", "Practitioners", "Trainers", "Speakers"]
    }
  ],
  "blueprint": {
    "businessType": "...",
    "projectNature": "commerce | hospitality | care | professional | fitness | portfolio | software | property | event | education | civic | service",
    "primaryGoal": "...",
    "audience": "...",
    "visualStrategy": "specific design direction based on the nature of this project, not a generic website style",
    "conversionPath": ["..."],
    "colourDirection": "...",
    "logoGuidance": "...",
    "pages": [
      {
        "title": "Home",
        "slug": "index",
        "purpose": "specific customer/business job this page must do",
        "sections": ["only sections this page genuinely needs"],
        "conversionTarget": "the action this page should encourage",
        "layoutArchetype": "heroSplit | heroEditorial | heroShowcase | catalogSidebar | catalogEditorial | catalogRows | campaignTicket | campaignStack | campaignComparison | lookbookLead | lookbookMasonry | lookbookStrip | guideTable | guideSteps | guideAccordion | storyTimeline | storyManifesto | storySplit | peopleEditorial | peopleDirectory | peopleSpotlight | journalFeature | journalIndex | journalSearch | contactSplit | contactPanel | contactStack | genericEditorial | genericChecklist | genericMosaic | genericBand"
      }
    ],
    "features": ["..."],
    "internalPrompt": "instructions for generating only the approved pages with distinct structures"
  },
  "generationMatrix": {
    "summary": "short strategic explanation of how this exact site should be generated",
    "audienceSegments": ["..."],
    "contentAngles": ["..."],
    "conversionMoments": ["..."],
    "pageMatrix": [
      {
        "page": "Home",
        "visitorQuestion": "What the visitor is trying to decide on this page",
        "contentNeeded": ["specific proof/copy/assets needed"],
        "visualMove": "layout, image, motion, or composition idea unique to this page",
        "primaryCta": "..."
      }
    ],
    "questionPlan": ["questions that must be asked before generation if relevant"]
  },
  "imagePlan": [
    {
      "id": "hero",
      "purpose": "heroSeed",
      "size": "1536x1024",
      "aspect": "landscape",
      "prompt": "production-ready image prompt, no text/logos/watermarks"
    }
  ]
}

Do not choose every standard page by habit. First classify the projectNature from the prompt. Then choose pages, sections, content priorities, and layoutArchetypes that fit that nature. A restaurant needs menu/reservation/hours logic. A shop needs product/category/sale logic. A clinic needs trust/treatment/booking logic. A SaaS product needs product/demo/pricing logic. A portfolio needs case-study/work logic. A fire station, emergency service, public safety, charity, council, or community organisation needs civic/public-service logic, not courses just because it offers training. Do not make different project types share the same homepage structure.

Apply this internal design process before returning JSON:
1. Identify the exact business, goal, target audience emotional state, primary conversion, tone, visual language, and 1-2 memorable creative twists.
2. Plan a logical reading flow: value proposition, CTA, trust signal, problem/solution, benefits/how it works, social proof, pricing if relevant, FAQ/final CTA.
3. Ensure every planned page has a distinct layout, section order, image rhythm, and conversion job.
4. Include concrete proof, plausible stats, testimonials, micro-details, and scroll/animation opportunities.
5. Choose fresh design decisions and never repeat a generic homepage formula.

Ask smart questions only when the answer will materially improve the site. If the prompt asks for team, practitioners, trainers, speakers, or staff, ask for names, roles, bios, and contact/social links. If it includes About, ask for a short origin story, values, or why the business exists. If it is commerce, ask for product categories, price range, shipping/returns, and best sellers. If it is hospitality, ask for menu highlights, opening hours, reservation method, and address. If it is SaaS, ask for core features, integrations, pricing model, and demo CTA. Keep questions concise and practical.

The generationMatrix must be specific enough that a designer/developer could build different pages from it. Each pageMatrix item must have a different visualMove. The imagePlan must include 4-6 realistic photographic assets for the requested site: heroSeed, textureSeed, serviceSeed, about story, and one project/product/work asset when useful. Image prompts must be brand-safe, realistic, no readable text, no fake logos, no watermark, no random animals, and aligned to the requested business.

Raw prompt:
${prompt}`
  );
  return normalizePromptReview(generated, prompt);
}

function normalizeBrief(brief, originalPrompt = '') {
  const fallback = fallbackBrief(originalPrompt || JSON.stringify(brief || {}));
  const source = brief && typeof brief === 'object' ? brief : {};
  const industry = stringValue(source.industry, fallback.industry);
  const services = normalizeStringArray(source.services, fallback.services, industry);
  const pages = normalizeStringArray(source.pages, fallback.pages);
  const teamMembers = Array.isArray(source.teamMembers) ? source.teamMembers : fallback.teamMembers;
  const colours = source.colourScheme || source.colorScheme || {};
  return {
    businessName: stringValue(source.businessName, fallback.businessName),
    industry,
    location: stringValue(source.location, fallback.location),
    colourScheme: {
      primary: validHex(colours.primary) ? colours.primary : fallback.colourScheme.primary,
      secondary: validHex(colours.secondary) ? colours.secondary : fallback.colourScheme.secondary,
      accent: validHex(colours.accent) ? colours.accent : fallback.colourScheme.accent
    },
    tone: stringValue(source.tone, fallback.tone),
    pages,
    services,
    teamMembers: teamMembers.map((member, index) => ({
      name: stringValue(member?.name, fallback.teamMembers[index % fallback.teamMembers.length].name),
      role: stringValue(member?.role, fallback.teamMembers[index % fallback.teamMembers.length].role),
      bio: stringValue(member?.bio, fallback.teamMembers[index % fallback.teamMembers.length].bio)
    })),
    tagline: stringValue(source.tagline, fallback.tagline),
    heroHeadline: stringValue(source.heroHeadline, fallback.heroHeadline),
    heroSubtext: stringValue(source.heroSubtext, fallback.heroSubtext),
    aboutText: stringValue(source.aboutText, fallback.aboutText),
    googleMapsLat: stringValue(source.googleMapsLat, fallback.googleMapsLat),
    googleMapsLng: stringValue(source.googleMapsLng, fallback.googleMapsLng),
    contactEmail: stringValue(source.contactEmail, fallback.contactEmail),
    contactPhone: stringValue(source.contactPhone, fallback.contactPhone),
    address: stringValue(source.address, fallback.address),
    learningGuidance: stringValue(source.learningGuidance, fallback.learningGuidance || ''),
    seoKeywords: normalizeSeoKeywords(source.seoKeywords, fallback.seoKeywords, {
      businessName: stringValue(source.businessName, fallback.businessName),
      industry,
      location: stringValue(source.location, fallback.location),
      services
    })
  };
}

function normalizeStringArray(value, fallback, industry = '') {
  if (Array.isArray(value)) {
    const arr = value.map((item) => typeof item === 'string' ? item : item?.title || item?.name || item?.service).filter(Boolean);
    if (arr.length) return arr;
  }
  if (typeof value === 'string') {
    const arr = value.split(/[,;\n]/).map((item) => item.trim()).filter(Boolean);
    if (arr.length) return arr;
  }
  if (value && typeof value === 'object') {
    const arr = Object.values(value).map((item) => typeof item === 'string' ? item : item?.title || item?.name).filter(Boolean);
    if (arr.length) return arr;
  }
  if (industry === 'Shoe Retail') return ['Leather trainers', 'Everyday flats', 'Smart loafers', 'Running shoes', 'Ankle boots', 'Occasion heels'];
  return Array.isArray(fallback) ? fallback : [];
}

function stringValue(value, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback;
}

function validHex(value) {
  return /^#[0-9a-f]{6}$/i.test(String(value || ''));
}

function normalizeContent(content, brief) {
  const fallback = fallbackContent(brief);
  const source = content || {};
  const services = Array.isArray(source.services) ? source.services : fallback.services;
  const teamMembers = Array.isArray(source.teamMembers) ? source.teamMembers : fallback.teamMembers;
  const blogPosts = Array.isArray(source.blogPosts) ? source.blogPosts : Array.isArray(source.posts) ? source.posts : fallback.blogPosts;
  const faqs = Array.isArray(source.faqs) ? source.faqs : Array.isArray(source.faq) ? source.faq : fallback.faqs;
  const testimonials = Array.isArray(source.testimonials) ? source.testimonials : fallback.testimonials;
  const stats = Array.isArray(source.stats) ? source.stats : fallback.stats;
  const differentiators = Array.isArray(source.differentiators) ? source.differentiators : fallback.differentiators;
  const processSteps = Array.isArray(source.processSteps) ? source.processSteps : Array.isArray(source.process) ? source.process : fallback.processSteps;
  const conversionPrompts = Array.isArray(source.conversionPrompts) ? source.conversionPrompts : fallback.conversionPrompts;

  return {
    hero: {
      headline: source.hero?.headline || source.heroHeadline || fallback.hero.headline,
      subtext: source.hero?.subtext || source.heroSubtext || fallback.hero.subtext,
      kicker: source.hero?.kicker || fallback.hero.kicker,
      primaryCta: source.hero?.primaryCta || fallback.hero.primaryCta,
      secondaryCta: source.hero?.secondaryCta || fallback.hero.secondaryCta
    },
    brandThesis: source.brandThesis || source.positioningStatement || fallback.brandThesis,
    aboutParagraphs: Array.isArray(source.aboutParagraphs) ? source.aboutParagraphs : Array.isArray(source.about) ? source.about : fallback.aboutParagraphs,
    differentiators: differentiators.map((item, index) => ({
      title: item.title || item.name || fallback.differentiators[index % fallback.differentiators.length].title,
      text: item.text || item.description || fallback.differentiators[index % fallback.differentiators.length].text
    })),
    services: services.map((service, index) => ({
      title: service.title || service.name || fallback.services[index % fallback.services.length].title,
      description: service.description || service.summary || fallback.services[index % fallback.services.length].description,
      bullets: Array.isArray(service.bullets) ? service.bullets : Array.isArray(service.points) ? service.points : fallback.services[index % fallback.services.length].bullets,
      outcome: service.outcome || fallback.services[index % fallback.services.length].outcome
    })),
    processSteps: processSteps.map((step, index) => ({
      title: step.title || step.name || fallback.processSteps[index % fallback.processSteps.length].title,
      text: step.text || step.description || fallback.processSteps[index % fallback.processSteps.length].text
    })),
    trustSignals: Array.isArray(source.trustSignals) ? source.trustSignals : fallback.trustSignals,
    localProof: source.localProof || fallback.localProof,
    researchBrief: normalizeResearchBrief(source.researchBrief, fallback.researchBrief, brief),
    layoutGuidance: normalizeLayoutGuidance(source.layoutGuidance, fallback.layoutGuidance, brief),
    conversionPrompts: conversionPrompts.map((prompt, index) => ({
      title: prompt.title || fallback.conversionPrompts[index % fallback.conversionPrompts.length].title,
      text: prompt.text || prompt.description || fallback.conversionPrompts[index % fallback.conversionPrompts.length].text,
      cta: prompt.cta || fallback.conversionPrompts[index % fallback.conversionPrompts.length].cta
    })),
    seoStrategy: normalizeSeoStrategy(source.seoStrategy, fallback.seoStrategy, brief),
    imageDirection: source.imageDirection || fallback.imageDirection,
    teamMembers: teamMembers.map((member, index) => ({
      name: member.name || fallback.teamMembers[index % fallback.teamMembers.length].name,
      role: member.role || member.title || fallback.teamMembers[index % fallback.teamMembers.length].role,
      bio: member.bio || member.biography || fallback.teamMembers[index % fallback.teamMembers.length].bio
    })),
    blogPosts: blogPosts.map((post, index) => ({
      title: post.title || fallback.blogPosts[index % fallback.blogPosts.length].title,
      intro: post.intro || post.excerpt || post.summary || fallback.blogPosts[index % fallback.blogPosts.length].intro,
      category: post.category || fallback.blogPosts[index % fallback.blogPosts.length].category
    })),
    faqs: faqs.map((faq, index) => ({
      question: faq.question || fallback.faqs[index % fallback.faqs.length].question,
      answer: faq.answer || fallback.faqs[index % fallback.faqs.length].answer
    })),
    testimonials: testimonials.map((testimonial, index) => ({
      name: testimonial.name || testimonial.client || fallback.testimonials[index % fallback.testimonials.length].name,
      quote: testimonial.quote || testimonial.text || fallback.testimonials[index % fallback.testimonials.length].quote,
      context: testimonial.context || fallback.testimonials[index % fallback.testimonials.length].context
    })),
    stats,
    microcopy: {
      contactHint: source.microcopy?.contactHint || fallback.microcopy.contactHint,
      newsletter: source.microcopy?.newsletter || fallback.microcopy.newsletter,
      bookingReassurance: source.microcopy?.bookingReassurance || fallback.microcopy.bookingReassurance
    },
    privacyPolicy: source.privacyPolicy || fallback.privacyPolicy
  };
}

function normalizeResearchBrief(value, fallback, brief = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const safeFallback = fallback || {};
  const industry = brief.industry || 'service';
  const location = brief.location || 'local area';
  return {
    marketContext: stringValue(source.marketContext, safeFallback.marketContext || `${industry} visitors usually compare trust, clarity, proof, location, and the ease of taking the next step before they enquire.`),
    visitorObjections: normalizeStringArray(source.visitorObjections, safeFallback.visitorObjections || ['Can I trust this business?', 'Is the offer right for my situation?', 'What happens after I make contact?']).slice(0, 6),
    proofRequired: normalizeStringArray(source.proofRequired, safeFallback.proofRequired || ['Clear services', 'Useful testimonials', 'Specific next steps', `${location} relevance`]).slice(0, 6),
    localSeoAngle: stringValue(source.localSeoAngle, safeFallback.localSeoAngle || `Connect ${industry} search intent with ${location} proof, service pages, FAQs, and practical contact routes.`),
    contentGaps: normalizeStringArray(source.contentGaps, safeFallback.contentGaps || ['Exact prices, opening hours, credentials, and named case studies should be supplied by the operator if they matter.']).slice(0, 6)
  };
}

function normalizeLayoutGuidance(value, fallback, brief = {}) {
  const source = value && typeof value === 'object' ? value : {};
  const safeFallback = fallback || {};
  return {
    header: stringValue(source.header, safeFallback.header || 'Use a visible sticky header with brand, concise navigation, and one primary action. Keep it usable on mobile.'),
    hero: stringValue(source.hero, safeFallback.hero || 'Use a balanced first viewport with a specific headline, trust signal, CTA, and relevant image or proof panel.'),
    sectionRhythm: stringValue(source.sectionRhythm, safeFallback.sectionRhythm || 'Alternate copy-led, proof-led, visual, FAQ, and CTA sections with consistent spacing and constrained text widths.'),
    mobile: stringValue(source.mobile, safeFallback.mobile || 'Stack grids cleanly, keep navigation visible, avoid overlapping text, and preserve comfortable tap targets.'),
    ctaPlacement: stringValue(source.ctaPlacement, safeFallback.ctaPlacement || `Keep the main ${brief.businessName || 'business'} enquiry action above the fold, after proof, and in the final CTA.`)
  };
}

function normalizeSeoKeywords(value, fallback, brief = {}) {
  const generated = fallbackSeoKeywordPlan(brief);
  const source = value || {};
  const fallbackPrimary = normalizeStringArray(fallback?.primary, []);
  const fallbackSecondary = normalizeStringArray(fallback?.secondary, []);
  const fallbackLocal = normalizeStringArray(fallback?.localModifiers, []);
  return {
    primary: normalizeStringArray(source.primary || source.primaryKeywords, fallbackPrimary.length ? fallbackPrimary : generated.primary).slice(0, 6),
    secondary: normalizeStringArray(source.secondary || source.secondaryKeywords, fallbackSecondary.length ? fallbackSecondary : generated.secondary).slice(0, 14),
    localModifiers: normalizeStringArray(source.localModifiers, fallbackLocal.length ? fallbackLocal : generated.localModifiers).slice(0, 8)
  };
}

function normalizeSeoStrategy(value, fallback, brief = {}) {
  const source = value || {};
  const seed = normalizeSeoKeywords({
    primary: source.primaryKeywords,
    secondary: source.secondaryKeywords,
    localModifiers: source.localModifiers
  }, brief.seoKeywords || fallback, brief);
  return {
    primaryKeywords: seed.primary,
    secondaryKeywords: seed.secondary,
    localModifiers: seed.localModifiers,
    pageKeywordMap: source.pageKeywordMap && typeof source.pageKeywordMap === 'object' ? source.pageKeywordMap : fallback?.pageKeywordMap || {
      Home: seed.primary.slice(0, 3),
      Services: seed.secondary.slice(0, 6),
      Contact: [seed.primary[0], `${brief.businessName} contact`].filter(Boolean)
    },
    densityTargets: source.densityTargets || fallback?.densityTargets || { primary: '0.8-1.4%', secondary: '0.2-0.7%' },
    naturalUsageNotes: stringValue(source.naturalUsageNotes, fallback?.naturalUsageNotes || 'Use keywords naturally in headings, service copy, FAQs, and local proof. Avoid exact-match repetition.')
  };
}

function fallbackSeoKeywordPlan(brief = {}) {
  const industry = String(brief.industry || 'service').toLowerCase();
  const location = brief.location || 'Manchester';
  const business = brief.businessName || 'local business';
  const services = Array.isArray(brief.services) ? brief.services : [];
  return {
    primary: [`${industry} in ${location}`, `${location} ${industry}`, `${business} ${industry}`],
    secondary: services.slice(0, 6).flatMap((service) => [`${service} ${location}`, `${service} near me`]),
    localModifiers: [location, `near ${location}`, `${location} city centre`, 'local', 'near me']
  };
}

function normalizeTokens(tokens, brief) {
  const fallback = fallbackTokens(brief);
  const source = tokens || {};
  const colors = source.colors || source.colours || source.palette || {};
  const fonts = source.fonts || source.typography || {};
  const radius = source.radius || source.borderRadius || source.radii || {};
  const shadow = source.shadow || source.shadows || {};
  const spacing = source.spacing || source.space || {};

  return {
    colors: {
      primary: colors.primary || brief.colourScheme?.primary || fallback.colors.primary,
      secondary: colors.secondary || brief.colourScheme?.secondary || fallback.colors.secondary,
      accent: colors.accent || fallback.colors.accent,
      ink: colors.ink || colors.text || fallback.colors.ink,
      surface: colors.surface || colors.background || fallback.colors.surface,
      muted: colors.muted || colors.subtleText || fallback.colors.muted,
      darkSurface: colors.darkSurface || colors.dark?.surface || fallback.colors.darkSurface,
      darkInk: colors.darkInk || colors.dark?.ink || colors.dark?.text || fallback.colors.darkInk
    },
    fonts: {
      display: fonts.display || fonts.heading || fonts.headings || fallback.fonts.display,
      body: fonts.body || fonts.text || fallback.fonts.body
    },
    radius: {
      sm: radius.sm || radius.small || fallback.radius.sm,
      md: radius.md || radius.medium || fallback.radius.md,
      lg: radius.lg || radius.large || fallback.radius.lg
    },
    shadow: {
      sm: shadow.sm || shadow.small || fallback.shadow.sm,
      md: shadow.md || shadow.medium || fallback.shadow.md
    },
    spacing: {
      xs: spacing.xs || fallback.spacing.xs,
      sm: spacing.sm || spacing.small || fallback.spacing.sm,
      md: spacing.md || spacing.medium || fallback.spacing.md,
      lg: spacing.lg || spacing.large || fallback.spacing.lg,
      xl: spacing.xl || spacing.extraLarge || fallback.spacing.xl
    }
  };
}

function normalizePromptReview(review, rawPrompt) {
  const fallback = fallbackPromptReview(rawPrompt);
  const source = review || {};
  return {
    correctedPrompt: source.correctedPrompt || source.corrected || fallback.correctedPrompt,
    enhancedPrompt: source.enhancedPrompt || source.enhanced || fallback.enhancedPrompt,
    businessName: source.businessName || fallback.businessName,
    domainSuggestion: source.domainSuggestion || fallback.domainSuggestion,
    pages: Array.isArray(source.pages) && source.pages.length ? source.pages : fallback.pages,
    features: Array.isArray(source.features) && source.features.length ? source.features : fallback.features,
    notes: Array.isArray(source.notes) ? source.notes : fallback.notes,
    questions: normalizeQuestions(source.questions, fallback.questions),
    blueprint: normalizeBlueprint(source.blueprint, fallback.blueprint),
    generationMatrix: normalizeGenerationMatrix(source.generationMatrix, fallback.generationMatrix),
    imagePlan: normalizeImagePlan(source.imagePlan, fallback.imagePlan)
  };
}

function normalizeGenerationMatrix(matrix, fallback = {}) {
  const source = matrix && typeof matrix === 'object' ? matrix : fallback || {};
  return {
    summary: source.summary || fallback.summary || 'Generate a page-specific website with distinct content, layout, imagery, and conversion logic.',
    audienceSegments: normalizeStringArray(source.audienceSegments, fallback.audienceSegments || []),
    contentAngles: normalizeStringArray(source.contentAngles, fallback.contentAngles || []),
    conversionMoments: normalizeStringArray(source.conversionMoments, fallback.conversionMoments || []),
    questionPlan: normalizeStringArray(source.questionPlan, fallback.questionPlan || []),
    pageMatrix: Array.isArray(source.pageMatrix) && source.pageMatrix.length ? source.pageMatrix.slice(0, 12).map((item) => ({
      page: item.page || item.title || 'Page',
      visitorQuestion: item.visitorQuestion || item.question || 'What should the visitor understand here?',
      contentNeeded: normalizeStringArray(item.contentNeeded, []),
      visualMove: item.visualMove || item.layoutIdea || 'Use a distinct layout and image treatment for this page.',
      primaryCta: item.primaryCta || item.cta || 'Contact'
    })) : (fallback.pageMatrix || [])
  };
}

function normalizeImagePlan(plan, fallback = []) {
  const source = Array.isArray(plan) && plan.length ? plan : fallback;
  return source.slice(0, 6).map((item, index) => ({
    id: String(item.id || item.name || `image_${index + 1}`).replace(/[^a-z0-9_ -]/gi, '').trim() || `image_${index + 1}`,
    purpose: item.purpose || ['heroSeed', 'textureSeed', 'serviceSeed', 'about story', 'productSeed', 'workSeed'][index] || 'heroSeed',
    size: ['1024x1024', '1536x1024', '1024x1536', 'auto'].includes(item.size) ? item.size : (index === 3 ? '1024x1536' : '1536x1024'),
    aspect: item.aspect || (index === 3 ? 'portrait' : 'landscape'),
    prompt: String(item.prompt || '').slice(0, 2200)
  })).filter((item) => item.prompt);
}

function normalizeQuestions(questions, fallback = []) {
  const source = Array.isArray(questions) && questions.length ? questions : fallback;
  return source.slice(0, 10).map((question, index) => ({
    id: String(question.id || `question_${index + 1}`).replace(/[^a-z0-9_]/gi, '_').toLowerCase(),
    label: question.label || question.title || `Question ${index + 1}`,
    question: question.question || question.prompt || question.label || 'Add more detail',
    type: ['textarea', 'text', 'select'].includes(question.type) ? question.type : 'textarea',
    placeholder: question.placeholder || '',
    required: Boolean(question.required),
    options: Array.isArray(question.options) ? question.options : [],
    appliesTo: Array.isArray(question.appliesTo) ? question.appliesTo : []
  }));
}

function fallbackPromptReview(rawPrompt) {
  const cleaned = cleanSpokenPrompt(rawPrompt);
  const businessName = extractName(cleaned);
  const lower = cleaned.toLowerCase();
  const isShoe = lower.includes('shoe') || lower.includes('footwear') || lower.includes('trainer') || lower.includes('sneaker');
  const nature = inferReviewNature(lower, isShoe);
  const business = businessName || (isShoe ? 'Celine Shoes' : 'the business');
  const pages = pagesForNature(nature, lower);
  const features = featuresForNature(nature);
  const enhancedPrompt = isShoe
    ? `Build a clean, premium e-commerce style website for ${business}, a shoe sale business. The site should feel modern, trustworthy, and easy to shop, with a black-and-white foundation, strong product imagery, clear sale messaging, and conversion-focused copy that attracts more customers. Include pages for Home, Shop, New Arrivals, Sale, About, Size Guide, Blog, Contact, and Privacy Policy. Include featured collections, sale product highlights, customer reviews, newsletter signup, contact form, SEO settings, and an admin CMS for editing products, pages, blog posts, enquiries, and site settings.`
    : `Build a clean, premium website for ${business}. The site should feel trustworthy, polished, easy to understand, and designed to attract more customers. Include the main website pages, conversion-focused copy, SEO settings, contact form, Google Maps, and an admin CMS.`;
  const correctedPrompt = isShoe
    ? `I need a clean website for my shoe sale business, ${business}. The website should look professional, be easy to browse, and help attract more customers.`
    : cleaned;
  const blueprint = buildFallbackBlueprint({ businessName, business, isShoe, nature, pages, features });
  return {
    correctedPrompt,
    enhancedPrompt,
    businessName,
    domainSuggestion: businessName ? `${domainSlugForReview(businessName)}.co.uk` : '',
    pages,
    features,
    questions: questionsForReviewNature(nature, pages),
    notes: ['Corrected filler words and speech-recognition mistakes.', 'Expanded the brief for stronger website generation.', 'Review before approving.']
    ,
    blueprint,
    generationMatrix: buildFallbackGenerationMatrix(blueprint, nature, isShoe),
    imagePlan: buildFallbackImagePlan({ business, nature, isShoe, blueprint })
  };
}

function buildFallbackGenerationMatrix(blueprint, nature, isShoe) {
  return {
    summary: `${blueprint.businessType} site generated from a page-by-page matrix so every page has its own content job, layout move, image role, and conversion target.`,
    audienceSegments: [
      blueprint.audience,
      isShoe ? 'Returning shoppers looking for new sale drops' : 'Visitors comparing credibility before they enquire',
      isShoe ? 'Customers unsure about size, fit, or delivery' : 'Warm leads who need a low-friction contact route'
    ],
    contentAngles: [
      blueprint.primaryGoal,
      blueprint.visualStrategy,
      'Use specific proof, practical details, and direct language instead of generic brand filler.'
    ],
    conversionMoments: blueprint.conversionPath || [],
    questionPlan: questionsForReviewNature(nature, blueprint.pages.map((page) => page.title)).map((question) => question.question),
    pageMatrix: blueprint.pages.map((page, index) => ({
      page: page.title,
      visitorQuestion: visitorQuestionForPage(page.title, nature, isShoe),
      contentNeeded: page.sections || [],
      visualMove: `${page.layoutArchetype || 'auto'} layout with ${index % 2 ? 'editorial contrast and proof-led copy' : 'strong image rhythm and clear scanning hierarchy'}`,
      primaryCta: page.conversionTarget || 'Contact'
    }))
  };
}

function buildFallbackImagePlan({ business, nature, isShoe, blueprint }) {
  const base = [
    `${business}, ${blueprint.businessType}.`,
    `Audience: ${blueprint.audience}.`,
    `Visual strategy: ${blueprint.visualStrategy}.`,
    'Realistic premium website photography, commercial quality, no text, no logos, no watermarks, no random animals.'
  ].join(' ');
  const productDirection = isShoe || nature === 'commerce' ? 'premium footwear product photography, clean sale retail styling, believable e-commerce composition' : 'visual proof of the business offer, environment, craft, or outcome';
  return [
    { id: 'hero', purpose: 'heroSeed', size: '1536x1024', aspect: 'landscape', prompt: `${base} Hero asset with confident first-viewport composition and useful negative space.` },
    { id: 'detail', purpose: 'textureSeed', size: '1024x1024', aspect: 'square', prompt: `${base} Close detail texture or atmosphere image for section contrast.` },
    { id: 'service', purpose: 'serviceSeed', size: '1536x1024', aspect: 'landscape', prompt: `${base} Service or product experience image showing the offer clearly without looking staged.` },
    { id: 'about', purpose: 'about story', size: '1024x1536', aspect: 'portrait', prompt: `${base} About page story image with workplace atmosphere, trust, and craft.` },
    { id: 'offer', purpose: 'productSeed', size: '1024x1024', aspect: 'square', prompt: `${base} ${productDirection}.` },
    { id: 'work', purpose: 'workSeed', size: '1536x1024', aspect: 'landscape', prompt: `${base} Case-study or proof image that supports credibility and looks specific to this business type.` }
  ];
}

function visitorQuestionForPage(title, nature, isShoe) {
  const lower = String(title || '').toLowerCase();
  if (lower.includes('home')) return isShoe ? 'Is this shop relevant, trustworthy, and worth browsing now?' : 'Can this business solve my problem and should I keep reading?';
  if (lower.includes('shop') || lower.includes('sale') || lower.includes('arrival')) return 'Can I quickly find the right product, price, and next step?';
  if (lower.includes('service') || lower.includes('treatment')) return 'Which option matches what I need and what happens next?';
  if (lower.includes('team') || lower.includes('practitioner') || lower.includes('trainer')) return 'Who will I be dealing with and can I trust them?';
  if (lower.includes('about')) return 'Why does this business exist and what makes it credible?';
  if (lower.includes('pricing')) return 'Which plan or package fits my situation?';
  if (lower.includes('contact')) return 'What is the easiest way to ask, book, visit, or buy?';
  if (lower.includes('portfolio') || lower.includes('work') || lower.includes('case')) return 'Have they done work that feels relevant and high quality?';
  return nature === 'hospitality' ? 'Does this feel like the right place to visit?' : 'What do I need to know before taking action?';
}

function questionsForReviewNature(nature, pages) {
  const pageText = pages.join(' ').toLowerCase();
  const questions = [
    { id: 'about_story', label: 'About us', question: 'Tell us a little about the business story, values, or why it exists.', type: 'textarea', placeholder: 'Founded by..., known for..., values...', required: pageText.includes('about'), appliesTo: ['About'] },
    { id: 'primary_goal', label: 'Main goal', question: 'What is the most important action visitors should take?', type: 'text', placeholder: 'Buy, book, call, request demo, enquire...', required: true, appliesTo: ['Home'] }
  ];
  if (/team|practitioner|trainer|speaker|staff/.test(pageText)) {
    questions.push({ id: 'team_members', label: 'People', question: 'Who should appear on the people/team page?', type: 'textarea', placeholder: 'Name | role | email/phone/social | short bio', required: true, appliesTo: ['Team', 'Practitioners', 'Trainers', 'Speakers'] });
  }
  if (nature === 'commerce') {
    questions.push({ id: 'products', label: 'Products', question: 'What product categories, best sellers, prices, or sale details should be included?', type: 'textarea', placeholder: 'Trainers £39-£89, boots, flats, free delivery over...', required: false, appliesTo: ['Shop', 'Sale'] });
  }
  if (nature === 'hospitality') {
    questions.push({ id: 'menu_hours', label: 'Menu and hours', question: 'Add menu highlights, opening hours, reservation method, and address.', type: 'textarea', placeholder: 'Small plates, brunch, Mon-Sat 12-10, book by phone...', required: true, appliesTo: ['Menu', 'Reservations'] });
  }
  if (nature === 'software') {
    questions.push({ id: 'software_details', label: 'Product details', question: 'What are the core features, integrations, pricing model, and demo CTA?', type: 'textarea', placeholder: 'AI routing, Slack, HubSpot, from £49/mo, book demo...', required: true, appliesTo: ['Product', 'Pricing'] });
  }
  if (nature === 'care') {
    questions.push({ id: 'care_details', label: 'Care details', question: 'Which treatments, practitioner names, patient reassurance, or booking details matter?', type: 'textarea', placeholder: 'Nervous patients, whitening, emergency care, Dr...', required: false, appliesTo: ['Treatments', 'Practitioners'] });
  }
  if (nature === 'civic') {
    questions.push({ id: 'civic_details', label: 'Civic details', question: 'Which emergency services, community programmes, safety advice, opening details, or reporting routes matter?', type: 'textarea', placeholder: 'Fire safety checks, incident reporting, school visits, volunteer route...', required: false, appliesTo: ['Services', 'Safety Advice', 'Contact'] });
  }
  return questions;
}

function inferReviewNature(lower, isShoe) {
  if (isShoe) return 'commerce';
  const nature = classifyNature(lower);
  return nature === 'trades' ? 'service' : nature;
}

function pagesForNature(nature, promptText = '') {
  const pages = {
    commerce: ['Home', 'Shop', 'New Arrivals', 'Sale', 'About', 'Size Guide', 'Blog', 'Contact', 'Privacy Policy'],
    hospitality: ['Home', 'Menu', 'Reservations', 'Private Dining', 'Gallery', 'Contact', 'Privacy Policy'],
    care: ['Home', 'Treatments', 'Practitioners', 'Patient Information', 'Reviews', 'Contact', 'Privacy Policy'],
    professional: ['Home', 'Services', 'Industries', 'Case Studies', 'About', 'Contact', 'Privacy Policy'],
    fitness: ['Home', 'Classes', 'Memberships', 'Trainers', 'Timetable', 'Contact', 'Privacy Policy'],
    portfolio: ['Home', 'Work', 'Case Studies', 'About', 'Services', 'Contact', 'Privacy Policy'],
    software: ['Home', 'Product', 'Use Cases', 'Pricing', 'Resources', 'Contact', 'Privacy Policy'],
    property: ['Home', 'Properties', 'Valuation', 'Landlords', 'Area Guides', 'Contact', 'Privacy Policy'],
    event: ['Home', 'Schedule', 'Speakers', 'Tickets', 'Venue', 'Contact', 'Privacy Policy'],
    education: ['Home', 'Courses', 'Admissions', 'Tutors', 'Results', 'Contact', 'Privacy Policy'],
    civic: ['Home', 'Emergency Help', 'Safety Advice', 'Community Programmes', 'Volunteer', 'Contact', 'Privacy Policy'],
    service: ['Home', 'About', 'Services', 'Team', 'Blog', 'Contact', 'Privacy Policy']
  };
  const selected = [...(pages[nature] || pages.service)];
  const additions = [
    [/team|staff|people|member/, 'Team'],
    [/practitioner|doctor|dentist|therapist/, 'Practitioners'],
    [/trainer|coach/, 'Trainers'],
    [/speaker/, 'Speakers'],
    [/gallery|photos|images/, 'Gallery'],
    [/faq|questions/, 'FAQ'],
    [/pricing|price|plans/, 'Pricing'],
    [/blog|articles|news/, 'Blog']
  ];
  for (const [pattern, page] of additions) {
    if (pattern.test(promptText) && !selected.some((existing) => existing.toLowerCase() === page.toLowerCase())) {
      const contactIndex = selected.findIndex((existing) => existing.toLowerCase().includes('contact'));
      selected.splice(contactIndex >= 0 ? contactIndex : selected.length, 0, page);
    }
  }
  return selected;
}

function featuresForNature(nature) {
  const features = {
    commerce: ['Product catalogue', 'Sale badges', 'Featured collections', 'Customer reviews', 'Newsletter signup', 'Contact form', 'SEO metadata', 'Admin CMS'],
    hospitality: ['Menu sections', 'Reservation CTA', 'Opening hours', 'Gallery', 'Google Maps', 'Reviews', 'Admin CMS'],
    care: ['Treatment pages', 'Practitioner profiles', 'Booking CTA', 'Patient FAQs', 'Testimonials', 'Google Maps', 'Admin CMS'],
    professional: ['Service pages', 'Case study structure', 'Lead capture', 'Credentials', 'Insights', 'SEO metadata', 'Admin CMS'],
    fitness: ['Class timetable', 'Membership pricing', 'Trainer profiles', 'Lead form', 'Testimonials', 'Admin CMS'],
    portfolio: ['Project gallery', 'Case studies', 'Services', 'Enquiry form', 'SEO metadata', 'Admin CMS'],
    software: ['Product sections', 'Use cases', 'Pricing placeholder', 'Demo CTA', 'Resource pages', 'Admin CMS'],
    property: ['Property listings', 'Search panel', 'Valuation CTA', 'Area guides', 'Google Maps', 'Admin CMS'],
    event: ['Schedule', 'Speakers', 'Ticket CTA', 'Venue map', 'FAQ', 'Admin CMS'],
    education: ['Course listings', 'Admissions CTA', 'Tutor profiles', 'Results proof', 'FAQ', 'Admin CMS'],
    civic: ['Emergency information', 'Safety advice hub', 'Community programme pages', 'Volunteer enquiry', 'Contact form', 'Google Maps', 'Admin CMS']
  };
  return features[nature] || ['Service sections', 'Testimonials', 'FAQ', 'Contact form', 'Google Maps', 'SEO metadata', 'Admin CMS'];
}

function normalizeBlueprint(blueprint, fallback) {
  const source = blueprint || {};
  const pages = Array.isArray(source.pages) && source.pages.length ? source.pages : fallback.pages;
  return {
    businessType: source.businessType || fallback.businessType,
    projectNature: source.projectNature || fallback.projectNature || '',
    primaryGoal: source.primaryGoal || fallback.primaryGoal,
    audience: source.audience || fallback.audience,
    visualStrategy: source.visualStrategy || fallback.visualStrategy || '',
    conversionPath: Array.isArray(source.conversionPath) ? source.conversionPath : fallback.conversionPath,
    colourDirection: source.colourDirection || fallback.colourDirection,
    logoGuidance: source.logoGuidance || fallback.logoGuidance,
    pages: pages.map((page, index) => ({
      title: page.title || page.name || fallback.pages[index % fallback.pages.length].title,
      slug: page.slug || slugForBlueprint(page.title || page.name || fallback.pages[index % fallback.pages.length].title),
      purpose: page.purpose || fallback.pages[index % fallback.pages.length].purpose,
      sections: Array.isArray(page.sections) ? page.sections : fallback.pages[index % fallback.pages.length].sections,
      conversionTarget: page.conversionTarget || fallback.pages[index % fallback.pages.length].conversionTarget,
      layoutArchetype: page.layoutArchetype || page.layout || fallback.pages[index % fallback.pages.length].layoutArchetype || ''
    })),
    features: Array.isArray(source.features) ? source.features : fallback.features,
    internalPrompt: source.internalPrompt || fallback.internalPrompt
  };
}

function buildFallbackBlueprint({ businessName, business, isShoe, nature = 'service', pages, features }) {
  const businessType = businessTypeForNature(nature, isShoe);
  const primaryGoal = goalForNature(nature, isShoe);
  const pageObjects = pages.map((title) => {
    const lower = title.toLowerCase();
    const retailSections = {
      home: ['Hero offer', 'Featured sale collections', 'Best sellers', 'Trust strip', 'Customer reviews', 'Newsletter CTA'],
      shop: ['Product filters', 'Sale product grid', 'Featured categories', 'Delivery and returns note'],
      'new arrivals': ['Latest products', 'Editorial product highlights', 'Style notes'],
      sale: ['Discount hero', 'Sale categories', 'Urgency banner', 'Product grid'],
      about: ['Brand story', 'Why buy from us', 'Quality promise'],
      'size guide': ['Measurement guide', 'Fit notes', 'FAQ'],
      blog: ['Buying guides', 'Shoe care tips', 'Trend articles'],
      contact: ['Contact form', 'Store or service details', 'FAQ', 'Social links'],
      'privacy policy': ['Privacy policy text']
    };
    const serviceSections = {
      home: ['Hero', 'Proof strip', 'Services overview', 'Process', 'Testimonials', 'CTA'],
      about: ['Story', 'Values', 'Local proof', 'Team preview'],
      services: ['Service detail cards', 'Process', 'FAQ'],
      team: ['Team profiles', 'Credentials', 'Join CTA'],
      blog: ['Featured article', 'Article list', 'Categories'],
      contact: ['Contact form', 'Map', 'Business hours'],
      'privacy policy': ['Privacy policy text']
    };
    const map = isShoe || nature === 'commerce' ? retailSections : serviceSections;
    return {
      title,
      slug: slugForBlueprint(title),
      purpose: isShoe ? retailPurpose(lower, business) : servicePurpose(lower, business),
      sections: map[lower] || ['Hero', 'Content', 'CTA'],
      conversionTarget: isShoe || nature === 'commerce' ? (['shop', 'sale', 'new arrivals'].includes(lower) ? 'Product view or purchase enquiry' : 'Shop sale products') : conversionForNature(lower, nature),
      layoutArchetype: fallbackLayoutArchetype(lower, isShoe, nature)
    };
  });
  return {
    businessType,
    projectNature: nature,
    primaryGoal,
    audience: audienceForNature(nature, isShoe),
    visualStrategy: visualStrategyForNature(nature, isShoe),
    conversionPath: conversionPathForNature(nature, isShoe),
    colourDirection: 'Use logo-derived colours when supplied. Otherwise use a restrained black and white base with one accent only.',
    logoGuidance: 'Place the logo in the header, keep clear space around it, and avoid forcing logo colours into every section.',
    pages: pageObjects,
    features,
    internalPrompt: `Generate a ${businessType} website for ${business}. Only create the approved pages. Each page must have a distinct purpose, layout, and conversion target. Avoid making pages look identical. Use a careful colour system based on logo colours if supplied, otherwise use a restrained black and white base with one accent.`
  };
}

function fallbackLayoutArchetype(lower, isShoe) {
  if (lower === 'home') return isShoe ? 'heroShowcase' : 'heroEditorial';
  if (lower.includes('emergency')) return 'genericChecklist';
  if (lower.includes('safety')) return 'genericMosaic';
  if (lower.includes('community') || lower.includes('volunteer')) return 'genericEditorial';
  if (lower === 'shop') return 'catalogRows';
  if (lower === 'sale') return 'campaignComparison';
  if (lower === 'new arrivals') return 'lookbookLead';
  if (lower === 'size guide') return 'guideSteps';
  if (lower === 'about') return 'storyManifesto';
  if (lower === 'team') return 'peopleSpotlight';
  if (lower === 'blog') return 'journalIndex';
  if (lower === 'contact') return 'contactPanel';
  return 'genericMosaic';
}

function businessTypeForNature(nature, isShoe) {
  if (isShoe) return 'shoe retail / sale e-commerce';
  return {
    commerce: 'retail / e-commerce business',
    hospitality: 'restaurant / hospitality business',
    care: 'health, clinic, or wellness business',
    professional: 'professional services business',
    fitness: 'fitness or membership business',
    portfolio: 'creative portfolio or studio',
    software: 'software / SaaS product',
    property: 'property or real estate business',
    event: 'event, venue, or ticketed experience',
    education: 'education or training provider',
    civic: 'civic, emergency, or public safety service',
    service: 'local service business'
  }[nature] || 'local service business';
}

function goalForNature(nature, isShoe) {
  if (isShoe) return 'Sell sale shoes and convert visitors into product enquiries or purchases.';
  return {
    commerce: 'Help visitors browse products, trust the offer, and enquire or purchase.',
    hospitality: 'Turn hungry visitors into bookings, calls, or visits.',
    care: 'Build trust and convert cautious visitors into appointments or enquiries.',
    professional: 'Explain expertise, prove credibility, and generate qualified consultations.',
    fitness: 'Sell memberships, classes, or trial sessions.',
    portfolio: 'Show distinctive work and generate project enquiries.',
    software: 'Explain the product, show use cases, and generate demo requests.',
    property: 'Help visitors browse listings and request valuations or viewings.',
    event: 'Sell tickets and make schedule, speakers, and venue information clear.',
    education: 'Promote courses and convert visitors into enquiries or applications.',
    civic: 'Help the public find emergency guidance, safety services, community programmes, and the right contact route.'
  }[nature] || 'Attract qualified enquiries and make the business feel trustworthy.';
}

function audienceForNature(nature, isShoe) {
  if (isShoe) return 'Style-conscious value shoppers looking for clean, trustworthy shoe deals.';
  return {
    hospitality: 'Local diners and visitors choosing where to book or eat.',
    care: 'People comparing providers and looking for reassurance before booking.',
    professional: 'Decision-makers looking for credible expertise and a clear next step.',
    fitness: 'People comparing fitness options, class styles, pricing, and motivation.',
    portfolio: 'Potential clients evaluating taste, craft, and project fit.',
    software: 'Operators and teams looking for a clearer way to solve a workflow problem.',
    property: 'Buyers, renters, landlords, or sellers comparing property options.',
    event: 'Attendees deciding whether the event is worth their time and ticket.',
    education: 'Students, parents, or professionals comparing learning outcomes.',
    civic: 'Residents, local families, organisations, and volunteers looking for safety information or help.'
  }[nature] || 'Local customers looking for a trustworthy provider.';
}

function visualStrategyForNature(nature, isShoe) {
  if (isShoe) return 'Use product-first commerce composition with product walls, sale edits, category browsing, clear pricing, and strong product photography.';
  return {
    hospitality: 'Use appetite-led imagery, menu-board rhythm, reservation strips, opening hours, and location-forward sections.',
    care: 'Use calm trust-led composition, practitioner proof, treatment pathways, FAQs, and booking reassurance.',
    professional: 'Use editorial authority, sober proof ledgers, practice-area matrices, credentials, and consultation CTAs.',
    fitness: 'Use energetic high-contrast sections, class cards, membership CTAs, stats, and trainer proof.',
    portfolio: 'Use large project imagery, asymmetrical case-study walls, sparse copy, and strong visual hierarchy.',
    software: 'Use product-dashboard compositions, feature flows, use-case cards, demo CTAs, and pricing logic.',
    property: 'Use listing-led layouts, search panels, valuation CTAs, area guides, and map/property imagery.',
    event: 'Use poster-like hero sections, schedule boards, speaker/ticket CTAs, and venue information.',
    education: 'Use course grids, learning paths, tutor proof, admissions CTAs, and outcomes.',
    civic: 'Use public-service composition: urgent-action panels, safety guidance, community proof, incident routes, volunteer prompts, and calm authority.'
  }[nature] || 'Use trust-led service composition with proof, process, service clarity, and a low-friction enquiry path.';
}

function conversionPathForNature(nature, isShoe) {
  if (isShoe) return ['Land on sale offer', 'Browse category', 'Trust product quality', 'Enquire or purchase'];
  return {
    hospitality: ['Feel the atmosphere', 'Scan the menu', 'Check practical details', 'Reserve or visit'],
    care: ['Recognise the problem', 'Trust the provider', 'Understand the treatment route', 'Book or enquire'],
    professional: ['Understand expertise', 'See proof', 'Find relevant service', 'Request consultation'],
    fitness: ['See the energy', 'Compare programmes', 'Check timetable or pricing', 'Join or trial'],
    portfolio: ['See quality of work', 'Explore case studies', 'Understand services', 'Start a project'],
    software: ['Understand product promise', 'See workflows', 'Compare use cases', 'Request demo'],
    property: ['Search by need', 'Compare listings', 'Trust local expertise', 'Book viewing or valuation'],
    event: ['Understand the event', 'Check schedule', 'Trust venue/speakers', 'Buy ticket'],
    education: ['Understand outcomes', 'Compare courses', 'Trust tutors/results', 'Apply or enquire'],
    civic: ['Identify urgency', 'Find the right safety route', 'Trust public-service information', 'Contact, report, or volunteer']
  }[nature] || ['Understand offer', 'See proof', 'Choose service', 'Send enquiry'];
}

function conversionForNature(lower, nature) {
  if (lower.includes('pricing')) return 'Compare plans';
  if (lower.includes('ticket')) return 'Buy ticket';
  if (lower.includes('menu') || lower.includes('reservation')) return 'Reserve or visit';
  if (lower.includes('course') || lower.includes('admission')) return 'Apply or enquire';
  if (lower.includes('property') || lower.includes('valuation')) return 'Book viewing or valuation';
  if (lower.includes('contact')) return 'Contact enquiry';
  return {
    hospitality: 'Reservation or visit',
    care: 'Appointment enquiry',
    professional: 'Consultation enquiry',
    fitness: 'Membership or trial',
    portfolio: 'Project enquiry',
    software: 'Demo request',
    property: 'Viewing or valuation',
    event: 'Ticket purchase',
    education: 'Course enquiry',
    civic: 'Safety enquiry or public contact'
  }[nature] || 'Contact enquiry';
}

function retailPurpose(lower, business) {
  if (lower === 'home') return `Introduce ${business}, highlight the sale proposition, and move visitors into shopping.`;
  if (lower === 'shop') return 'Let customers browse products and categories clearly.';
  if (lower === 'sale') return 'Make discounted products feel desirable, urgent, and easy to explore.';
  if (lower === 'new arrivals') return 'Show fresh stock and give returning visitors a reason to browse.';
  if (lower === 'size guide') return 'Reduce purchase hesitation with fit and sizing help.';
  if (lower === 'about') return 'Build trust in the shop, quality, and customer service.';
  if (lower === 'blog') return 'Attract organic traffic with buying guides and style advice.';
  if (lower === 'contact') return 'Make enquiries and support easy.';
  return 'Support the customer journey.';
}

function servicePurpose(lower, business) {
  if (lower === 'home') return `Introduce ${business}, establish trust, and guide visitors to enquiry.`;
  if (lower === 'services') return 'Explain offers clearly and remove buying friction.';
  if (lower === 'about') return 'Tell the story and build credibility.';
  if (lower === 'team') return 'Humanise the business with people and expertise.';
  if (lower === 'blog') return 'Build SEO and trust through useful content.';
  if (lower === 'contact') return 'Convert interest into enquiries.';
  return 'Support the customer journey.';
}

function slugForBlueprint(title) {
  const slug = String(title || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  if (slug === 'home') return 'index';
  return slug || 'page';
}

function cleanSpokenPrompt(rawPrompt) {
  return String(rawPrompt || '')
    .replace(/\buh+\b/gi, '')
    .replace(/\bum+\b/gi, '')
    .replace(/\bpoor customers\s*,?\s*more customers i mean\b/gi, 'more customers')
    .replace(/\bclean\s+Agreed\b/gi, 'clean')
    .replace(/\bAgreed\b/gi, 'clean')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.!?])/g, '$1')
    .trim()
    .replace(/^[a-z]/, (m) => m.toUpperCase());
}

function extractName(prompt) {
  const patterns = [
    /\bname of the business is\s+([A-Za-z0-9&' -]{2,70}?)(?=\.|,|\s+the website|\s+website|\s+and|\s+must|$)/i,
    /\bbusiness is\s+([A-Za-z0-9&' -]{2,70}?)(?=\.|,|\s+the website|\s+website|\s+and|\s+must|$)/i,
    /\bcalled\s+([A-Za-z0-9&' -]{2,70}?)(?=\.|,|\s+with|\s+and|\s+must|$)/i
  ];
  for (const pattern of patterns) {
    const match = String(prompt || '').match(pattern);
    if (match?.[1]) return match[1].trim().replace(/[.,;:!?]+$/, '');
  }
  return '';
}

function domainSlugForReview(name) {
  return String(name || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9\s-]/g, '').split(/\s+/).filter(Boolean).filter((word) => !['the', 'and', 'ltd', 'limited', 'uk'].includes(word)).join('').slice(0, 48) || 'brand';
}

export function isAiTextEnabled() {
  return Boolean(client);
}

const SITE_COPY_NATURES = ['care', 'hospitality', 'commerce', 'professional', 'fitness', 'portfolio', 'software', 'property', 'event', 'education', 'trades', 'civic', 'service'];

/**
 * One structured call that turns the user's prompt into a complete, business-specific
 * brief + website copy for the pipeline generator. Returns null when OpenAI is not
 * configured or the call fails, so callers can fall back to the rule-based engine.
 */
export async function generateSiteCopy(prompt, draft = {}) {
  const system = `${eliteDesignerDirective}

You are a senior UK conversion copywriter and information architect. You write specific, concrete website copy for one real business.
Rules:
- Use ONLY facts the user supplied for names, prices, phone numbers, addresses, opening hours, team members, accreditations, ratings and review counts. Never invent these. If a fact is missing, leave that field empty or the array empty.
- Never write placeholder copy ("Lorem ipsum", "placeholder", "Starter/Growth/Complete" packages, "X made easier for Y").
- Never invent testimonials or quotes from customers.
- Write in British English. Be specific to the industry: a dentist talks about treatments, comfort and booking; a bakery about bakes, ordering and collection.
- Headlines: short (max 9 words), benefit-led, no clichés like "Welcome to" or "Your trusted partner".
- Return strict JSON only.`;

  const user = `User's website request:
"""
${String(prompt || '').slice(0, 6000)}
"""

Rule-based first guess (correct it if wrong): ${JSON.stringify({ business_name: draft.business_name, industry: draft.industry, project_nature: draft.project_nature, location: draft.location, pages: draft.pages })}

Return JSON with exactly this shape:
{
  "business_name": "",
  "industry": "short label, e.g. Dental Practice, Artisan Bakery, Emergency Plumber",
  "project_nature": "one of ${SITE_COPY_NATURES.join(' | ')}",
  "location": "town/area or empty",
  "target_audience": "one sentence",
  "tone": "calm | bold | warm | professional | creative",
  "goal": "book appointment | sell product | request quote | request demo | generate leads | make reservation | generate volunteer enquiries",
  "pages": ["Home", "...4-8 pages that fit this business; honour pages the user listed...", "Contact"],
  "brand_colours": { "primary": "#hex or empty", "accent": "#hex or empty" },
  "hero": { "eyebrow": "", "h1": "", "subheadline": "max 30 words", "primary_cta": "2-5 words", "secondary_cta": "2-4 words" },
  "trust_signals": [{ "value": "short e.g. 4.9★, 15 yrs, CQC, Same-day", "label": "short" }],
  "services": [{ "title": "", "description": "1-2 specific sentences", "price": "only if supplied" }],
  "benefits": [{ "title": "", "text": "" }],
  "process": [{ "title": "", "text": "" }],
  "about": { "heading": "", "body": "2-4 sentences" },
  "team": [{ "name": "", "role": "", "bio": "" }],
  "pricing": [{ "name": "", "price": "", "description": "" }],
  "testimonials": [{ "quote": "", "name": "" }],
  "faqs": [{ "q": "", "a": "" }],
  "contact": { "phone": "", "email": "", "address": "", "hours": "" },
  "final_cta": { "heading": "", "text": "" },
  "page_copy": {
    "<Page title from pages, except Home and Contact>": {
      "h1": "", "intro": "2 sentences",
      "sections": [{ "title": "", "text": "2-3 sentences", "bullets": ["optional"] }]
    }
  },
  "seo": { "primary_keyword": "e.g. dentist in Didsbury", "meta_description": "140-160 characters" }
}
Give 3 trust_signals, 3-8 services, 3 benefits, 3-4 process steps, 4-6 faqs, and 2-4 sections per page in page_copy. team, pricing and testimonials must be empty arrays unless the user supplied them.`;

  return jsonCompletion(system, user);
}
