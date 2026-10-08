import { classifyBusiness } from './classifier.js';

function inferTone(prompt) {
  const p = prompt.toLowerCase();
  if (p.includes('luxury')) return 'luxury';
  if (p.includes('bold')) return 'bold';
  if (p.includes('minimal')) return 'minimal';
  if (p.includes('friendly') || p.includes('calm')) return 'friendly';
  return 'professional';
}

function inferBusinessName(prompt) {
  const called = prompt.match(/called\s+([A-Za-z0-9&' -]+)/i);
  if (called) return called[1].replace(/\s+(with|in|for)\b.*$/i, '').trim();
  const forMatch = prompt.match(/\bfor\s+([A-Za-z0-9&' -]+?)(?=,|\s+a\s+|\s+an\s+|\s+with\b|\s+in\b|\.|$)/i);
  if (forMatch) return forMatch[1].trim();
  const businessIs = prompt.match(/\b(?:business is|business name is|name of the business is)\s+([A-Za-z0-9&' -]+?)(?=,|\s+the website|\s+website|\s+and\b|\.|$)/i);
  if (businessIs) return businessIs[1].trim();
  return 'Northstar Studio';
}

function inferIndustry(prompt) {
  const p = prompt.toLowerCase();
  const { nature, industry } = classifyBusiness(p);
  if (nature === 'civic' && /fire|rescue/.test(p)) return 'Fire and Community Safety';
  if (industry === 'Dental Practice') return 'Dental Clinic';
  if (industry === 'Physiotherapy Clinic') return 'Physiotherapy';
  if (industry === 'Law Firm') return 'Law Firm';
  if (industry === 'Business Advisory') return 'Business Advisory';
  if (nature === 'hospitality' && /restaurant|bistro|pizzeria|takeaway/.test(p)) return 'Restaurant';
  if (nature === 'fitness') return 'Fitness Studio';
  if (nature === 'software') return 'Software Platform';
  if (nature === 'commerce' && /shoe|footwear|trainer|sneaker/.test(p)) return 'Shoe Retail';
  return industry === 'Local Service' ? 'Professional Services' : industry;
}

export function fallbackBrief(prompt) {
  const businessName = inferBusinessName(prompt);
  const industry = inferIndustry(prompt);
  const tone = inferTone(prompt);
  const isPhysio = industry === 'Physiotherapy';
  const isShoe = industry === 'Shoe Retail';
  const isRestaurant = industry === 'Restaurant';
  const isSoftware = industry === 'Software Platform';
  const isAdvisory = industry === 'Business Advisory';
  const isDental = industry === 'Dental Clinic';
  const isGym = industry === 'Fitness Studio';
  const isCivic = industry === 'Fire and Community Safety';
  const heroHeadline = isShoe ? 'Clean shoe deals made easy to browse'
    : isCivic ? 'Emergency help, fire safety, and community support made clear'
    : isRestaurant ? 'A table worth planning your evening around'
    : isSoftware ? 'A clearer operating system for busy teams'
    : isAdvisory ? 'Calm advice when financial pressure is real'
    : isDental ? 'Calm dental care that feels easy to understand'
    : isGym ? 'Training that makes consistency easier'
    : isPhysio ? 'A calmer route back to confident movement'
    : 'A clearer way to choose the right service';
  const heroSubtext = isShoe ? `${businessName} is a clean, easy-to-shop footwear sale website built to help customers find stylish shoes at better prices.`
    : isCivic ? `${businessName} helps local residents understand emergency routes, fire prevention support, community programmes, and how to contact the right team quickly.`
    : isRestaurant ? `${businessName} helps diners discover the menu, feel the atmosphere, and reserve with confidence.`
    : isSoftware ? `${businessName} helps teams understand the product, see practical workflows, and request a useful demo.`
    : isAdvisory ? `${businessName} gives directors clear, confidential guidance through insolvency, restructuring, and financial distress decisions.`
    : isDental ? `${businessName} helps patients understand treatments, trust the team, and book without unnecessary stress.`
    : isGym ? `${businessName} helps people compare classes, memberships, and training options before taking a first session.`
    : isPhysio ? `${businessName} is a Manchester ${industry.toLowerCase()} clinic for people who want straight answers, careful treatment, and a plan they can actually follow.`
    : `${businessName} helps visitors understand the offer, see proof, and take the next step with confidence.`;
  return {
    businessName,
    industry,
    location: prompt.match(/\bin\s+([A-Za-z ]+)/i)?.[1]?.replace(/\s+(called|with)\b.*$/i, '').trim() || 'Manchester',
    colourScheme: { primary: '#0f5f86', secondary: '#e9f5f9', accent: '#55a7b3' },
    tone,
    pages: ['home', 'about', 'services', 'team', 'blog', 'contact', 'privacy'],
    services: isCivic ? ['Emergency response guidance', 'Home fire safety visits', 'Business fire safety checks', 'School and community visits', 'Volunteer support']
      : isShoe ? ['Leather trainers', 'Everyday flats', 'Smart loafers', 'Running shoes', 'Ankle boots', 'Occasion heels']
      : isRestaurant ? ['Charcoal small plates', 'Seasonal mains', 'Weekend brunch', 'Private dining', 'Signature desserts']
      : isSoftware ? ['Workflow dashboard', 'AI task routing', 'Team analytics', 'Automated reporting', 'Integrations']
      : isAdvisory ? ['Insolvency advice', 'Business restructuring', 'Director consultation', 'Creditor negotiation', 'Recovery planning']
      : isDental ? ['General check-ups', 'Hygiene appointments', 'Teeth whitening', 'Emergency dental care', 'Nervous patient support']
      : isGym ? ['Strength classes', 'Personal training', 'Membership plans', 'Mobility sessions', 'Open gym access']
      : isPhysio ? ['Sports injury rehabilitation', 'Back and neck pain treatment', 'Post-operative recovery', 'Running gait assessment', 'Clinical pilates']
      : ['Consultation', 'Planning', 'Delivery', 'Support'],
    teamMembers: [
      { name: 'Dr Amelia Hart', role: 'Clinical Director', bio: 'Leads evidence-based treatment plans with a calm, practical approach.' },
      { name: 'Samir Patel', role: 'Senior Therapist', bio: 'Specialises in movement assessment and progressive rehabilitation.' },
      { name: 'Lucy Bennett', role: 'Patient Care Lead', bio: 'Keeps every visit organised, welcoming, and focused on outcomes.' }
    ],
    tagline: isCivic ? 'Safety first. Clear routes. Local support.' : isRestaurant ? 'Good food. Easy booking.' : isSoftware ? 'Clear workflows. Better decisions.' : isAdvisory ? 'Confidential advice. Clear options.' : isGym ? 'Train well. Keep going.' : isShoe ? 'Clean deals. Better browsing.' : 'Clear service. Confident next steps.',
    heroHeadline,
    heroSubtext,
    aboutText: isCivic ? `${businessName} brings emergency guidance, prevention advice, local safety services, and community contact routes together in one clear public-service website.` : isShoe ? `${businessName} curates sale footwear with clear categories, simple guidance, and a shopping experience designed to attract more customers.` : isRestaurant ? `${businessName} brings menu, atmosphere, bookings, and local details together in a way that helps diners choose quickly.` : isSoftware ? `${businessName} presents product value, use cases, and demo conversion clearly for teams comparing software.` : isAdvisory ? `${businessName} supports directors and business owners with calm insolvency, restructuring, and advisory guidance when decisions need to be made carefully.` : `${businessName} is built around clear information, relevant proof, and a practical route from first visit to enquiry.`,
    seoKeywords: fallbackSeoKeywords({ businessName, industry, location: prompt.match(/\bin\s+([A-Za-z ]+)/i)?.[1]?.replace(/\s+(called|with)\b.*$/i, '').trim() || 'Manchester' }),
    googleMapsLat: '53.4808',
    googleMapsLng: '-2.2426',
    contactEmail: `hello@${businessName.toLowerCase().replace(/[^a-z0-9]/g, '')}.co.uk`,
    contactPhone: '0161 555 0148',
    address: '42 King Street, Manchester M2 7AT'
  };
}

export function fallbackContent(brief) {
  const isPhysio = brief.industry === 'Physiotherapy';
  const isShoe = brief.industry === 'Shoe Retail';
  const isRestaurant = brief.industry === 'Restaurant';
  const isSoftware = brief.industry === 'Software Platform';
  const isAdvisory = brief.industry === 'Business Advisory';
  const isDental = brief.industry === 'Dental Clinic';
  const isGym = brief.industry === 'Fitness Studio';
  const isCivic = brief.industry === 'Fire and Community Safety';
  const serviceOutcome = isCivic ? 'A clearer route from urgent need to the right public-safety action.' : isShoe ? 'A clearer route from browsing to finding the right pair at the right price.' : isRestaurant ? 'A clearer route from menu interest to booking or visiting.' : isSoftware ? 'A clearer route from product interest to demo request.' : isAdvisory ? 'A clearer route from financial pressure to a confidential, informed next step.' : isPhysio ? 'A clearer route from pain or uncertainty back to confident movement.' : 'A clearer route from enquiry to a confident decision.';
  return {
    hero: {
      headline: brief.heroHeadline,
      subtext: brief.heroSubtext,
      kicker: `${brief.location} ${brief.industry}`,
      primaryCta: isCivic ? 'Find the right contact' : isShoe ? 'Shop the sale' : isRestaurant ? 'Reserve a table' : 'Book a first conversation',
      secondaryCta: isCivic ? 'Read safety advice' : isShoe ? 'View size guide' : isRestaurant ? 'View menu highlights' : 'See how we work'
    },
    brandThesis: isCivic ? `${brief.businessName} is built for residents who need safety information quickly. The site separates urgent help, prevention advice, community programmes, and volunteer routes so visitors do not have to decode a generic services page.` : isShoe ? `${brief.businessName} is built for shoppers who want sale prices without a messy bargain-bin experience. The site makes stock feel curated, easy to compare, and simple to enquire about.` : isRestaurant ? `${brief.businessName} is built around appetite, atmosphere, and practical booking details. The website makes the menu easy to scan and the decision to visit feel natural.` : isSoftware ? `${brief.businessName} is built for teams who need to understand value quickly. The website shows the product promise, practical workflows, and the next step toward a demo.` : isAdvisory ? `${brief.businessName} is built for directors who need straight answers, confidentiality, and credible options before insolvency or restructuring decisions become harder to control.` : isPhysio ? `${brief.businessName} is built for people who want to understand pain, movement, treatment options, and recovery steps before they book. The site makes the clinic feel calm, credible, and practical from the first screen.` : `${brief.businessName} is built for visitors who need clear information, relevant proof, and a confident route to enquiry.`,
    aboutParagraphs: isShoe ? [
      `${brief.businessName} focuses on clean, easy-to-browse shoe offers for customers who want style and value without confusion.`,
      `Collections are organised around how people actually shop: everyday pairs, smarter options, new arrivals, and sale highlights that are easy to scan.`,
      `The goal is simple: help more customers find the right pair quickly, trust the offer, and take the next step.`
    ] : isRestaurant ? [
      `${brief.businessName} uses the website to make the dining decision easier: what is on the menu, what the atmosphere feels like, when to visit, and how to reserve.`,
      `The experience foregrounds signature dishes, location details, opening hours, and the kind of social proof that helps diners choose with confidence.`,
      `Every page keeps the practical next step close, whether that is booking, calling, finding directions, or browsing the menu.`
    ] : isSoftware ? [
      `${brief.businessName} explains the product through real workflows rather than vague feature claims.`,
      `The site is structured around the way teams evaluate software: problem, product fit, use cases, proof, pricing, and demo request.`,
      `The goal is to help visitors understand what changes for them if they use the platform.`
    ] : isAdvisory ? [
      `${brief.businessName} works with directors and business owners who need calm, confidential guidance when cash flow, creditors, or insolvency risk are creating pressure.`,
      `The website is structured to make difficult decisions easier to understand: what the warning signs mean, which options exist, and how a first conversation works.`,
      `Every page keeps the tone measured and professional, giving visitors enough clarity to take action without feeling exposed.`
    ] : [
      `${brief.businessName} was built around a simple idea: visitors should understand the offer quickly and feel confident about the next step.`,
      `The website brings together clear services, useful proof, direct contact routes, and content that answers real questions before people enquire.`,
      `The experience is practical, focused, and designed to help the right customers act without hunting for basic information.`
    ],
    differentiators: isShoe ? [
      { title: 'Curated sale edits', text: 'Sale products are grouped into clear collections instead of being buried in a generic product list.' },
      { title: 'Simple fit guidance', text: 'Sizing and buying notes reduce hesitation before customers enquire or purchase.' },
      { title: 'Trust before checkout', text: 'Reviews, delivery notes, and clear support routes make the shopping experience feel safer.' }
    ] : isRestaurant ? [
      { title: 'Menu before mystery', text: 'Signature items, practical notes, and booking actions are easy to find.' },
      { title: 'Atmosphere matters', text: 'Imagery and copy help visitors understand the experience before they arrive.' },
      { title: 'Booking made obvious', text: 'Reservations, opening hours, location, and contact details stay close to the decision.' }
    ] : isSoftware ? [
      { title: 'Workflow-first story', text: 'The product is explained through the work it improves, not a list of abstract features.' },
      { title: 'Demo-ready proof', text: 'Use cases, outcomes, and product sections make demo requests feel lower risk.' },
      { title: 'Clear product path', text: 'Visitors can move from problem to use case to pricing or contact without confusion.' }
    ] : isAdvisory ? [
      { title: 'Confidential first step', text: 'Directors can understand their options before a formal process or public pressure changes the conversation.' },
      { title: 'Practical restructuring advice', text: 'The site explains recovery, negotiation, and insolvency routes without frightening visitors or oversimplifying risk.' },
      { title: 'Credible professional tone', text: 'Copy, layout, and proof points are designed to feel composed, discreet, and commercially serious.' }
    ] : isPhysio ? [
      { title: 'Assessment before assumptions', text: 'Visitors see that treatment starts with movement history, symptoms, goals, and what daily life currently demands.' },
      { title: 'Treatment plans people can follow', text: 'The copy explains hands-on care, exercise guidance, review points, and home routines in plain language.' },
      { title: 'Confidence between sessions', text: 'FAQs, aftercare notes, and contact prompts reduce uncertainty before and after the first appointment.' }
    ] : [
      { title: 'Clear offer', text: 'Visitors can understand what is available and who it is for without reading a wall of generic copy.' },
      { title: 'Relevant proof', text: 'The site uses proof points that match the business type and visitor decision.' },
      { title: 'Obvious next step', text: 'Contact, booking, demo, or enquiry actions are positioned where the visitor is ready for them.' }
    ],
    services: brief.services.map((title) => ({
      title,
      description: fallbackServiceDescription(brief, title, { isShoe, isRestaurant, isSoftware, isAdvisory, isPhysio, isDental, isGym, isCivic }),
      bullets: fallbackServiceBullets({ isShoe, isRestaurant, isSoftware, isAdvisory, isPhysio, isDental, isGym, isCivic }),
      outcome: serviceOutcome
    })),
    processSteps: isShoe ? [
      { title: 'Find the offer', text: 'Visitors land on a clear sale message and can move straight into categories or featured pairs.' },
      { title: 'Compare quickly', text: 'Product cards show style, price, and fit notes without making the customer work too hard.' },
      { title: 'Ask or buy', text: 'Every shopping page keeps the next step visible, from enquiry to newsletter signup.' }
    ] : isAdvisory ? [
      { title: 'Speak confidentially', text: 'The first conversation helps clarify the pressure, the immediate risks, and what needs protecting first.' },
      { title: 'Understand the options', text: 'Visitors see that restructuring, negotiation, rescue, and insolvency routes can be compared before decisions are made.' },
      { title: 'Act with control', text: 'The next step is positioned as calm professional guidance, not panic or a hard sell.' }
    ] : [
      { title: 'Listen properly', text: 'The first stage is not a sales pitch. It is a focused conversation about symptoms, goals, daily demands, and what has already been tried.' },
      { title: 'Map the route', text: 'Visitors see how assessment, treatment, guidance, and review points fit together before they commit.' },
      { title: 'Make action easy', text: 'The design keeps booking, calling, and asking a question visible without making the page feel pushy.' }
    ],
    trustSignals: isShoe ? ['Clear sale pricing', 'Size guidance', 'Customer support', 'Easy product browsing'] : isAdvisory ? ['Confidential consultations', 'Director-focused advice', 'Restructuring options', 'Measured professional guidance'] : isPhysio ? [`${brief.location}-based clinic`, 'Clear treatment plans', 'Evidence-led decisions', 'Practical home guidance'] : [`${brief.location}-based team`, 'Clear service route', 'Relevant proof', 'Practical guidance'],
    localProof: isShoe ? `${brief.businessName} is positioned as a clean, trustworthy shoe sale brand with a shopping journey designed to attract more customers.` : isAdvisory ? `Based in ${brief.location}, ${brief.businessName} is positioned for directors who need confidential business advisory, insolvency, and restructuring guidance before pressure escalates.` : isPhysio ? `Based in ${brief.location}, ${brief.businessName} is positioned for people comparing physiotherapy care, recovery plans, movement confidence, and a clear route to booking.` : `Based in ${brief.location}, ${brief.businessName} is positioned as a local specialist with enough polish to reassure private clients and enough clarity to convert cautious first-time visitors.`,
    researchBrief: {
      marketContext: isShoe
        ? 'Footwear shoppers compare style, price, size confidence, returns reassurance, and whether the store feels trustworthy before asking about stock.'
        : isRestaurant
          ? 'Restaurant visitors want to understand menu style, atmosphere, opening details, location, booking friction, and whether the place fits the occasion.'
          : isSoftware
            ? 'Software buyers compare workflow fit, integrations, pricing expectations, implementation effort, proof, and how easy it is to book a demo.'
            : isAdvisory
              ? 'Professional advisory visitors are usually cautious. They compare confidentiality, competence, sector relevance, likely next steps, and whether contacting the firm feels low risk.'
              : `${brief.industry} visitors usually compare trust, clarity, local relevance, proof, and the ease of taking the first step before they enquire.`,
      visitorObjections: isShoe
        ? ['Is my size available?', 'Are the prices and product notes clear?', 'Can I trust delivery, returns, and support?']
        : isAdvisory
          ? ['Will the first conversation be confidential?', 'Is this firm credible enough for a serious situation?', 'What happens after I send a message?']
          : ['Can I trust this business?', 'Is this service right for my situation?', 'What happens after I make contact?'],
      proofRequired: isShoe
        ? ['Product categories', 'Sale pricing', 'Fit guidance', 'Delivery and support reassurance', 'Customer reviews']
        : isAdvisory
          ? ['Confidential first step', 'Service routes', 'Senior-led process', 'Useful FAQs', 'Local and sector relevance']
          : ['Clear services', 'Specific process', 'Testimonials', 'Useful FAQs', `${brief.location} relevance`],
      localSeoAngle: `Connect ${brief.industry} intent with ${brief.location} search language, service detail, FAQs, and a clear contact route.`,
      contentGaps: ['Exact prices, opening hours, certifications, named case studies, and real customer quotes should be supplied by the operator if they matter.']
    },
    layoutGuidance: {
      header: 'Use a visible sticky header with brand, concise navigation, and one primary action. Keep it usable on mobile.',
      hero: 'Use a balanced first viewport with a specific headline, trust signal, CTA, and relevant visual or proof panel.',
      sectionRhythm: 'Alternate proof, services, process, FAQ, visual, and CTA sections with consistent spacing and constrained text widths.',
      mobile: 'Stack grids cleanly, preserve tap targets, keep navigation visible, and prevent horizontal overflow.',
      ctaPlacement: 'Place the main action above the fold, after proof, and again in the final CTA.'
    },
    seoStrategy: {
      primaryKeywords: fallbackSeoKeywords(brief).primary,
      secondaryKeywords: fallbackSeoKeywords(brief).secondary,
      localModifiers: fallbackSeoKeywords(brief).localModifiers,
      pageKeywordMap: {
        Home: fallbackSeoKeywords(brief).primary.slice(0, 3),
        Services: brief.services.slice(0, 5).map((service) => `${service} ${brief.location}`),
        Contact: [`${brief.industry} ${brief.location}`, `${brief.businessName} contact`]
      },
      densityTargets: { primary: '0.8-1.4%', secondary: '0.2-0.7%' },
      naturalUsageNotes: 'Use search terms in headings, service copy, FAQs, and local proof only where they read naturally.'
    },
    conversionPrompts: isShoe ? [
      { title: 'Looking for a specific size?', text: 'Send a quick enquiry and the team can confirm what is available.', cta: 'Ask about stock' },
      { title: 'Want the best deals first?', text: 'Join the list for sale drops and new arrivals.', cta: 'Join the newsletter' }
    ] : isRestaurant ? [
      { title: 'Planning a table?', text: 'Send your party size, preferred time, and any dietary notes so the team can confirm the best option.', cta: 'Reserve a table' },
      { title: 'Want menu updates?', text: 'Join the list for seasonal dishes, private dining notes, and special evening announcements.', cta: 'Join the list' }
    ] : [
      { title: 'Not sure what you need?', text: 'Send a short note about what is happening and the team will suggest the most useful first step.', cta: 'Ask a question' },
      { title: 'Ready to book?', text: 'Choose a first appointment and arrive with a clear plan for what will be assessed.', cta: 'Book now' }
    ],
    imageDirection: {
      heroSeed: isShoe ? 'premium shoe retail display' : `${brief.industry} ${brief.location} premium interior`,
      serviceSeed: isShoe ? 'shoe product photography' : `${brief.industry} careful consultation`,
      textureSeed: isShoe ? 'leather shoe detail' : `${brief.industry} detail`
    },
    teamMembers: brief.teamMembers,
    blogPosts: isShoe ? [
      { title: 'How to choose everyday shoes that still feel polished', intro: 'A simple guide to buying versatile shoes that work harder in your wardrobe.', category: 'Buying guide' },
      { title: 'What to check before buying sale shoes online', intro: 'Fit, returns, materials, and product details worth checking before you commit.', category: 'Sale advice' }
    ] : isRestaurant ? [
      { title: 'How to choose the right table for a special evening', intro: 'A practical guide to booking time, menu style, dietary notes, and the small details that make dinner feel considered.', category: 'Dining guide' },
      { title: 'What makes a seasonal menu worth returning for', intro: 'A look at ingredients, atmosphere, pacing, and service details that turn a meal into a reason to come back.', category: 'Menu notes' }
    ] : isAdvisory ? [
      { title: 'What directors should do when cash flow becomes uncertain', intro: 'A practical guide to spotting pressure early, protecting decision-making, and starting a confidential business advisory conversation before options narrow.', category: 'Director advice' },
      { title: 'Restructuring options before insolvency becomes unavoidable', intro: 'How creditor negotiation, operational review, and measured restructuring advice can help business owners understand the route ahead.', category: 'Restructuring' }
    ] : [
      { title: 'How to build confidence after an injury', intro: 'A practical guide to pacing, strength, and knowing when to progress.', category: 'Recovery' },
      { title: 'Five signs your desk setup is affecting your movement', intro: 'Small changes that can reduce stiffness during a long working week.', category: 'Advice' }
    ],
    faqs: isShoe ? [
      { question: 'How do I check if my size is available?', answer: 'Use the enquiry button on any product and include your usual UK size. The team can confirm availability before you commit.' },
      { question: 'Are sale shoes returnable?', answer: 'Sale items should still have clear return guidance. The site highlights fit notes and return information before purchase.' },
      { question: 'How often do new shoes arrive?', answer: 'New arrivals can be promoted weekly or whenever a fresh drop is added through the CMS.' },
      { question: 'Can I ask for style advice?', answer: 'Yes. Customers can send a short message about the occasion, size, and preferred style.' },
      { question: 'Do you offer newsletter-only deals?', answer: 'The newsletter is set up for sale alerts, new arrivals, and early access messages.' }
    ] : isRestaurant ? [
      { question: 'Do I need to book in advance?', answer: 'Booking ahead is recommended for evenings and weekends, especially for larger groups or special occasions.' },
      { question: 'Can you handle dietary requirements?', answer: 'Yes. Guests should mention allergies, vegetarian choices, vegan preferences, or other dietary needs when reserving.' },
      { question: 'Do you offer private dining?', answer: 'Private dining can be promoted for celebrations, business meals, and small events where a more focused space is useful.' },
      { question: 'Where can I find opening hours?', answer: 'Opening hours, contact details, and directions are kept close to the reservation and contact sections.' },
      { question: 'Can I see menu highlights before booking?', answer: 'Yes. The website can show seasonal dishes, signature plates, drinks notes, and popular choices before guests enquire.' }
    ] : isAdvisory ? [
      { question: 'Is the first conversation confidential?', answer: 'Yes. The first step is a private discussion about the pressure on the business, the immediate risks, and the options that may still be available.' },
      { question: 'When should a director ask for insolvency advice?', answer: 'Directors should ask for advice as soon as cash flow, creditor pressure, tax arrears, or trading uncertainty starts affecting decisions.' },
      { question: 'Do you only help once insolvency is unavoidable?', answer: 'No. Early business advisory and restructuring support can sometimes preserve more options than waiting until the position has deteriorated.' },
      { question: 'Can you speak to creditors or help with negotiation?', answer: 'Yes. Creditor negotiation can be part of a wider restructuring or recovery plan when it is suitable for the business position.' },
      { question: 'What information should I prepare?', answer: 'Recent accounts, creditor details, HMRC position, cash-flow notes, and any urgent legal correspondence are useful, but a first conversation can begin before everything is complete.' }
    ] : [
      { question: 'Do I need a referral?', answer: 'No referral is needed. You can book directly and we will advise if GP input is appropriate.' },
      { question: 'How long is an appointment?', answer: 'Initial consultations are usually 45 minutes, with follow-ups around 30 minutes.' },
      { question: 'What should I wear?', answer: 'Wear comfortable clothing that lets you move freely.' },
      { question: 'Can you help with sports injuries?', answer: 'Yes. We treat recreational and competitive athletes with progressive rehabilitation plans.' },
      { question: 'Do you offer evening appointments?', answer: 'Selected evening appointments are available during the week.' }
    ],
    testimonials: isShoe ? [
      { name: 'Maya R.', quote: 'The sale page made it easy to spot the good pairs quickly. I found my size and asked about delivery in one message.', context: 'Sale customer' },
      { name: 'Hannah T.', quote: 'It felt much cleaner than most discount shoe sites. The product notes helped me choose without scrolling forever.', context: 'Returning customer' },
      { name: 'Leah S.', quote: 'I joined for the new arrival alerts and ended up buying two pairs from the next drop.', context: 'Newsletter subscriber' }
    ] : isRestaurant ? [
      { name: 'Amelia R.', quote: 'The menu felt easy to understand before we booked, and the evening matched the atmosphere promised on the site.', context: 'Dinner guest' },
      { name: 'Marcus H.', quote: 'We booked for a birthday and the details were handled without fuss. It felt warm, polished, and personal.', context: 'Private dining enquiry' },
      { name: 'Nina P.', quote: 'The opening hours, location, and booking route were clear. That made choosing a table very easy.', context: 'Weekend booking' }
    ] : isAdvisory ? [
      { name: 'Managing Director', quote: 'The advice was calm, direct, and confidential. We understood our position properly before making decisions that affected staff and creditors.', context: 'Business restructuring' },
      { name: 'Company Founder', quote: 'They explained the insolvency risks without alarmism and gave us a practical plan for the next seven days.', context: 'Director consultation' },
      { name: 'Finance Director', quote: 'The value was clarity. We left knowing which conversations mattered, what to prepare, and where pressure could be reduced.', context: 'Creditor negotiation' }
    ] : [
      { name: 'Rebecca M.', quote: 'I came in worried I would be told to stop running. Instead I left with a plan, a timeline, and a way to train without guessing.', context: 'Returning runner' },
      { name: 'Daniel K.', quote: 'The difference was the explanation. I understood what was causing the pain and what each exercise was meant to change.', context: 'Back pain support' },
      { name: 'Nadia S.', quote: 'It felt professional without being cold. Every appointment moved things forward.', context: 'Post-operative rehab' }
    ],
    stats: isShoe ? [{ label: 'Sale pairs curated', value: 420 }, { label: 'Average review', value: 49 }, { label: 'Style categories', value: 12 }] : isRestaurant ? [{ label: 'Covers each week', value: 620 }, { label: 'Average guest review', value: 48 }, { label: 'Seasonal menu changes', value: 12 }] : isAdvisory ? [{ label: 'Director conversations', value: 680 }, { label: 'Average response time', value: 24 }, { label: 'Years advisory experience', value: 32 }] : [{ label: 'Patients helped', value: 2400 }, { label: 'Average review', value: 49 }, { label: 'Years combined experience', value: 38 }],
    microcopy: isShoe ? {
      contactHint: 'Send the style, size, or occasion you have in mind and the team will help you find the best available pair.',
      newsletter: 'Sale drops, new arrivals, and useful buying notes.',
      bookingReassurance: 'Clear stock, fit, and delivery information before customers enquire.'
    } : isRestaurant ? {
      contactHint: 'Send the date, time, party size, and any dietary notes so the team can respond with the right booking option.',
      newsletter: 'Seasonal menu notes, private dining updates, and useful booking reminders.',
      bookingReassurance: 'Clear booking details, opening hours, menu highlights, and directions before guests commit.'
    } : isAdvisory ? {
      contactHint: 'Send a confidential note about the pressure on the business. A short outline is enough to begin.',
      newsletter: 'Measured notes for directors, restructuring decisions, creditor pressure, and early warning signs.',
      bookingReassurance: 'Private first conversation. No public commitment, no pressure, and no assumptions before the position is understood.'
    } : {
      contactHint: 'A short message is enough. The team will help you choose the right next step.',
      newsletter: 'Useful notes, not inbox noise.',
      bookingReassurance: 'No referral needed. We will tell you if another route is more appropriate.'
    },
    privacyPolicy: isShoe ? `${brief.businessName} collects only the information needed to respond to product enquiries, manage newsletter signups, and improve the shopping experience. Personal data is handled securely and never sold.` : isRestaurant ? `${brief.businessName} collects only the information needed to manage booking enquiries, dietary notes, newsletter signups, and guest communications. Personal data is handled securely and never sold.` : isAdvisory ? `${brief.businessName} collects only the information needed to respond to confidential business advisory enquiries, manage contact requests, and provide relevant follow-up. Personal data is handled securely and never sold.` : `${brief.businessName} collects only the information needed to respond to enquiries, manage appointments, and improve the service. Personal data is handled securely and never sold.`
  };
}

function fallbackSeoKeywords(brief) {
  const industry = String(brief.industry || 'service').toLowerCase();
  const location = brief.location || 'Manchester';
  const business = brief.businessName || 'local business';
  const services = Array.isArray(brief.services) ? brief.services : [];
  return {
    primary: [
      `${industry} in ${location}`,
      `${location} ${industry}`,
      `${business} ${industry}`
    ],
    secondary: services.slice(0, 6).flatMap((service) => [`${service} ${location}`, `${service} near me`]).slice(0, 10),
    localModifiers: [location, `near ${location}`, `${location} city centre`, 'local', 'near me']
  };
}

function fallbackServiceDescription(brief, title, flags) {
  if (brief.industry === 'Fire and Community Safety') return `${title} is presented with public-service clarity: what the visitor should do, when it is urgent, what information to prepare, and which contact route is appropriate.`;
  if (flags.isShoe) return `${title} is presented with sale-aware product copy, clear style notes, likely use cases, and enough buying confidence for visitors to compare pairs without feeling lost.`;
  if (flags.isRestaurant) return `${title} is written as a genuine menu highlight, connecting ingredients, atmosphere, visit timing, and booking intent so diners can picture the experience before they arrive.`;
  if (flags.isSoftware) return `${title} is framed around the workflow it improves, the pressure it removes from teams, and the practical reason a visitor should request a demo.`;
  if (flags.isAdvisory) return `${title} is explained with a discreet professional tone, outlining the risk it addresses, the options a director may have, and why early confidential advice can protect control.`;
  if (flags.isPhysio) return `${title} explains who the treatment is for, what usually happens in the first session, how progress is reviewed, and why a clear plan matters for recovery.`;
  if (flags.isDental) return `${title} is described with patient reassurance, treatment expectations, comfort notes, and a direct booking route for people comparing local dental options.`;
  if (flags.isGym) return `${title} explains the training style, who it suits, how beginners can start, and what outcome members should expect after the first few weeks.`;
  return `${title} is explained with visitor-focused benefits, real decision points, proof cues, and a practical next step so the page feels useful rather than decorative.`;
}

function fallbackServiceBullets(flags) {
  if (flags.isCivic) return ['Urgent and non-urgent routes separated', 'Plain safety guidance', 'Clear next contact step'];
  if (flags.isShoe) return ['Sale price context and product value', 'Fit, material, and styling guidance', 'Quick route to enquiry or purchase'];
  if (flags.isRestaurant) return ['Ingredient or menu detail', 'Best time or occasion to book', 'Reservation and location cue'];
  if (flags.isSoftware) return ['Workflow before and after', 'Role-specific use case', 'Demo or integration prompt'];
  if (flags.isAdvisory) return ['Confidential first conversation', 'Risks and options explained clearly', 'Next step without public pressure'];
  if (flags.isPhysio) return ['Who this treatment helps', 'What happens in session one', 'How progress is measured'];
  if (flags.isDental) return ['What the patient can expect', 'Comfort and reassurance note', 'Booking or emergency route'];
  if (flags.isGym) return ['Who the session suits', 'Training intensity and support', 'Membership or first-session CTA'];
  return ['Visitor problem addressed', 'Proof or process detail', 'Low-friction next step'];
}

export function fallbackTokens(brief) {
  const isCare = /physio|physiotherapy|clinic|dental|health|therapy|medical|wellness/i.test(`${brief.industry || ''} ${brief.tone || ''}`);
  return {
    colors: {
      primary: brief.colourScheme.primary,
      secondary: brief.colourScheme.secondary,
      accent: brief.colourScheme.accent,
      ink: '#122026',
      surface: '#ffffff',
      muted: '#5d7078',
      darkSurface: '#10191d',
      darkInk: '#f5fbfd'
    },
    fonts: { display: isCare ? 'Manrope' : 'Source Serif 4', body: 'Inter' },
    radius: { sm: '6px', md: '10px', lg: '18px' },
    shadow: { sm: '0 10px 28px rgba(15, 95, 134, .08)', md: '0 24px 70px rgba(18, 32, 38, .12)' },
    spacing: { xs: '.5rem', sm: '1rem', md: '1.5rem', lg: '2.5rem', xl: '4rem' }
  };
}
