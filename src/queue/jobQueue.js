import { EventEmitter } from 'node:events';
import crypto from 'node:crypto';
import { db } from '../db/database.js';
import { generateSite } from '../generator/siteGenerator.js';

class JobQueue extends EventEmitter {
  constructor() {
    super();
    this.jobs = new Map();
    this.running = false;
  }

  create(prompt, ip, metadata = {}) {
    const id = crypto.randomUUID();
    const job = { id, prompt, metadata, status: 'queued', progress: 0, events: [] };
    this.jobs.set(id, job);
    db.prepare('INSERT INTO generation_jobs (id, prompt, metadata, status, created_ip, current_step) VALUES (?, ?, ?, ?, ?, ?)').run(id, prompt, JSON.stringify(metadata), 'queued', ip, 'Queued');
    this.process(id);
    return job;
  }

  get(id) {
    return this.jobs.get(id) || db.prepare('SELECT * FROM generation_jobs WHERE id = ?').get(id);
  }

  emitProgress(id, payload) {
    const job = this.jobs.get(id);
    if (job) {
      Object.assign(job, payload);
      job.events.push(payload);
    }
    db.prepare('UPDATE generation_jobs SET status = ?, progress = ?, current_step = ?, site_id = COALESCE(?, site_id), error = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
      .run(payload.status || job?.status || 'running', payload.progress || job?.progress || 0, payload.message || '', payload.siteId || null, payload.error || null, id);
    this.emit(id, payload);
  }

  async process(id) {
    setTimeout(async () => {
      const job = this.jobs.get(id);
      if (!job) return;
      try {
        this.emitProgress(id, { status: 'running', progress: 3, message: 'Analysing your prompt' });
        const result = await generateSite(job.prompt, (event) => this.emitProgress(id, event), job.metadata);
        this.emitProgress(id, { status: 'complete', progress: 100, message: 'Website ready', siteId: result.siteId, zipUrl: `/download/${result.siteId}` });
      } catch (error) {
        this.emitProgress(id, { status: 'failed', progress: 100, message: 'Generation failed', error: error.message });
      }
    }, 50);
  }
}

export const jobQueue = new JobQueue();
