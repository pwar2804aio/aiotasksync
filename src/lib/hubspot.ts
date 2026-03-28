const HUBSPOT_TOKEN = () => process.env.HUBSPOT_TOKEN || '';

async function hubspotGet(endpoint: string) {
  const res = await fetch(`https://api.hubapi.com${endpoint}`, {
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN()}`,
      'Content-Type': 'application/json',
    },
    cache: 'no-store',
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot ${res.status}: ${text}`);
  }
  return res.json();
}

async function hubspotPost(endpoint: string, body: any) {
  const res = await fetch(`https://api.hubapi.com${endpoint}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HUBSPOT_TOKEN()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HubSpot ${res.status}: ${text}`);
  }
  return res.json();
}

export async function searchCompanies(query: string) {
  const body: any = {
    limit: 50,
    properties: ['name', 'domain'],
    sorts: [{ propertyName: 'name', direction: 'ASCENDING' }],
  };
  if (query) {
    body.query = query;
  }
  return hubspotPost('/crm/v3/objects/companies/search', body);
}

export async function searchDeals(query: string) {
  const body: any = {
    limit: 50,
    properties: ['dealname', 'dealstage', 'amount', 'pipeline'],
    sorts: [{ propertyName: 'dealname', direction: 'ASCENDING' }],
  };
  if (query) {
    body.query = query;
  }
  return hubspotPost('/crm/v3/objects/deals/search', body);
}

export async function createNote(objectType: 'companies' | 'deals', objectId: string, noteBody: string) {
  // Association type IDs: 190 = note→company, 214 = note→deal
  const assocTypeId = objectType === 'companies' ? 190 : 214;
  return hubspotPost('/crm/v3/objects/notes', {
    properties: {
      hs_timestamp: new Date().toISOString(),
      hs_note_body: noteBody,
    },
    associations: [
      {
        to: { id: parseInt(objectId) },
        types: [{ associationCategory: 'HUBSPOT_DEFINED', associationTypeId: assocTypeId }],
      },
    ],
  });
}
