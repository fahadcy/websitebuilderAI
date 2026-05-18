const siteId=location.pathname.split('/').pop();
document.getElementById('preview-link').href=`/preview/${siteId}`;
document.getElementById('download-link').href=`/download/${siteId}`;
document.getElementById('deploy-form').action=`/deploy/${siteId}`;
fetch('/csrf').then(r=>r.json()).then(d=>document.getElementById('csrf').value=d.csrfToken);
fetch(`/api/sites/${siteId}`).then(r=>r.json()).then(site=>{
  const domain=site.domain_name||'No domain selected yet';
  document.getElementById('site-summary').textContent=`${site.business_name} is packaged and ready. Domain: ${domain}. Deployment status: ${site.deployment_status}.`;
  document.getElementById('domain-copy').textContent=site.domain_name?`${site.domain_name} is already written into canonical URLs, sitemap.xml, robots.txt, and the deployment README.`:'No domain was selected, but the package can still be attached by updating the domain settings before launch.';
});
