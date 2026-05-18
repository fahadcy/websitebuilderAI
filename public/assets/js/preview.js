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

feedbackForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  feedbackStatus.textContent = 'Saving learning...';
  const formData = new FormData(feedbackForm);
  const payload = Object.fromEntries(formData.entries());
  const response = await fetch(`/api/sites/${siteId}/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ ...payload, _csrf: csrfToken })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    feedbackStatus.textContent = data.error || 'Could not save feedback.';
    return;
  }
  const data = await response.json();
  feedbackStatus.textContent = `Saved. ${data.learningRules} learning signal${data.learningRules === 1 ? '' : 's'} now influence future sites.`;
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
