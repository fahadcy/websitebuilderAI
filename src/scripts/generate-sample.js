import 'dotenv/config';
import { migrate } from '../db/database.js';
import { generateSite } from '../generator/siteGenerator.js';

await migrate();

const prompt = 'A physiotherapy clinic in Manchester called PhysioPlus with a calm blue and white colour scheme';
const result = await generateSite(prompt, (event) => {
  console.log(`${event.progress || 0}% ${event.message || event.status}`);
});

console.log(`Sample generated: ${result.siteId}`);
