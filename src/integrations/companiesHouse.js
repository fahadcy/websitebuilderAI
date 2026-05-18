const API_ROOT = 'https://api.company-information.service.gov.uk';

export async function searchCompaniesHouse(query) {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  const q = String(query || '').trim().slice(0, 120);
  if (!apiKey) return { configured: false, items: [], message: 'Add COMPANIES_HOUSE_API_KEY to .env to enable official company search.' };
  if (q.length < 2) return { configured: true, items: [], message: 'Enter at least 2 characters.' };

  const data = await companiesHouseFetch(`/search/companies?q=${encodeURIComponent(q)}&items_per_page=8`, apiKey);
  const items = await Promise.all((data.items || []).slice(0, 8).map(async (item) => {
    const number = item.company_number || '';
    let profile = null;
    try {
      if (number) profile = await companiesHouseFetch(`/company/${encodeURIComponent(number)}`, apiKey);
    } catch {
      profile = null;
    }
    const address = profile?.registered_office_address || item.address || {};
    return {
      companyName: item.title || profile?.company_name || '',
      companyNumber: number,
      status: item.company_status || profile?.company_status || '',
      type: item.company_type || profile?.type || '',
      dateOfCreation: profile?.date_of_creation || '',
      address: formatAddress(address),
      addressParts: address,
      domainSuggestion: domainFromCompanyName(item.title || profile?.company_name || ''),
      source: 'companies_house'
    };
  }));
  return { configured: true, items, message: items.length ? 'Companies House matches found.' : 'No Companies House matches found.' };
}

async function companiesHouseFetch(path, apiKey) {
  const response = await fetch(`${API_ROOT}${path}`, {
    headers: {
      Authorization: `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      Accept: 'application/json'
    }
  });
  if (!response.ok) throw new Error(`Companies House request failed with ${response.status}`);
  return response.json();
}

function formatAddress(address = {}) {
  return [
    address.premises,
    address.address_line_1,
    address.address_line_2,
    address.locality,
    address.region,
    address.postal_code,
    address.country
  ].filter(Boolean).join(', ');
}

function domainFromCompanyName(name) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\b(limited|ltd|llp|plc|cic|company|co|uk)\b/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .slice(0, 48);
  return base ? `${base}.co.uk` : '';
}
