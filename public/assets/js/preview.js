const siteId = location.pathname.split('/').pop();
const frame = document.getElementById('frame');
const realityPanel = document.getElementById('reality-panel');
const realityScore = document.getElementById('reality-score');
const realitySummary = document.getElementById('reality-summary');
const realityIssues = document.getElementById('reality-issues');
const feedbackPanel = document.getElementById('feedback-panel');
const feedbackForm = document.getElementById('feedback-form');
const feedbackStatus = document.getElementById('feedback-status');
let csrfToken = '';
let realityDismissed = false;

frame.src = `/generated-sites/${siteId}/index.html`;
document.getElementById('edit').href = `/editor/${siteId}`;
document.getElementById('download').href = `/download/${siteId}`;
document.getElementById('deploy').href = `/deploy/${siteId}`;

fetch('/csrf').then((response) => response.json()).then((data) => {
  csrfToken = data.csrfToken;
});

fetch(`/api/sites/${siteId}`).then((response) => response.json()).then((site) => {
  document.getElementById('site-name').textContent = site.domain_name ? `${site.business_name} - ${site.domain_name}` : site.business_name;
});

document.querySelectorAll('[data-size]').forEach((button) => button.addEventListener('click', () => {
  frame.style.width = button.dataset.size;
}));

document.addEventListener('click', (event) => {
  if (!event.target.closest('#close-reality')) return;
  realityDismissed = true;
  realityPanel.hidden = true;
});

document.getElementById('open-feedback').addEventListener('click', () => {
  feedbackPanel.hidden = false;
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('#close-feedback')) return;
  feedbackPanel.hidden = true;
});

document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  realityDismissed = true;
  realityPanel.hidden = true;
  feedbackPanel.hidden = true;
});

let teachContext = null;

async function loadTeachContext() {
  try {
    const response = await fetch(`/api/sites/${siteId}/teach-context`);
    if (!response.ok) throw new Error('unavailable');
    teachContext = await response.json();
  } catch {
    document.getElementById('teach-built').textContent = '';
    return;
  }
  const { design, options, industry, profile } = teachContext;
  const built = [design.directionName && `Style: ${design.directionName}`, design.mode && `${design.mode} theme`].filter(Boolean).join(' - ');
  const applied = design.learnedSummary?.length ? ` Built using earlier lessons: ${design.learnedSummary.join(', ')}.` : '';
  document.getElementById('teach-built').textContent = `${built || 'Design details not recorded for this older site.'}${applied}`;
  document.getElementById('teach-style-name').textContent = design.directionName
    ? `This site used the "${design.directionName}" style. Should the engine use it for ${industry} sites?`
    : 'Style details were not recorded for this older site.';
  document.getElementById('teach-scope-industry').textContent = `${industry} sites`;

  document.getElementById('teach-aspects').innerHTML = options.aspects.map((aspect) => `
    <div class="teach-row" role="radiogroup" aria-label="${escapeHtml(aspect.label)} score">
      <span class="teach-label">${escapeHtml(aspect.label)}</span>
      <div class="teach-seg teach-seg-tight">${[1, 2, 3, 4, 5].map((n) => `<label><input type="radio" name="aspect_${aspect.id}" value="${n}"><span>${n}</span></label>`).join('')}</div>
    </div>`).join('');

  document.getElementById('teach-dials').innerHTML = options.dials.map((dial) => `
    <div class="teach-row" role="radiogroup" aria-label="${escapeHtml(dial.label)}">
      <span class="teach-label">${escapeHtml(dial.label)}</span>
      <div class="teach-seg">${dial.options.map((label, index) => `<label><input type="radio" name="dial_${dial.id}" value="${index - 1}"${index === 1 ? ' checked' : ''}><span>${escapeHtml(label)}</span></label>`).join('')}</div>
    </div>`).join('');

  const sections = design.sections || [];
  document.getElementById('teach-sections').innerHTML = sections.length
    ? sections.map((section) => `
      <div class="teach-row" role="radiogroup" aria-label="${escapeHtml(section.label)}">
        <span class="teach-label">${escapeHtml(section.label)}${section.variant && !['on', 'default', 'interactive'].includes(section.variant) ? ` <small>${escapeHtml(section.variant)} layout</small>` : ''}</span>
        <div class="teach-seg teach-seg-tight">
          <label><input type="radio" name="section_${section.kind}" value="1"><span aria-label="Liked">&#128077;</span></label>
          <label><input type="radio" name="section_${section.kind}" value="-1"><span aria-label="Disliked">&#128078;</span></label>
        </div>
      </div>`).join('')
    : '<p class="teach-hint">Section details were not recorded for this older site. Generate a new site to rate individual sections.</p>';

  document.getElementById('teach-issues').innerHTML = options.issues.map((issue) => `
    <label><input type="checkbox" name="issue" value="${issue.id}"><span>${escapeHtml(issue.label)}</span></label>`).join('');

  renderProfile(profile);
}

function renderProfile(profile) {
  const box = document.getElementById('teach-profile');
  const list = document.getElementById('teach-profile-list');
  if (!profile || !profile.summary?.length) { box.hidden = true; return; }
  list.innerHTML = profile.summary.map((line) => `<li>${escapeHtml(line)}</li>`).join('') + `<li class="teach-hint">From ${profile.samples} piece${profile.samples === 1 ? '' : 's'} of feedback for ${escapeHtml(teachContext?.industry || 'this industry')} (plus "all sites" lessons).</li>`;
  box.hidden = false;
}

function collectTeachPayload() {
  const formData = new FormData(feedbackForm);
  const details = { aspects: {}, dials: {}, sections: {}, issues: formData.getAll('issue'), style: formData.get('style') || null, scope: formData.get('scope') || 'industry', missed: formData.get('missed') || '', imageNotes: formData.get('imageNotes') || '' };
  for (const [key, value] of formData.entries()) {
    if (key.startsWith('aspect_')) details.aspects[key.slice(7)] = Number(value);
    else if (key.startsWith('dial_') && Number(value) !== 0) details.dials[key.slice(5)] = Number(value);
    else if (key.startsWith('section_')) details.sections[key.slice(8)] = Number(value);
  }
  return {
    rating: formData.get('rating') || '',
    category: formData.get('category') || 'general',
    positives: formData.get('positives') || '',
    negatives: formData.get('negatives') || '',
    suggestedChanges: formData.get('suggestedChanges') || '',
    details
  };
}

loadTeachContext();

feedbackForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const payload = collectTeachPayload();
  if (!payload.rating) {
    feedbackStatus.textContent = 'Pick an overall rating (1-5) first.';
    feedbackForm.querySelector('input[name="rating"]').focus();
    return;
  }
  feedbackStatus.textContent = 'Saving learning...';
  const submit = feedbackForm.querySelector('button[type="submit"]');
  submit.disabled = true;
  let response;
  try {
    response = await fetch(`/api/sites/${siteId}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
      body: JSON.stringify({ ...payload, _csrf: csrfToken })
    });
  } catch {
    feedbackStatus.textContent = 'Could not reach the server. Your answers are still here - try again.';
    submit.disabled = false;
    return;
  }
  submit.disabled = false;
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    feedbackStatus.textContent = data.error || 'Could not save feedback.';
    return;
  }
  const data = await response.json();
  const created = data.signalsCreated || 0;
  const learned = created
    ? `${created} lesson${created === 1 ? '' : 's'} learned.`
    : 'Rating saved. Use the dials, issues or text boxes to teach the engine something specific.';
  const logNote = data.logSaved ? ' Added to the Teach Builder log.' : '';
  const mysqlNote = data.mysqlSaved ? ' MySQL mirror updated.' : '';
  feedbackStatus.textContent = `Saved. ${learned}${logNote}${mysqlNote}`;
  renderProfile(data.profile);
  feedbackForm.reset();
});

document.getElementById('recheck').addEventListener('click', async () => {
  realityDismissed = false;
  realityPanel.hidden = false;
  realityScore.textContent = 'Running...';
  realitySummary.textContent = 'Testing structure, broken links, SEO, security, UX, CMS files, and performance signals.';
  realityIssues.innerHTML = '';
  const response = await fetch(`/api/sites/${siteId}/reality-check`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ _csrf: csrfToken })
  });
  renderRealityCheck(await response.json());
});

loadRealityCheck();

async function loadRealityCheck() {
  const response = await fetch(`/api/sites/${siteId}/reality-check`);
  renderRealityCheck(await response.json());
}

function renderRealityCheck(report) {
  if (!realityDismissed) realityPanel.hidden = false;
  realityScore.textContent = report.score === null ? 'Not run' : `${report.score}/100`;
  realitySummary.textContent = report.summary || 'No report available yet.';
  const issues = [...(report.blockers || []), ...(report.warnings || [])].slice(0, 6);
  realityIssues.innerHTML = issues.length
    ? issues.map((issue) => `<li><strong>${escapeHtml(issue.severity)}</strong> ${escapeHtml(issue.name)} <span>${escapeHtml(issue.detail)}</span></li>`).join('')
    : '<li><strong>pass</strong> No visible blockers in the current report.</li>';
}

function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
}
