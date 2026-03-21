/**
 * One-time script: trims leading/trailing spaces from firstname and lastname
 * for all HubSpot contacts. Paginates through all contacts via search API.
 */

const HS_TOKEN = process.env.HUBSPOT_PRIVATE_APP_TOKEN;
if (!HS_TOKEN) {
  console.error('Set HUBSPOT_PRIVATE_APP_TOKEN env var');
  process.exit(1);
}

const HS_BASE = 'https://api.hubapi.com';

async function hsPost(path, body) {
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${HS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`POST ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function hsPatch(path, body) {
  const res = await fetch(`${HS_BASE}${path}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${HS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PATCH ${path} -> ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json();
}

async function main() {
  let offset = 0;
  let totalFixed = 0;
  let totalScanned = 0;
  const errors = [];

  while (true) {
    const result = await hsPost('/crm/v3/objects/contacts/search', {
      filterGroups: [{ filters: [] }],
      properties: ['firstname', 'lastname', 'email'],
      limit: 200,
      ...(offset ? { after: String(offset) } : {}),
      sorts: [{ propertyName: 'createdate', direction: 'ASCENDING' }],
    });

    const contacts = result.results || [];
    if (contacts.length === 0) break;
    totalScanned += contacts.length;

    for (const c of contacts) {
      const fn = c.properties?.firstname || '';
      const ln = c.properties?.lastname || '';
      const updates = {};

      if (fn.length > 0 && fn !== fn.trim()) {
        updates.firstname = fn.trim();
      }
      if (ln.length > 0 && ln !== ln.trim()) {
        updates.lastname = ln.trim();
      }

      if (Object.keys(updates).length > 0) {
        try {
          await hsPatch(`/crm/v3/objects/contacts/${c.id}`, { properties: updates });
          totalFixed++;
          const name = `${fn}|${ln}`.trim();
          const email = c.properties?.email || '';
          console.log(`  FIXED ${c.id}: "${fn}" -> "${updates.firstname || fn}" / "${ln}" -> "${updates.lastname || ln}" (${email})`);
        } catch (e) {
          errors.push(`${c.id}: ${e.message?.slice(0, 100)}`);
          console.error(`  FAIL ${c.id}: ${e.message?.slice(0, 100)}`);
        }
        // Rate limit: 100ms between patches
        await new Promise(r => setTimeout(r, 100));
      }
    }

    console.log(`  ... scanned ${totalScanned}, fixed ${totalFixed} so far`);

    if (!result.paging?.next?.after) break;
    offset = Number(result.paging.next.after);
    if (totalScanned > 10000) break; // safety
  }

  console.log(`\nDone. Scanned: ${totalScanned}, Fixed: ${totalFixed}, Errors: ${errors.length}`);
  if (errors.length > 0) {
    console.log('Errors:', errors.join('\n'));
  }
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
