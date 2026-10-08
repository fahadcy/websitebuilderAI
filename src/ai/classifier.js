// Shared, score-based business classifier.
//
// Earlier versions used ordered `if (/fire|emergency/.test(text))` chains, so a single
// incidental word ("emergency appointments", "studio", "app") hijacked the whole site.
// Here every nature collects points from whole-word matches; strong, unambiguous terms
// score high and generic words score low, so "dentist ... emergency appointments"
// is clearly `care`, while "fire station" is clearly `civic`.

const NATURES = {
  care: {
    industry: 'Healthcare',
    strong: ['dentist', 'dentists', 'dental', 'orthodontist', 'orthodontics', 'invisalign', 'hygienist', 'physio', 'physiotherapy', 'physiotherapist', 'chiropractor', 'chiropractic', 'osteopath', 'osteopathy', 'clinic', 'gp surgery', 'doctor', 'doctors', 'medical', 'pharmacy', 'optician', 'opticians', 'optometrist', 'podiatrist', 'podiatry', 'dermatology', 'aesthetics clinic', 'veterinary', 'vets', 'vet practice', 'care home', 'counselling', 'counsellor', 'psychotherapy', 'therapist', 'massage therapy', 'beauty salon', 'hair salon', 'barber', 'barbers', 'salon', 'spa', 'nail bar'],
    weak: ['patients', 'patient', 'treatment', 'treatments', 'health', 'healthcare', 'wellness', 'therapy', 'appointment', 'appointments', 'implants', 'whitening', 'hygiene', 'nhs', 'cqc', 'injury', 'rehab', 'rehabilitation', 'beauty']
  },
  hospitality: {
    industry: 'Hospitality',
    strong: ['restaurant', 'cafe', 'café', 'coffee shop', 'bakery', 'patisserie', 'takeaway', 'bistro', 'pub', 'bar and grill', 'cocktail bar', 'wine bar', 'hotel', 'bed and breakfast', 'b&b', 'guest house', 'catering', 'food truck', 'pizzeria', 'deli'],
    weak: ['menu', 'dining', 'brunch', 'reservations', 'reservation', 'table', 'chef', 'food', 'drinks', 'sourdough', 'cakes', 'rooms']
  },
  commerce: {
    industry: 'Retail',
    strong: ['online shop', 'online store', 'ecommerce', 'e-commerce', 'boutique', 'shoe shop', 'clothing brand', 'fashion brand', 'jewellery', 'jewelry', 'florist', 'retailer'],
    weak: ['shop', 'store', 'retail', 'products', 'product', 'shoes', 'footwear', 'clothing', 'fashion', 'collection', 'checkout', 'delivery', 'sale']
  },
  professional: {
    industry: 'Professional Services',
    strong: ['solicitor', 'solicitors', 'law firm', 'lawyer', 'lawyers', 'barrister', 'accountant', 'accountants', 'accountancy', 'bookkeeping', 'insolvency', 'restructuring', 'financial adviser', 'financial advisor', 'mortgage broker', 'insurance broker', 'consultancy', 'recruitment agency', 'hr consultancy'],
    weak: ['legal', 'law', 'tax', 'finance', 'advisory', 'consultant', 'consulting', 'audit', 'compliance', 'professional']
  },
  fitness: {
    industry: 'Fitness',
    strong: ['gym', 'personal trainer', 'personal training', 'fitness studio', 'yoga studio', 'pilates studio', 'crossfit', 'boxing club', 'martial arts', 'dance school', 'swimming lessons'],
    weak: ['fitness', 'yoga', 'pilates', 'workout', 'classes', 'membership', 'strength', 'training sessions']
  },
  portfolio: {
    industry: 'Creative Studio',
    strong: ['portfolio', 'photographer', 'photography', 'videographer', 'illustrator', 'graphic designer', 'creative agency', 'design agency', 'branding agency', 'architect', 'architects', 'interior designer', 'artist'],
    weak: ['creative', 'design', 'branding', 'gallery', 'studio', 'projects']
  },
  software: {
    industry: 'Technology',
    strong: ['saas', 'software', 'web app', 'mobile app', 'startup', 'platform for', 'api', 'crm', 'it support', 'managed it', 'cyber security', 'cybersecurity', 'web development agency'],
    weak: ['app', 'platform', 'dashboard', 'automation', 'integrations', 'ai', 'cloud', 'tech', 'technology', 'digital']
  },
  property: {
    industry: 'Property',
    strong: ['estate agent', 'estate agents', 'letting agent', 'letting agency', 'property management', 'real estate', 'property developer', 'surveyor', 'surveyors'],
    weak: ['property', 'properties', 'homes', 'lettings', 'landlords', 'valuation', 'rent', 'apartments']
  },
  event: {
    industry: 'Events',
    strong: ['wedding venue', 'event venue', 'conference', 'festival', 'event planner', 'wedding planner', 'events company'],
    weak: ['event', 'events', 'tickets', 'venue', 'wedding', 'speakers', 'schedule']
  },
  education: {
    industry: 'Education',
    strong: ['school', 'nursery', 'tutor', 'tutoring', 'tuition', 'academy', 'college', 'university', 'driving school', 'language school', 'training provider', 'online course'],
    weak: ['education', 'students', 'student', 'courses', 'course', 'lessons', 'gcse', 'a-level', 'exam', 'learning', 'teacher']
  },
  trades: {
    industry: 'Home Services',
    strong: ['plumber', 'plumbing', 'electrician', 'electrical contractor', 'builder', 'builders', 'roofer', 'roofing', 'joiner', 'carpenter', 'landscaper', 'landscaping', 'gardener', 'cleaning company', 'cleaner', 'cleaners', 'removals', 'decorator', 'locksmith', 'heating engineer', 'boiler', 'kitchen fitter', 'garage', 'mechanic', 'car repair', 'mot'],
    weak: ['repairs', 'installation', 'quote', 'quotes', 'call out', 'callout', 'renovation', 'extension']
  },
  civic: {
    industry: 'Fire and Community Safety',
    strong: ['fire station', 'fire brigade', 'fire service', 'fire and rescue', 'police', 'council', 'charity', 'non-profit', 'nonprofit', 'community centre', 'church', 'mosque', 'temple', 'food bank', 'ambulance service', 'public safety'],
    weak: ['volunteer', 'volunteers', 'community', 'donate', 'donation', 'residents', 'safety advice']
  }
};

const INDUSTRY_LABELS = {
  care: [
    [/dentist|dental|orthodont|invisalign|hygienist/, 'Dental Practice'],
    [/physio|chiropract|osteopath|sports injury|rehab/, 'Physiotherapy Clinic'],
    [/vet|veterinary/, 'Veterinary Practice'],
    [/optician|optometrist/, 'Opticians'],
    [/salon|barber|beauty|nail|spa/, 'Beauty and Wellbeing'],
    [/counsell|psychotherap|therapist/, 'Therapy Practice'],
    [/care home/, 'Care Home']
  ],
  hospitality: [
    [/bakery|patisserie/, 'Bakery'],
    [/cafe|café|coffee/, 'Cafe'],
    [/hotel|guest house|b&b|bed and breakfast/, 'Hotel'],
    [/pub|bar\b|cocktail|wine bar/, 'Bar and Pub'],
    [/catering|food truck/, 'Catering'],
    [/restaurant|bistro|pizzeria|takeaway/, 'Restaurant']
  ],
  professional: [
    [/solicitor|law|lawyer|barrister|legal/, 'Law Firm'],
    [/accountan|bookkeep|tax/, 'Accountancy'],
    [/insolvency|restructuring/, 'Business Advisory'],
    [/recruitment/, 'Recruitment Agency']
  ],
  civic: [
    [/fire|rescue/, 'Fire and Community Safety'],
    [/police/, 'Policing and Public Safety'],
    [/charity|non-?profit|food bank/, 'Charity'],
    [/church|mosque|temple/, 'Faith Community'],
    [/council/, 'Local Council']
  ]
};

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countTerm(text, term) {
  const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(term)}(?=$|[^a-z0-9])`, 'g');
  return (text.match(pattern) || []).length;
}

/**
 * Score every nature against the text. Returns natures sorted by score.
 * @param {string} text
 */
export function scoreNatures(text) {
  const lower = ` ${String(text || '').toLowerCase()} `;
  return Object.entries(NATURES)
    .map(([nature, { strong, weak }]) => {
      let score = 0;
      for (const term of strong) score += Math.min(countTerm(lower, term), 3) * 5;
      for (const term of weak) score += Math.min(countTerm(lower, term), 3);
      return { nature, score };
    })
    .sort((a, b) => b.score - a.score);
}

/**
 * Classify a prompt into a project nature (care, hospitality, civic, ...).
 * Falls back to 'service' when nothing scores convincingly.
 */
export function classifyNature(text, fallback = 'service') {
  const [best] = scoreNatures(text);
  return best && best.score >= 2 ? best.nature : fallback;
}

/** Human-readable industry label, e.g. "Dental Practice". */
export function industryLabel(nature, text = '') {
  const lower = String(text || '').toLowerCase();
  const specific = (INDUSTRY_LABELS[nature] || []).find(([pattern]) => pattern.test(lower));
  if (specific) return specific[1];
  return NATURES[nature]?.industry || 'Local Service';
}

export function classifyBusiness(text) {
  const nature = classifyNature(text);
  return { nature, industry: industryLabel(nature, text) };
}

export const PROJECT_NATURES = [...Object.keys(NATURES), 'service'];
