/**
 * HubSpot Engagement Email Sender
 *
 * Creates email engagements on HubSpot contact timelines.
 * Emails appear as if sent from the specified sender, logged on
 * the contact record for full visibility in HubSpot CRM.
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface HubSpotEmailParams {
  contactId: string | number;
  contactEmail: string;
  senderEmail: string;
  subject: string;
  htmlBody: string;
  campaignType: string;  // 'no_show_recovery' | 'at_risk_nudge' | 'winback'
}

export interface HubSpotEmailResult {
  ok: boolean;
  emailId?: string;
  error?: string;
}

/* ------------------------------------------------------------------ */
/*  Retry wrapper (mirrors hubspot_sync.ts pattern)                   */
/* ------------------------------------------------------------------ */

async function fetchWithRetry(
  token: string,
  url: string,
  options: RequestInit = {},
  retries = 3,
): Promise<Response> {
  let attempt = 0;
  let lastError: any = null;
  while (attempt <= retries) {
    attempt += 1;
    try {
      const resp = await fetch(url, {
        ...options,
        headers: {
          authorization: `Bearer ${token}`,
          "content-type": "application/json",
          ...(options.headers || {}),
        },
      });

      if (resp.status === 429 || resp.status >= 500) {
        if (attempt <= retries) {
          const retryAfterHeader = resp.headers.get("retry-after");
          const retryAfterMs = retryAfterHeader ? Number(retryAfterHeader) * 1000 : 0;
          const backoffMs = Math.max(retryAfterMs, attempt * 1000);
          await new Promise((r) => setTimeout(r, backoffMs));
          continue;
        }
      }

      return resp;
    } catch (e: any) {
      lastError = e;
      if (attempt > retries) break;
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  throw new Error(`HubSpot email request failed after ${retries} retries: ${String(lastError?.message || lastError || "unknown")}`);
}

/* ------------------------------------------------------------------ */
/*  Send engagement email                                              */
/* ------------------------------------------------------------------ */

/**
 * Creates an email engagement in HubSpot, associated with the contact.
 * The email appears on the contact's timeline in HubSpot CRM.
 *
 * NOTE: This creates a LOGGED email engagement — it does NOT send an
 * actual email via SMTP. To actually deliver the email, pair this with
 * HubSpot's single-send API or a transactional email workflow. The
 * engagement record ensures it shows on the contact timeline regardless.
 */
export async function sendHubSpotEmail(
  token: string,
  params: HubSpotEmailParams,
): Promise<HubSpotEmailResult> {
  const { contactId, contactEmail, senderEmail, subject, htmlBody, campaignType } = params;

  // 1. Create the email engagement object
  const createResp = await fetchWithRetry(
    token,
    "https://api.hubapi.com/crm/v3/objects/emails",
    {
      method: "POST",
      body: JSON.stringify({
        properties: {
          hs_timestamp: new Date().toISOString(),
          hs_email_direction: "EMAIL",
          hs_email_status: "SENT",
          hs_email_subject: subject,
          hs_email_text: htmlBody.replace(/<[^>]*>/g, ""),  // plain-text fallback
          hs_email_html: htmlBody,
          hs_email_sender_email: senderEmail,
          hs_email_sender_firstname: "",  // HubSpot will resolve from owner
          hs_email_to_email: contactEmail,
          hs_email_headers: JSON.stringify({
            from: { email: senderEmail },
            to: [{ email: contactEmail }],
          }),
          hubspot_owner_id: "",  // auto-resolved
          hs_email_campaign_type: campaignType,
        },
      }),
    },
  );

  if (!createResp.ok) {
    const errText = await createResp.text();
    console.error(`HubSpot email create failed (${createResp.status}):`, errText);
    return { ok: false, error: `Create failed: ${createResp.status} ${errText}` };
  }

  const emailObj = await createResp.json();
  const emailId = emailObj?.id;

  if (!emailId) {
    return { ok: false, error: "No email ID returned from HubSpot" };
  }

  // 2. Associate the email with the contact
  const assocResp = await fetchWithRetry(
    token,
    `https://api.hubapi.com/crm/v3/objects/emails/${emailId}/associations/contacts/${contactId}/198`,
    {
      method: "PUT",
    },
  );

  if (!assocResp.ok) {
    const errText = await assocResp.text();
    console.error(`HubSpot email association failed (${assocResp.status}):`, errText);
    // Email was created but association failed — still partially successful
    return { ok: true, emailId, error: `Association failed: ${assocResp.status}` };
  }

  return { ok: true, emailId };
}

/**
 * Look up a HubSpot contact ID by email address.
 * Returns null if not found.
 */
export async function lookupContactByEmail(
  token: string,
  email: string,
): Promise<string | null> {
  const resp = await fetchWithRetry(
    token,
    "https://api.hubapi.com/crm/v3/objects/contacts/search",
    {
      method: "POST",
      body: JSON.stringify({
        filterGroups: [{
          filters: [{
            propertyName: "email",
            operator: "EQ",
            value: email.toLowerCase(),
          }],
        }],
        properties: ["email", "firstname", "lastname"],
        limit: 1,
      }),
    },
  );

  if (!resp.ok) return null;
  const json = await resp.json();
  return json?.results?.[0]?.id || null;
}
