const params = new URLSearchParams(location.search);
const job = params.get('job');
const startedAt = Date.now();
const progress = document.getElementById('progress');
const statusEl = document.getElementById('status');
const actions = document.getElementById('actions');
const steps = [...document.querySelectorAll('#steps li')];
const elapsedEl = document.getElementById('elapsed-time');
const remainingEl = document.getElementById('remaining-time');
const progressLabel = document.getElementById('progress-label');
const currentPhase = document.getElementById('current-phase');
const phaseDetail = document.getElementById('phase-detail');

const phaseMap = [
  { until: 9, key: 'prompt', title: 'Prompt intelligence', detail: 'Extracting the business profile, target audience, tone, goals, and must-have pages.' },
  { until: 18, key: 'strategy', title: 'Page strategy', detail: 'Planning page structure, conversion paths, and content requirements.' },
  { until: 23, key: 'keywords', title: 'Keyword research', detail: 'Creating primary, local, service, and long-tail keyword families for the site.' },
  { until: 31, key: 'copy', title: 'Content and keyword infusion', detail: 'Writing authentic text and placing keywords naturally using density targets.' },
  { until: 40, key: 'design', title: 'Design system', detail: 'Building layout direction, typography, colour tokens, header, footer, and responsive rhythm.' },
  { until: 50, key: 'images', title: 'Images and visual placement', detail: 'Generating or selecting images, then placing them for useful visual hierarchy.' },
  { until: 63, key: 'animation', title: 'Motion and interaction', detail: 'Adding scroll reveals, parallax behaviour, counters, accordions, and touch-safe interactions.' },
  { until: 73, key: 'cms', title: 'CMS and backend', detail: 'Creating admin screens, secure forms, submissions, settings, and editable content areas.' },
  { until: 82, key: 'seo', title: 'SEO packaging', detail: 'Writing metadata, schema, sitemap, robots, RSS feed, canonical URLs, and keyword report.' },
  { until: 90, key: 'qa', title: 'Reality Check Agent', detail: 'Testing links, assets, content depth, browser render signals, security, and production readiness.' },
  { until: 100, key: 'package', title: 'Final package', detail: 'Creating the ZIP, deployment notes, style guide, README, and final handoff files.' }
];

setInterval(updateTimer, 1000);
updateTimer();

if (!job) {
  statusEl.textContent = 'Missing job id.';
} else {
  const es = new EventSource(`/events/${job}`);

  es.onmessage = (event) => {
    const data = JSON.parse(event.data);
    const percent = Math.max(0, Math.min(100, Number(data.progress || 0)));
    progress.value = percent;
    progressLabel.textContent = `${percent}%`;
    statusEl.textContent = data.message || data.current_step || data.status;
    updatePhase(percent, statusEl.textContent);
    updateTimer(percent);

    if (data.status === 'complete') {
      es.close();
      progress.value = 100;
      progressLabel.textContent = '100%';
      remainingEl.textContent = 'Done';
      currentPhase.textContent = 'Website ready';
      phaseDetail.textContent = 'Preview, edit visually, download, or prepare deployment.';
      actions.innerHTML = `
        <a class="button" href="/preview/${data.siteId}">Preview</a>
        <a class="button" href="/editor/${data.siteId}">Visual Editor</a>
        <a class="button" href="/download/${data.siteId}">Download ZIP</a>
        <a class="button" href="/deploy/${data.siteId}">Deploy</a>
      `;
    }

    if (data.status === 'failed') {
      es.close();
      remainingEl.textContent = 'Stopped';
      actions.textContent = data.error || 'Generation failed';
    }
  };
}

function updatePhase(percent, message = '') {
  const phase = phaseMap.find((item) => percent <= item.until) || phaseMap[phaseMap.length - 1];
  currentPhase.textContent = message || phase.title;
  phaseDetail.textContent = phase.detail;
  steps.forEach((step) => {
    const stepPhase = phaseMap.find((item) => item.key === step.dataset.key);
    step.classList.toggle('active', step.dataset.key === phase.key);
    step.classList.toggle('done', stepPhase && percent > stepPhase.until);
  });
}

function updateTimer(percent = Number(progress.value || 0)) {
  const elapsedSeconds = Math.max(0, Math.round((Date.now() - startedAt) / 1000));
  elapsedEl.textContent = formatDuration(elapsedSeconds);
  if (!percent || percent < 4) {
    remainingEl.textContent = 'Calculating';
    return;
  }
  if (percent >= 100) {
    remainingEl.textContent = 'Done';
    return;
  }
  const totalEstimate = elapsedSeconds / (percent / 100);
  const left = Math.max(0, Math.round(totalEstimate - elapsedSeconds));
  remainingEl.textContent = `about ${formatDuration(left)}`;
}

function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}
