// Prompt parsing + content engine for the pipeline generator.
//
// Flow: parsePromptFacts() pulls hard facts out of the prompt (name, location, pages,
// colours, phone...), classifyBusiness() decides the industry, then buildSiteContent()
// merges AI copy (when OpenAI is available) over a per-industry rule-based library so
// a site is always specific to the business, never generic filler.

import { classifyBusiness, PROJECT_NATURES } from '../ai/classifier.js';

const COLOUR_WORDS = {
  teal: '#14857a', turquoise: '#1aa39a', navy: '#1b2f5b', 'dark blue': '#1d3b73', 'light blue': '#3d8fd1', 'sky blue': '#3d9ad1', blue: '#1f5fbf',
  green: '#2f7d4f', 'forest green': '#245c3b', sage: '#6f8f72', olive: '#6b7436', mint: '#3aa27f', emerald: '#13795b',
  red: '#b3262e', burgundy: '#7a1f33', maroon: '#7a1f2b', coral: '#e0604f', orange: '#d9661f', amber: '#c98314', yellow: '#c9a10f', mustard: '#b8901a',
  gold: '#b08a2e', purple: '#6a3fa0', lavender: '#8a72c4', violet: '#6b3fc7', pink: '#c94a7c', blush: '#d98a9a', magenta: '#b0307a',
  brown: '#7a5235', terracotta: '#b65c3a', sand: '#c2a878', beige: '#b9a27d', cream: '#c9b48a', black: '#1b1b1f', charcoal: '#2f3237', grey: '#5d6470', gray: '#5d6470', silver: '#8d939c'
};

const LOCATION_STOPWORDS = new Set(['the', 'a', 'an', 'my', 'our', 'your', 'order', 'mind', 'case', 'touch', 'time', 'person', 'house', 'store', 'shop', 'stock', 'business', 'colour', 'color', 'colours', 'colors', 'style', 'line', 'detail', 'addition', 'general', 'particular', 'which', 'this', 'that', 'there', 'here', 'it', 'its', 'we', 'blue', 'green', 'red', 'black', 'white', 'teal', 'navy', 'gold', 'english', 'british', 'london-based']);

const NAME_STOP = '(?:in|at|with|for|selling|sells|that|who|which|offering|offers|based|located|and\\s+we|we|our|it|its|is|are|providing|specialising|specializing|serving|near)';

export function titleCaseWords(value) {
  return String(value || '').replace(/\s+/g, ' ').trim().replace(/\b([a-z])([a-z']*)/g, (match, first, rest) => first.toUpperCase() + rest);
}

function cleanName(raw) {
  let name = String(raw || '').replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
  name = name.replace(/^(a|an|the|my|our)\s+(?=[a-z])/i, (m) => (/^the\s/i.test(m) ? m : ''));
  name = name.replace(/[,.;:!?-]+$/, '').trim();
  if (!name || name.length < 2 || name.split(' ').length > 7) return '';
  if (name === name.toLowerCase()) name = titleCaseWords(name);
  return name;
}

export function extractBusinessName(text) {
  const source = String(text || '');
  const patterns = [
    new RegExp(`\\b(?:called|named)\\s+(.+?)(?=[,.;:!?\\n]|\\s+${NAME_STOP}\\b|$)`, 'i'),
    new RegExp(`\\b(?:business|company|brand|practice|clinic|shop)\\s+(?:name\\s+)?(?:is|=)\\s+(.+?)(?=[,.;:!?\\n]|\\s+${NAME_STOP}\\b|$)`, 'i'),
    /\b(?:[Ww]ebsite|[Ss]ite|[Hh]omepage|[Ll]anding page)\s+for\s+(?!a\b|an\b|my\b|our\b|the\s+(?:best|local)\b)([A-Z][\w&'’.-]*(?:\s+(?:&|and|of|the|[A-Z][\w&'’.-]*))*)/,
    /^(?:create|build|make|design)\s+(?:a\s+|an\s+)?(?:[\w-]+\s+){0,4}(?:website|site)\s+for\s+([A-Z][\w&'’.-]*(?:\s+(?:&|and|of|[A-Z][\w&'’.-]*))*)/
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    const name = cleanName(match?.[1]);
    if (name) return name;
  }
  return '';
}

export function extractLocation(text) {
  const source = String(text || '');
  const capitalised = [...source.matchAll(/\b(?:in|based in|located in|serving|across)\s+([A-Z][a-zA-Z'-]+(?:(?:,\s*|\s+)(?!And\b|With\b|For\b|Called\b)[A-Z][a-zA-Z'-]+){0,2})/g)]
    .map((match) => match[1].trim())
    .filter((value) => !LOCATION_STOPWORDS.has(value.toLowerCase().split(/[\s,]+/)[0]));
  if (capitalised.length) return capitalised[0].replace(/,\s*$/, '');
  const lower = source.match(/\bin\s+([a-z][a-z'-]{2,})\b/i);
  if (lower && !LOCATION_STOPWORDS.has(lower[1].toLowerCase())) return titleCaseWords(lower[1]);
  return '';
}

export function extractPageList(text) {
  const match = String(text || '').match(/\bpages?\s*(?:should be|are|include|including|:|-)\s*([^\n.]+)/i);
  if (!match) return [];
  return match[1]
    .split(/,|;|\/|\band\b|\|/i)
    .map((item) => titleCaseWords(item.replace(/\(.*?\)/g, '').replace(/[^\w &'-]/g, '').trim()))
    .filter((item) => item && item.length <= 32 && item.split(' ').length <= 4)
    .slice(0, 9);
}

export function extractColours(text) {
  const source = String(text || '');
  const hexes = [...source.matchAll(/#([0-9a-f]{6}|[0-9a-f]{3})\b/gi)].map((match) => normaliseHex(match[0]));
  const lower = source.toLowerCase();
  const words = Object.keys(COLOUR_WORDS)
    .sort((a, b) => b.length - a.length)
    .filter((word) => new RegExp(`\\b${word}\\b`).test(lower))
    .filter((word, index, list) => !list.some((other, otherIndex) => otherIndex < index && other.includes(word)))
    .map((word) => ({ word, hex: COLOUR_WORDS[word], at: lower.search(new RegExp(`\\b${word}\\b`)) }))
    .sort((a, b) => a.at - b.at)
    .map((item) => item.hex);
  const all = [...hexes, ...words].filter((hex) => !isNearNeutral(hex) || hexes.includes(hex));
  const primary = all[0] || '';
  // The accent must be a visibly different hue ("teal #2A9D8F ... sand gold" -> gold, not a second teal).
  const accent = all.slice(1).find((hex) => hueGap(hex, primary) > 30) || '';
  return { primary, accent };
}

function hueOf(hex) {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16) / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueGap(a, b) {
  if (!a || !b) return 0;
  const diff = Math.abs(hueOf(a) - hueOf(b)) % 360;
  return diff > 180 ? 360 - diff : diff;
}

function normaliseHex(hex) {
  const value = hex.replace('#', '').toLowerCase();
  return `#${value.length === 3 ? value.split('').map((char) => char + char).join('') : value}`;
}

function isNearNeutral(hex) {
  const value = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((index) => parseInt(value.slice(index, index + 2), 16));
  return Math.max(r, g, b) - Math.min(r, g, b) < 18 && (r > 230 || r < 40);
}

export function extractContact(text) {
  const source = String(text || '');
  const phone = source.match(/(?:\+44\s?\(?0?\)?\s?|\b0)\d{2,4}[\s-]?\d{3,4}[\s-]?\d{3,4}\b/)?.[0]?.trim() || '';
  const email = source.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0]?.replace(/[.,]$/, '') || '';
  const postcode = source.match(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/)?.[0] || '';
  const address = postcode ? (source.match(new RegExp(`[^.\\n(]*${postcode.replace(/\s/, '\\s*')}`))?.[0] || '').replace(/^.*?\(/, '').replace(/^[^\d]*?(?=\d)/, '').trim() : '';
  const hours = source.match(/\b(?:open(?:ing)?(?:\s+hours)?)\s*:?\s*([^.\n]{8,120})/i)?.[1]?.trim() || '';
  return { phone, email, address, hours };
}


function labelledLine(text, labels) {
  const match = String(text || '').match(new RegExp(`(?:^|\\n|\\.\\s)\\s*(?:${labels})\\s*(?:include|are|:|-)\\s*([^\\n]+)`, 'i'));
  return match ? match[1].trim() : '';
}

function splitList(line) {
  // Split on commas/semicolons that are not inside parentheses.
  const parts = [];
  let depth = 0;
  let current = '';
  for (const char of line) {
    if (char === '(') depth += 1;
    if (char === ')') depth = Math.max(0, depth - 1);
    if ((char === ',' || char === ';') && depth === 0) { parts.push(current); current = ''; } else current += char;
  }
  parts.push(current);
  return parts.map((part) => part.replace(/^\s*(?:and|&|also)\s+/i, '').replace(/[.]+$/, '').trim()).filter(Boolean);
}

export function extractServiceList(text) {
  const line = labelledLine(text, 'treatments|services|our services|we offer|menu|products|classes|courses');
  if (!line) return [];
  return splitList(line)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter((item) => item.length > 2 && item.length < 60 && item.split(' ').length <= 6)
    .map((item) => item.charAt(0).toUpperCase() + item.slice(1))
    .slice(0, 10);
}

export function extractTeam(text) {
  const line = labelledLine(text, 'team|our team|staff|team members|meet the team');
  if (!line) return [];
  return splitList(line)
    .map((item) => {
      const match = item.match(/^([^()]+?)\s*(?:\(([^)]*)\)|[-–—]\s*(.+))?$/);
      if (!match) return null;
      const name = match[1].trim();
      if (!/^[A-Z]/.test(name) || name.split(' ').length > 5) return null;
      const details = (match[2] || match[3] || '').split(',').map((part) => part.trim()).filter(Boolean);
      return { name, role: details[0] || '', bio: details.slice(1).join(', ') };
    })
    .filter(Boolean)
    .slice(0, 12);
}

export function extractPricing(text) {
  const line = labelledLine(text, 'pricing|prices|price list|fees|costs|rates');
  if (!line) return [];
  const items = [];
  for (const part of line.split(/;|,(?!\d{3}\b)|\.\s+/)) {
    const match = part.match(/^\s*(?:also\s+(?:offer\s+)?(?:a\s+)?)?(.+?)\s+(?:is\s+|at\s+|costs?\s+)?((?:from\s+)?£\s?[\d,]+(?:\.\d{2})?(?:\s*(?:per|\/|a)\s*[a-z]+)?)(.*)$/i);
    if (!match) continue;
    const name = match[1].replace(/^(a|an|the)\s+/i, '').trim();
    const extra = match[3].replace(/^\s*(with|and)\s+/i, '').replace(/[.]+$/, '').trim();
    items.push({ name: name.charAt(0).toUpperCase() + name.slice(1), price: match[2].replace(/\s+/g, ' ').trim(), description: extra });
  }
  return items.slice(0, 15);
}

export function extractProof(text) {
  const source = String(text || '');
  const proof = [];
  const rating = source.match(/(\d(?:\.\d)?)\s*(?:stars?|★)[^.\n]{0,30}?(\d[\d,]*\+?)\s*(?:google\s+)?reviews/i);
  if (rating) proof.push({ value: `${rating[1]}★`, label: `from ${rating[2]} reviews` });
  const accreditations = [['CQC', /\bCQC\b|care quality commission/i], ['GDC', /\bGDC\b|general dental council/i], ['Gas Safe', /gas safe/i], ['NICEIC', /niceic/i], ['SRA', /\bSRA\b|solicitors regulation/i], ['ICAEW', /icaew/i], ['Ofsted', /ofsted/i], ['HCPC', /hcpc/i], ['Which? Trusted', /which\?\s*trusted/i]];
  const found = accreditations.filter(([, pattern]) => pattern.test(source)).map(([name]) => name);
  if (found.length) proof.push({ value: found.slice(0, 2).join(' · '), label: found.length > 1 ? 'registered & accredited' : 'accredited' });
  const years = source.match(/(\d{1,3})\+?\s*years?(?:'|’)?\s*(?:of\s+)?experience/i);
  if (years) proof.push({ value: `${years[1]}+ yrs`, label: 'experience' });
  if (/late evening|evenings?|saturday|weekend/i.test(source)) proof.push({ value: 'Evenings', label: /saturday|weekend/i.test(source) ? '& Saturday appointments' : 'appointments available' });
  return proof.slice(0, 3);
}

export function wantsGallery(text) {
  return /gallery|before\s*\/?\s*(?:and\s*)?after|portfolio of work/i.test(String(text || ''));
}

export function parsePromptFacts(prompt, metadata = {}) {
  const text = String(prompt || '');
  const { nature, industry } = classifyBusiness(text);
  const blueprintPages = (metadata.blueprint?.pages || []).map((page) => titleCaseWords(page.title || '')).filter(Boolean);
  return {
    business_name: metadata.companyHouse?.companyName ? titleCaseWords(String(metadata.companyHouse.companyName).toLowerCase()) : extractBusinessName(text),
    industry,
    project_nature: nature,
    location: extractLocation(text),
    pages: blueprintPages.length ? blueprintPages : extractPageList(text),
    colours: extractColours(text),
    contact: extractContact(text),
    services: extractServiceList(text),
    team: extractTeam(text),
    pricing: extractPricing(text),
    proof: extractProof(text),
    gallery: wantsGallery(text),
    keywords: [...text.matchAll(/["“]([^"”]{4,40})["”]/g)].map((match) => match[1]).filter((value) => value.split(' ').length <= 4 && !/book online/i.test(value)),
    lower: text.toLowerCase()
  };
}

// ---------------------------------------------------------------------------
// Rule-based content library (used when OpenAI is unavailable, and to fill gaps)
// ---------------------------------------------------------------------------

const LIBRARY = {
  dental: {
    pages: ['Home', 'Treatments', 'Nervous Patients', 'Our Team', 'Fees', 'Contact'],
    eyebrow: 'Family & cosmetic dentistry',
    h1: 'Gentle dentistry for healthier, brighter smiles',
    sub: 'Check-ups, hygiene, whitening and Invisalign from a calm, unhurried team that explains every step before treatment starts.',
    cta: 'Book an appointment', cta2: 'View treatments', goal: 'book appointment', tone: 'calm',
    services: [
      ['Check-ups & hygiene', 'Thorough examinations and hygienist visits that keep problems small and your teeth feeling fresh.'],
      ['Teeth whitening', 'Professional whitening with custom trays for a natural, even result without the sensitivity of shop kits.'],
      ['Invisalign clear aligners', 'Discreet aligners to straighten teeth gradually, with a digital scan showing your result before you start.'],
      ['Composite bonding', 'Reshape chips, gaps and worn edges in a single visit with tooth-coloured resin.'],
      ['Dental implants', 'A permanent, natural-looking replacement for missing teeth, planned carefully from consultation to fit.'],
      ['Emergency appointments', 'Same-day slots for toothache, swelling or broken teeth, so pain is dealt with quickly.'],
      ['Porcelain veneers', 'Thin, natural-looking veneers that transform the shape and shade of your smile.'],
      ["Children's dentistry", 'Fun, gentle visits that help children feel at home and build healthy habits for life.'],
      ['Crowns & bridges', 'Strong, natural-looking restorations to protect damaged teeth and fill gaps.'],
      ['Root canal treatment', 'Gentle, modern root canal care to save painful teeth and stop infection.']
    ],
    benefits: [['Nervous patients welcome', 'Longer appointments, clear explanations and the option to pause at any time.'], ['Transparent fees', 'Your treatment plan and costs are agreed in writing before anything begins.'], ['Modern, comfortable surgery', 'Digital scans instead of messy impressions and a calm space designed to help you relax.']],
    process: [['Book online or call', 'Choose a time that suits you, including early and late slots.'], ['Relaxed consultation', 'We examine, talk through options and answer every question.'], ['Clear treatment plan', 'You get a written plan with costs, so there are no surprises.'], ['Ongoing care', 'Friendly reminders and regular check-ups keep your smile healthy.']],
    faqs: [['Do you accept new patients?', 'Yes. You can book a new patient examination online or by phone.'], ['Are you NHS or private?', 'We are a private practice. Fees are agreed in writing before treatment, and many treatments can be spread with finance or a membership plan.'], ['What happens at my first visit?', 'A relaxed conversation about your concerns, a full examination and any X-rays needed, then a clear written plan with costs. Nothing happens without your agreement.'], ['I am nervous about the dentist. Can you help?', 'Absolutely. Tell us when you book and we will allow extra time, explain everything first and agree a signal so you can pause whenever you need.'], ['Do you offer payment plans?', 'Many treatments can be spread over monthly payments. Ask us for details at your consultation.'], ['What should I do in a dental emergency?', 'Call us as early as possible. We keep same-day slots for urgent pain, swelling and broken teeth.']],
    trust: [['Same-day', 'emergency slots'], ['Calm', 'nervous-patient care'], ['Clear', 'written treatment plans']]
  },
  physio: {
    pages: ['Home', 'Treatments', 'Conditions', 'Our Team', 'Contact'],
    eyebrow: 'Physiotherapy & rehabilitation', h1: 'Move freely again, with a plan that works', sub: 'Hands-on treatment and practical exercise plans for back pain, sports injuries and recovery after surgery.',
    cta: 'Book an assessment', cta2: 'See treatments', goal: 'book appointment', tone: 'calm',
    services: [['Sports injury rehab', 'Get back to training safely with staged, sport-specific rehabilitation.'], ['Back & neck pain', 'Find the cause of the pain and build strength so it stays away.'], ['Post-operative recovery', 'Structured rehab after joint replacement, ACL or spinal surgery.'], ['Clinical Pilates', 'Small-group sessions to improve control, posture and core strength.']],
    benefits: [['No referral needed', 'Book directly and be seen quickly.'], ['Clear diagnosis', 'Understand what is wrong and why, in plain English.'], ['Home exercise plans', 'Simple programmes you can follow between sessions.']],
    process: [['Initial assessment', 'A thorough look at your history, movement and goals.'], ['Treatment & plan', 'Hands-on care plus a programme tailored to you.'], ['Progress reviews', 'We measure improvement and adjust as you recover.']],
    faqs: [['Do I need a GP referral?', 'No, you can book directly with us.'], ['How many sessions will I need?', 'It depends on the problem; most people notice progress within three to five sessions.'], ['Is physiotherapy covered by insurance?', 'Most major health insurers cover physiotherapy. Check your policy before booking.']],
    trust: [['Direct', 'access, no referral'], ['1:1', 'appointments'], ['Clear', 'recovery plans']]
  },
  beauty: {
    pages: ['Home', 'Treatments', 'Prices', 'About', 'Contact'],
    eyebrow: 'Hair, beauty & wellbeing', h1: 'Leave feeling lighter, look your best', sub: 'Expert treatments in a relaxed space, with easy online booking.',
    cta: 'Book a treatment', cta2: 'View treatments', goal: 'book appointment', tone: 'warm',
    services: [['Cut & finish', 'Precision cuts tailored to your face shape and lifestyle.'], ['Colour & highlights', 'Natural-looking colour with a consultation and patch test first.'], ['Facials & skin', 'Results-led facials for a clearer, brighter complexion.'], ['Nails', 'Long-lasting manicures and pedicures with a flawless finish.']],
    benefits: [['Experienced stylists', 'A friendly team who listen first.'], ['Quality products', 'Professional brands that look after hair and skin.'], ['Easy booking', 'Book, reschedule or cancel online in seconds.']],
    process: [['Book online', 'Choose a treatment and time.'], ['Consultation', 'We talk through what you want.'], ['Relax', 'Sit back while we take care of the rest.']],
    faqs: [['Do I need a patch test?', 'For colour and lash treatments, yes, at least 48 hours before.'], ['What is your cancellation policy?', 'Please give 24 hours notice so we can offer the slot to someone else.']],
    trust: [['Expert', 'stylists'], ['Online', 'booking'], ['Premium', 'products']]
  },
  care: {
    pages: ['Home', 'Services', 'About', 'Our Team', 'Contact'],
    eyebrow: 'Professional, caring support', h1: 'Expert care, explained clearly', sub: 'Practical, professional care with time to listen and a clear plan from the first visit.',
    cta: 'Book an appointment', cta2: 'Our services', goal: 'book appointment', tone: 'calm',
    services: [['Initial consultation', 'A relaxed first appointment to understand your needs.'], ['Treatment planning', 'A clear plan with options, timings and costs explained.'], ['Ongoing care', 'Regular reviews to keep progress on track.']],
    benefits: [['Time to listen', 'Appointments are never rushed.'], ['Qualified team', 'Experienced, registered professionals.'], ['Clear costs', 'Fees agreed before treatment.']],
    process: [['Get in touch', 'Book online or call us.'], ['Consultation', 'We assess and explain your options.'], ['Your plan', 'Treatment tailored to you.']],
    faqs: [['How do I book?', 'Use the booking form or call us.'], ['What happens at the first appointment?', 'We listen, assess and explain your options before anything begins.']],
    trust: [['Qualified', 'practitioners'], ['Clear', 'fees'], ['Friendly', 'team']]
  },
  hospitality: {
    pages: ['Home', 'Menu', 'About', 'Visit Us', 'Contact'],
    eyebrow: 'Fresh, local, made with care', h1: 'Good food, made fresh every day', sub: 'Seasonal cooking, a warm welcome and a table waiting for you.',
    cta: 'Book a table', cta2: 'See the menu', goal: 'make reservation', tone: 'warm',
    services: [['Breakfast & brunch', 'Slow mornings, great coffee and plates worth getting up for.'], ['Lunch & dinner', 'A seasonal menu built around the best local produce.'], ['Private hire', 'Celebrate birthdays, team dinners and special occasions with us.'], ['Takeaway & collection', 'Order ahead and collect your favourites on the way home.']],
    benefits: [['Made from scratch', 'Everything is prepared in our own kitchen.'], ['Local suppliers', 'We buy from growers and producers nearby.'], ['Dietary needs welcome', 'Vegetarian, vegan and gluten-free options every day.']],
    process: [['Choose a time', 'Book online in under a minute.'], ['Arrive & relax', 'We will have your table ready.'], ['Enjoy', 'Great food, unhurried service.']],
    faqs: [['Do you take walk-ins?', 'Yes, when tables are free, but booking guarantees your spot at busy times.'], ['Can you cater for allergies?', 'Please tell us when you book and our team will guide you through the menu.'], ['Do you offer private hire?', 'Yes. Get in touch with your date and numbers.']],
    trust: [['Fresh', 'daily'], ['Local', 'produce'], ['All', 'diets welcome']]
  },
  bakery: {
    pages: ['Home', 'Our Bakes', 'Celebration Cakes', 'About', 'Contact'],
    eyebrow: 'Baked fresh every morning', h1: 'Real bread and cakes, baked by hand', sub: 'Slow-fermented sourdough, pastries and made-to-order celebration cakes, fresh from our ovens.',
    cta: 'Order a cake', cta2: 'See our bakes', goal: 'generate leads', tone: 'warm',
    services: [['Sourdough & bread', 'Naturally leavened loaves with a crisp crust and open crumb, baked daily.'], ['Pastries & sweet bakes', 'Buttery croissants, cinnamon buns and seasonal tarts.'], ['Celebration cakes', 'Made-to-order cakes for birthdays, weddings and every occasion in between.'], ['Wholesale', 'Fresh bread and bakes for local cafés, delis and restaurants.']],
    benefits: [['Baked by hand', 'Small batches, real ingredients, no shortcuts.'], ['Long fermentation', 'Better flavour and easier to digest.'], ['Made for you', 'Cakes designed around your occasion.']],
    process: [['Tell us your idea', 'Date, size, flavours and theme.'], ['We design & quote', 'A clear price and design confirmed with you.'], ['Collect or delivery', 'Fresh on the day, ready to celebrate.']],
    faqs: [['How far ahead should I order a cake?', 'At least a week for most cakes, longer for weddings.'], ['Do you cater for allergies?', 'We can adapt many recipes; tell us your needs when ordering.'], ['Can I reserve bread?', 'Yes, message us the day before to reserve your loaf.']],
    trust: [['Daily', 'fresh bakes'], ['Handmade', 'in small batches'], ['Custom', 'celebration cakes']]
  },
  commerce: {
    pages: ['Home', 'Shop', 'About', 'Delivery & Returns', 'Contact'],
    eyebrow: 'New season collection', h1: 'Pieces you will reach for every day', sub: 'Thoughtfully chosen products, fast UK delivery and easy returns.',
    cta: 'Shop now', cta2: 'Browse the collection', goal: 'sell product', tone: 'bold',
    services: [['New arrivals', 'The latest drops, added every week.'], ['Best sellers', 'The pieces our customers come back for.'], ['Gift ideas', 'Easy, thoughtful gifts for every budget.'], ['Sale', 'Great products at better prices, while stocks last.']],
    benefits: [['Fast delivery', 'Quick, tracked UK shipping.'], ['Easy returns', 'Changed your mind? Return it hassle-free.'], ['Secure checkout', 'Safe payment with trusted providers.']],
    process: [['Browse', 'Find what you love.'], ['Checkout', 'Quick and secure payment.'], ['Delivered', 'Tracked to your door.']],
    faqs: [['How long does delivery take?', 'Most UK orders arrive in two to four working days.'], ['Can I return an item?', 'Yes, unused items can be returned within 30 days.']],
    trust: [['Fast', 'UK delivery'], ['30-day', 'returns'], ['Secure', 'checkout']]
  },
  professional: {
    pages: ['Home', 'Services', 'About', 'Our Team', 'Contact'],
    eyebrow: 'Expert advice, plainly explained', h1: 'Clear advice when it matters most', sub: 'Practical, expert guidance from people who explain your options and stay with you to the result.',
    cta: 'Book a consultation', cta2: 'Our services', goal: 'generate leads', tone: 'professional',
    services: [['Initial consultation', 'Understand where you stand and what your options are.'], ['Ongoing advice', 'Support from a named adviser who knows your situation.'], ['Specialist services', 'Experienced help with complex or time-critical matters.']],
    benefits: [['Plain English', 'No jargon, just clear options.'], ['Responsive', 'Quick replies from a named contact.'], ['Transparent fees', 'Costs agreed up front.']],
    process: [['Get in touch', 'Tell us briefly what you need.'], ['Consultation', 'We review your situation and options.'], ['Action plan', 'Clear next steps and fees agreed.']],
    faqs: [['How much does a consultation cost?', 'Contact us and we will confirm fees before any work begins.'], ['How quickly can you help?', 'We aim to respond to new enquiries within one working day.']],
    trust: [['Qualified', 'experts'], ['Fixed', 'fee options'], ['Fast', 'response']]
  },
  fitness: {
    pages: ['Home', 'Classes', 'Memberships', 'Timetable', 'Contact'],
    eyebrow: 'Train with purpose', h1: 'Get stronger, feel better, keep going', sub: 'Coached classes, personal training and an encouraging community that makes consistency easy.',
    cta: 'Book a free session', cta2: 'View classes', goal: 'book appointment', tone: 'bold',
    services: [['Strength classes', 'Coached sessions to build real, functional strength.'], ['Personal training', 'One-to-one coaching built around your goals.'], ['Yoga & mobility', 'Move better, recover faster and reduce stiffness.'], ['Open gym', 'Quality equipment whenever it suits you.']],
    benefits: [['Expert coaches', 'Qualified trainers who know your name.'], ['Beginner friendly', 'Every session scales to your level.'], ['Flexible memberships', 'No long contracts.']],
    process: [['Book a free session', 'Try us with no obligation.'], ['Meet your coach', 'Set goals and a starting plan.'], ['Train & progress', 'Track results and keep improving.']],
    faqs: [['I am a complete beginner. Is that OK?', 'Yes. Coaches adapt every session to your level.'], ['Do I need to sign a contract?', 'No, memberships are rolling monthly.']],
    trust: [['Qualified', 'coaches'], ['Free', 'first session'], ['No', 'long contracts']]
  },
  portfolio: {
    pages: ['Home', 'Work', 'Services', 'About', 'Contact'],
    eyebrow: 'Selected work', h1: 'Thoughtful work that tells your story', sub: 'Considered, original creative work for people and brands who care about detail.',
    cta: 'Start a project', cta2: 'See the work', goal: 'generate leads', tone: 'creative',
    services: [['Brand identity', 'Logos, typography and visual systems with real character.'], ['Photography', 'Natural, story-led images that feel like you.'], ['Web & digital', 'Websites and content that look great and work hard.']],
    benefits: [['Original work', 'Nothing off the shelf.'], ['Collaborative', 'You are involved at every stage.'], ['On time', 'Clear timelines and communication.']],
    process: [['Discovery', 'We learn about you and your goals.'], ['Concept', 'Ideas and direction for you to shape.'], ['Delivery', 'Polished final work, ready to use.']],
    faqs: [['How much does a project cost?', 'Every project is quoted individually after a short discovery call.'], ['How long does a project take?', 'Most projects take two to six weeks depending on scope.']],
    trust: [['Award-worthy', 'craft'], ['Clear', 'timelines'], ['Personal', 'service']]
  },
  software: {
    pages: ['Home', 'Features', 'Pricing', 'About', 'Contact'],
    eyebrow: 'Built for busy teams', h1: 'Less admin. More of the work that matters.', sub: 'One simple platform to automate repetitive tasks, see what is happening and move faster.',
    cta: 'Book a demo', cta2: 'See features', goal: 'request demo', tone: 'bold',
    services: [['Automation', 'Replace repetitive manual steps with reliable workflows.'], ['Live dashboards', 'See the numbers that matter, updated in real time.'], ['Integrations', 'Connect the tools your team already uses.'], ['Secure by design', 'Role-based access, audit trails and encrypted data.']],
    benefits: [['Fast setup', 'Up and running in days, not months.'], ['Easy to use', 'Clean interface your team will actually adopt.'], ['Real support', 'Help from people who know the product.']],
    process: [['Book a demo', 'See it with your own use case.'], ['Free trial', 'Try it with your team.'], ['Go live', 'Onboarding and support included.']],
    faqs: [['Is there a free trial?', 'Yes, talk to us and we will set one up for your team.'], ['Is my data secure?', 'Data is encrypted in transit and at rest with strict access controls.']],
    trust: [['Days', 'to set up'], ['Secure', 'by design'], ['UK', 'support']]
  },
  property: {
    pages: ['Home', 'Properties', 'Valuation', 'Landlords', 'Contact'],
    eyebrow: 'Local property experts', h1: 'Sell, let or buy with local experts', sub: 'Honest valuations, strong marketing and a team that keeps you updated at every step.',
    cta: 'Book a valuation', cta2: 'View properties', goal: 'generate leads', tone: 'professional',
    services: [['Sales', 'Accurate pricing and marketing that attracts serious buyers.'], ['Lettings', 'Find reliable tenants quickly.'], ['Property management', 'Rent, repairs and compliance handled for you.']],
    benefits: [['Local knowledge', 'We know the streets, schools and prices.'], ['Clear fees', 'No hidden costs.'], ['Regular updates', 'You always know what is happening.']],
    process: [['Free valuation', 'An honest view of your property value.'], ['Marketing', 'Photography, listings and viewings.'], ['Completion', 'We guide you through to the keys.']],
    faqs: [['Is the valuation free?', 'Yes, with no obligation.'], ['What are your fees?', 'We will confirm them clearly at your valuation.']],
    trust: [['Free', 'valuations'], ['Local', 'experts'], ['Clear', 'fees']]
  },
  event: {
    pages: ['Home', 'Schedule', 'Tickets', 'Venue', 'Contact'],
    eyebrow: 'Save the date', h1: 'An event worth clearing your diary for', sub: 'Great people, a memorable venue and a programme you will talk about afterwards.',
    cta: 'Get tickets', cta2: 'See the schedule', goal: 'sell product', tone: 'bold',
    services: [['Talks & sessions', 'Expert speakers and practical takeaways.'], ['Networking', 'Meet the people worth knowing.'], ['Hospitality', 'Food, drinks and space to relax.']],
    benefits: [['Easy booking', 'Secure tickets online in minutes.'], ['Great location', 'Easy to reach with good transport links.'], ['Accessible', 'Step-free access and support available.']],
    process: [['Book tickets', 'Choose your ticket online.'], ['Plan your day', 'Check the schedule and venue info.'], ['Enjoy', 'Arrive, connect and enjoy the day.']],
    faqs: [['Can I get a refund?', 'Please see the ticket terms or contact us.'], ['Is the venue accessible?', 'Yes, with step-free access. Contact us with any specific needs.']],
    trust: [['Secure', 'ticketing'], ['Accessible', 'venue'], ['Great', 'speakers']]
  },
  education: {
    pages: ['Home', 'Courses', 'Tutors', 'Results', 'Contact'],
    eyebrow: 'Learning that builds confidence', h1: 'Confident learners, better results', sub: 'Expert, encouraging teaching that helps students understand, practise and succeed.',
    cta: 'Book a free consultation', cta2: 'View courses', goal: 'book appointment', tone: 'professional',
    services: [['One-to-one tuition', 'Lessons tailored to how your child learns best.'], ['Small group classes', 'Focused groups with plenty of individual attention.'], ['Exam preparation', 'Structured revision and past-paper practice.']],
    benefits: [['Qualified tutors', 'Experienced, DBS-checked teachers.'], ['Progress updates', 'Regular feedback for parents.'], ['Flexible', 'In person or online.']],
    process: [['Free consultation', 'We understand goals and current level.'], ['Matched tutor', 'Paired with the right teacher.'], ['Track progress', 'Regular reviews and reports.']],
    faqs: [['Are your tutors DBS checked?', 'Yes, every tutor is DBS checked.'], ['Do you offer online lessons?', 'Yes, lessons are available in person and online.']],
    trust: [['DBS', 'checked tutors'], ['Online', '& in person'], ['Regular', 'progress reports']]
  },
  trades: {
    pages: ['Home', 'Services', 'Areas We Cover', 'About', 'Contact'],
    eyebrow: 'Reliable local tradespeople', h1: 'Fixed properly, first time', sub: 'Fast, tidy and fully qualified, with clear quotes before any work starts.',
    cta: 'Get a free quote', cta2: 'Our services', goal: 'request quote', tone: 'professional',
    services: [['Repairs', 'Fast diagnosis and lasting fixes.'], ['Installations', 'Quality installations with a workmanship guarantee.'], ['Emergency callouts', 'Rapid response when you need it most.'], ['Servicing & maintenance', 'Keep things running safely and efficiently.']],
    benefits: [['Fully qualified', 'Certified, insured and experienced.'], ['Clear quotes', 'Fixed prices agreed before we start.'], ['Tidy work', 'We respect your home and clean up.']],
    process: [['Call or message', 'Tell us what you need.'], ['Free quote', 'A clear, fixed price.'], ['Job done', 'Completed on time and guaranteed.']],
    faqs: [['Do you charge for quotes?', 'No, quotes are free and without obligation.'], ['Are you insured?', 'Yes, fully insured with public liability cover.'], ['Do you offer emergency callouts?', 'Yes, call us and we will get to you as quickly as possible.']],
    trust: [['Free', 'quotes'], ['Fully', 'insured'], ['Guaranteed', 'workmanship']]
  },
  civic: {
    pages: ['Home', 'Safety Advice', 'Community', 'Get Involved', 'Contact'],
    eyebrow: 'Serving our community', h1: 'Keeping our community safe and supported', sub: 'Practical safety advice, community programmes and clear ways to get help or get involved.',
    cta: 'Get in touch', cta2: 'Safety advice', goal: 'generate volunteer enquiries', tone: 'professional',
    services: [['Safety advice', 'Practical guidance to keep homes and businesses safe.'], ['Community programmes', 'School visits, events and local outreach.'], ['Volunteering', 'Ways to give your time and support the community.']],
    benefits: [['Local', 'Rooted in the community we serve.'], ['Clear', 'Plain advice when it matters.'], ['Open', 'Easy ways to contact the team.']],
    process: [['Get in touch', 'Tell us what you need.'], ['We respond', 'The right person will reply.'], ['Get support', 'Practical help and next steps.']],
    faqs: [['In an emergency, who should I call?', 'Always call 999 in an emergency. This website is for non-urgent enquiries.'], ['How can I volunteer?', 'Use the contact form and tell us how you would like to help.']],
    trust: [['Local', 'service'], ['Free', 'advice'], ['Community', 'focused']]
  },
  service: {
    pages: ['Home', 'Services', 'About', 'Contact'],
    eyebrow: 'Trusted local service', h1: 'Expert help, done properly', sub: 'Reliable, friendly service with clear prices and a team that keeps you updated.',
    cta: 'Get in touch', cta2: 'Our services', goal: 'generate leads', tone: 'professional',
    services: [['Consultation', 'Understand your needs and options.'], ['Delivery', 'Quality work done on time.'], ['Aftercare', 'Support whenever you need it.']],
    benefits: [['Experienced', 'Years of hands-on expertise.'], ['Transparent', 'Clear prices agreed up front.'], ['Responsive', 'Quick replies and updates.']],
    process: [['Get in touch', 'Tell us what you need.'], ['Plan', 'We agree scope and price.'], ['Deliver', 'Work completed to a high standard.']],
    faqs: [['How do I get a quote?', 'Use the contact form or call us and we will reply quickly.'], ['What areas do you cover?', 'Get in touch and we will confirm whether we cover your area.']],
    trust: [['Trusted', 'local team'], ['Clear', 'pricing'], ['Fast', 'response']]
  }
};

function libraryFor(nature, industry, lower) {
  if (nature === 'care') {
    if (/dental|dentist|orthodont|invisalign/.test(lower) || /dental/i.test(industry)) return LIBRARY.dental;
    if (/physio|chiropract|osteopath|sports injury/.test(lower) || /physio/i.test(industry)) return LIBRARY.physio;
    if (/salon|barber|beauty|nail|spa|hair/.test(lower) || /beauty/i.test(industry)) return LIBRARY.beauty;
    return LIBRARY.care;
  }
  if (nature === 'hospitality' && (/bakery|patisserie|bakes|cakes|sourdough/.test(lower) || /bakery/i.test(industry))) return LIBRARY.bakery;
  return LIBRARY[nature] || LIBRARY.service;
}

// ---------------------------------------------------------------------------
// Merge AI copy with facts + library
// ---------------------------------------------------------------------------

const str = (value, max = 400) => (typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const arr = (value) => (Array.isArray(value) ? value : []);
const PLACEHOLDER = /lorem|ipsum|placeholder|made easier for|\[[a-z ]+\]|\{\{|\bxxx\b/i;
const flatText = (item) => (item && typeof item === 'object' ? Object.values(item).map(flatText).join(' ') : String(item ?? ''));

function cleanList(list, mapper, min = 0, max = 8) {
  const items = arr(list).map(mapper).filter(Boolean).filter((item) => !PLACEHOLDER.test(flatText(item)));
  return items.length >= min ? items.slice(0, max) : [];
}

function hexOrEmpty(value) {
  const match = String(value || '').match(/#([0-9a-f]{6}|[0-9a-f]{3})\b/i);
  return match ? normaliseHex(match[0]) : '';
}

export function buildBriefAndContent({ facts, ai, metadata = {} }) {
  const aiNature = PROJECT_NATURES.includes(str(ai?.project_nature).toLowerCase()) ? str(ai.project_nature).toLowerCase() : '';
  // Trust the AI's nature unless the rule classifier is confident about something else.
  const nature = aiNature || facts.project_nature;
  const lib = libraryFor(nature, str(ai?.industry) || facts.industry, facts.lower);
  const businessName = facts.business_name || str(ai?.business_name, 80) || [facts.location, facts.industry].filter(Boolean).join(' ') || 'Your Business';
  const industry = str(ai?.industry, 60) || facts.industry;
  const location = facts.location || str(ai?.location, 60);

  const aiPages = cleanList(ai?.pages, (page) => titleCaseWords(str(page, 32)), 3, 9);
  let pages = facts.pages.length ? facts.pages : aiPages.length ? aiPages : lib.pages;
  pages = [...new Set(pages.map((page) => (/^(home|homepage|home page)$/i.test(page) ? 'Home' : page)))];
  pages = pages.filter((page) => !/^privacy/i.test(page));
  if (!pages.includes('Home')) pages.unshift('Home');
  if (!pages.some((page) => /^contact/i.test(page))) pages.push('Contact');

  const aiServices = cleanList(ai?.services, (service) => (str(service?.title, 70) ? { title: str(service.title, 70), description: str(service.description, 260), price: str(service.price, 40) } : null), 2, 8);
  const services = aiServices.length ? aiServices : facts.services.length ? facts.services.map((title) => serviceFromLibrary(title, lib, facts.pricing)) : lib.services.map(([title, description]) => ({ title, description, price: '' }));
  const pairList = (list, aMax, bMax, keyA = 'title', keyB = 'text') => cleanList(list, (item) => (str(item?.[keyA], aMax) && str(item?.[keyB], bMax) ? { [keyA]: str(item[keyA], aMax), [keyB]: str(item[keyB], bMax) } : null), 2, 6);
  const benefits = pairList(ai?.benefits, 70, 220);
  const process = pairList(ai?.process, 60, 200);
  const faqs = pairList(ai?.faqs, 140, 420, 'q', 'a');
  const trust = cleanList(ai?.trust_signals, (item) => (str(item?.value, 18) && str(item?.label, 40) ? { value: str(item.value, 18), label: str(item.label, 40) } : null), 3, 3);
  const aiTeam = cleanList(ai?.team, (member) => (str(member?.name, 60) ? { name: str(member.name, 60), role: str(member.role, 80), bio: str(member.bio, 260) } : null), 1, 12);
  const team = aiTeam.length ? aiTeam : facts.team;
  const aiPricing = cleanList(ai?.pricing, (item) => (str(item?.name, 60) && str(item?.price, 40) ? { name: str(item.name, 60), price: str(item.price, 40), description: str(item.description, 200) } : null), 1, 12);
  const pricing = aiPricing.length ? aiPricing : facts.pricing;
  const testimonials = cleanList(ai?.testimonials, (item) => (str(item?.quote, 300) ? { quote: str(item.quote, 300), name: str(item.name, 60) } : null), 1, 6);

  const hero = ai?.hero || {};
  const h1 = !PLACEHOLDER.test(str(hero.h1)) && str(hero.h1, 90) ? str(hero.h1, 90) : lib.h1;
  const contactAi = ai?.contact || {};
  const contact = {
    phone: facts.contact.phone || str(contactAi.phone, 30),
    email: facts.contact.email || str(contactAi.email, 80),
    address: facts.contact.address || str(contactAi.address, 160),
    hours: facts.contact.hours || str(contactAi.hours, 160)
  };
  const colours = {
    primary: facts.colours.primary || hexOrEmpty(ai?.brand_colours?.primary) || (metadata.logoPalette?.primary && hexOrEmpty(metadata.logoPalette.primary)) || '',
    accent: facts.colours.accent || hexOrEmpty(ai?.brand_colours?.accent) || ''
  };
  const tone = ['calm', 'bold', 'warm', 'professional', 'creative'].includes(str(ai?.tone)) ? str(ai.tone) : lib.tone;
  const goal = str(ai?.goal, 60) || lib.goal;
  const primaryKeyword = str(ai?.seo?.primary_keyword, 60) || facts.keywords?.[0] || `${industry.toLowerCase()}${location ? ` in ${location.split(',')[0]}` : ''}`;

  const pageCopy = {};
  const aiPageCopy = ai?.page_copy && typeof ai.page_copy === 'object' ? ai.page_copy : {};
  for (const page of pages) {
    if (page === 'Home' || /^contact/i.test(page)) continue;
    const match = aiPageCopy[page] || aiPageCopy[Object.keys(aiPageCopy).find((key) => key.toLowerCase() === page.toLowerCase())];
    const sections = cleanList(match?.sections, (section) => (str(section?.title, 80) && str(section?.text, 500) ? { title: str(section.title, 80), text: str(section.text, 500), bullets: arr(section.bullets).map((bullet) => str(bullet, 120)).filter(Boolean).slice(0, 6) } : null), 1, 5);
    const libraryPage = pageLibraryFor(page);
    pageCopy[page] = {
      h1: str(match?.h1, 90) || libraryPage?.h1 || page,
      intro: str(match?.intro, 400) || libraryPage?.intro || fallbackIntro(page, { businessName, industry, location, lib }),
      sections: sections.length ? sections : libraryPage?.sections || []
    };
  }

  const brief = {
    business_name: businessName,
    industry,
    project_nature: nature,
    location: location || null,
    target_audience: str(ai?.target_audience, 200) || audienceFor(nature),
    tone,
    goal,
    pages,
    colours,
    style: tone === 'creative' ? 'editorial' : 'minimal',
    keywords: [primaryKeyword, `${businessName} ${industry}`.toLowerCase()],
    contact_email: contact.email || `hello@${slugish(businessName)}.co.uk`,
    contact_phone: contact.phone || '',
    address: contact.address || (location ? location : ''),
    hours: contact.hours,
    ai_generated: Boolean(ai)
  };

  const content = {
    primaryKeyword,
    home: {
      eyebrow: str(hero.eyebrow, 60) || lib.eyebrow,
      h1,
      subheadline: str(hero.subheadline, 260) || lib.sub,
      primaryCta: str(hero.primary_cta, 40) || lib.cta,
      secondaryCta: str(hero.secondary_cta, 40) || lib.cta2,
      trustSignals: trust.length ? trust : [...facts.proof, ...lib.trust.map(([value, label]) => ({ value, label }))].slice(0, 3),
      services
    },
    benefits: benefits.length ? benefits : lib.benefits.map(([title, text]) => ({ title, text })),
    process: process.length ? process : lib.process.map(([title, text]) => ({ title, text })),
    faqs: faqs.length ? faqs : lib.faqs.map(([q, a]) => ({ q, a })),
    about: {
      heading: str(ai?.about?.heading, 90) || `About ${businessName}`,
      body: str(ai?.about?.body, 900) || `${businessName} is ${/^[aeiou]/i.test(industry) ? 'an' : 'a'} ${industry.toLowerCase()}${location ? ` in ${location}` : ''}. ${lib.sub}`
    },
    team,
    pricing,
    testimonials,
    finalCta: { heading: str(ai?.final_cta?.heading, 90) || lib.cta, text: str(ai?.final_cta?.text, 260) || lib.sub },
    contact,
    metaDescription: str(ai?.seo?.meta_description, 170),
    gallery: facts.gallery,
    seoKeywords: [...new Set([primaryKeyword, ...(facts.keywords || [])])].slice(0, 6),
    pageCopy
  };
  return { brief, content };
}

function serviceFromLibrary(title, lib, pricing = []) {
  const lower = title.toLowerCase();
  const words = lower.split(/[^a-z]+/).filter((word) => word.length > 3);
  const known = lib.services.find(([name]) => words.some((word) => name.toLowerCase().includes(word.replace(/s$/, ''))));
  const price = pricing.find((item) => words.some((word) => item.name.toLowerCase().includes(word)))?.price || '';
  return { title, description: known ? known[1] : `${title}, explained clearly and delivered with care. Ask us about the options that suit you.`, price };
}

const PAGE_LIBRARY = [
  [/nervous|anxious/i, 'Nervous? You are in safe hands', 'Many of our patients had not seen a dentist for years. We go at your pace, explain everything first and never judge.', [
    ['Our gentle approach', 'Longer appointments, a calm room and a team who explain every step before it happens. You can raise your hand to pause at any time.'],
    ['Sedation options', 'For longer or more involved treatment, ask us about sedation so you can feel relaxed and comfortable throughout.'],
    ['Start with a chat', 'Your first visit can simply be a conversation. No treatment happens until you are ready.']]],
  [/new patient|first visit|joining/i, 'Welcome, new patients', 'Joining us is simple. Here is what to expect from your first appointment.', [
    ['Before your visit', 'Book online or call us. We will send a short medical history form to complete before you arrive.'],
    ['Your first appointment', 'A relaxed conversation, a thorough examination and any X-rays needed, followed by a clear written plan with costs.'],
    ['After your visit', 'We will book any treatment at a time that suits you and remind you before every appointment.']]],
  [/emergency|urgent/i, 'Urgent help when you need it', 'Call us as early as possible and we will do our best to see you the same day.', [
    ['What counts as an emergency', 'Severe pain, swelling, bleeding that will not stop, or a broken or knocked-out tooth.'],
    ['What to do now', 'Call us straight away. If you have facial swelling affecting your breathing or swallowing, call 999 or go to A&E.']]],
  [/team|people|staff|meet/i, 'Meet the team', 'Friendly, experienced people who take time to listen and explain.', []],
  [/pric|fees|cost/i, 'Clear, upfront prices', 'No surprises: your costs are explained and agreed before any treatment begins.', []],
  [/gallery|smile|before/i, 'Real results', 'A selection of results from our work. Photos are shared with permission.', []],
  [/finance|payment|membership/i, 'Spread the cost', 'Flexible ways to pay so you can get the care you need without waiting.', [
    ['Finance', 'Spread the cost of larger treatments with monthly payments, subject to status.'],
    ['Membership plans', 'Regular check-ups and hygiene visits for one simple monthly fee.']]]
];

function pageLibraryFor(page) {
  const match = PAGE_LIBRARY.find(([pattern]) => pattern.test(page));
  if (!match) return null;
  return { h1: match[1], intro: match[2], sections: match[3].map(([title, text]) => ({ title, text, bullets: [] })) };
}

function fallbackIntro(page, { businessName, industry, location }) {
  return `${page} at ${businessName}, ${/^[aeiou]/i.test(industry) ? 'an' : 'a'} ${industry.toLowerCase()}${location ? ` in ${location}` : ''}. Get in touch with any questions and we will be happy to help.`;
}

function audienceFor(nature) {
  return {
    care: 'Patients looking for trustworthy, friendly care',
    hospitality: 'Local guests and visitors looking for somewhere good to eat',
    commerce: 'Shoppers looking for quality products and easy delivery',
    professional: 'Individuals and businesses who need clear expert advice',
    fitness: 'People who want to get fitter with expert support',
    portfolio: 'Clients looking for original creative work',
    software: 'Teams looking for a faster way to work',
    property: 'Sellers, buyers, landlords and tenants',
    event: 'Attendees looking for a great experience',
    education: 'Students and parents looking for effective learning support',
    trades: 'Homeowners and businesses who need reliable work done',
    civic: 'Local residents, families and organisations'
  }[nature] || 'Local customers looking for a reliable service';
}

function slugish(value) {
  return String(value || 'mybusiness').toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '') || 'mybusiness';
}
