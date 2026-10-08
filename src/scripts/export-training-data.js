import 'dotenv/config';
import { exportTrainingData, mysqlTrainingStatus } from '../db/mysqlTrainingStore.js';

try {
  const result = await exportTrainingData({ outputDir: process.argv[2] });
  console.log(`Exported ${result.examples} training examples to ${result.examplesPath}`);
  console.log(`Exported ${result.events} RL events to ${result.eventsPath}`);
} catch (error) {
  console.error('Training export failed:', error.message);
  console.error('MySQL training status:', mysqlTrainingStatus());
  process.exit(1);
}
