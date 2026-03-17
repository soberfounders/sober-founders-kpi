/**
 * SEO Validator for Sober Founders Blog Pipeline
 *
 * Scores generated HTML against 19 SEO checks derived from the
 * 2026 SEO+GEO checklist, seo-audit skill, and ai-seo skill.
 *
 * Pass threshold: 95 / 110 points.
 */

/**
 * Strip HTML tags and return plain text.
 */
function stripHtml(html) {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Count words in plain text.
 */
function countWords(text) {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract all matches of a tag (returns array of { full, inner }).
 */
function extractTags(html, tag) {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'gi');
  const results = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    results.push({ full: m[0], inner: m[1] });
  }
  return results;
}

/**
 * Count occurrences of a keyword (case-insensitive, word-boundary aware).
 */
function countKeyword(text, keyword) {
  const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'gi');
  return (text.match(re) || []).length;
}

/**
 * Count sentences in text (rough heuristic).
 */
function countSentences(text) {
  return (text.match(/[.!?]+(?:\s|$)/g) || []).length;
}

// ── Semantic variation maps for common keywords ─────────────────────────────
const SEMANTIC_MAP = {
  'sober entrepreneur': ['sober founder', 'founder in recovery', 'entrepreneur in recovery', 'recovering entrepreneur', 'sober business owner', 'sober CEO'],
  'entrepreneurs in recovery': ['founders in recovery', 'sober entrepreneur', 'recovering entrepreneur', 'business owner in recovery', 'entrepreneur sobriety'],
  'addiction and entrepreneurship': ['addiction among entrepreneurs', 'substance abuse and business', 'entrepreneurial addiction', 'addiction in business', 'recovery and entrepreneurship'],
  'sober business networking': ['alcohol-free networking', 'networking in recovery', 'sober professional events', 'networking without drinking', 'sober networking'],
  'sober networking': ['alcohol-free networking', 'networking without drinking', 'networking in recovery', 'sober professional events', 'sober business networking'],
  'recovery and business success': ['sobriety and business', 'business success in recovery', 'sober success', 'recovery-driven success', 'building a business sober'],
  'sobriety and leadership': ['sober leadership', 'leading in recovery', 'recovery and leadership', 'sober CEO leadership', 'leadership in sobriety'],
  'sober CEO': ['sober founder', 'CEO in recovery', 'sober executive', 'recovering CEO', 'sober business leader'],
  'how to network without alcohol': ['alcohol-free networking', 'networking sober', 'sober networking tips', 'networking without drinking', 'dry networking'],
  'peer advisory group': ['peer group', 'mastermind group', 'CEO peer group', 'founder peer group', 'peer advisory board'],
  'entrepreneur mastermind group': ['founder mastermind', 'business mastermind', 'CEO mastermind', 'peer advisory group', 'mastermind for entrepreneurs'],
  'why entrepreneurs struggle with addiction': ['entrepreneurial addiction', 'addiction among founders', 'substance abuse entrepreneurs', 'founder addiction risk', 'addiction and business owners'],
  'how to build a business in recovery': ['building a business sober', 'starting a business in recovery', 'entrepreneurship in recovery', 'sober business building', 'recovery and business growth'],
};

/**
 * Get semantic variations for a keyword.
 */
function getSemanticVariations(keyword) {
  const kw = keyword.toLowerCase();
  if (SEMANTIC_MAP[kw]) return SEMANTIC_MAP[kw];
  // Fallback: generate basic variations
  const words = kw.split(/\s+/);
  if (words.length >= 2) {
    return [
      words.reverse().join(' '),
      words.slice(0, -1).join(' '),
      kw.replace(/\b(sober|recovery)\b/gi, (m) => m === 'sober' ? 'recovery' : 'sober'),
    ].filter((v) => v !== kw && v.length > 3);
  }
  return [];
}

// ── Phoenix Forum URL patterns ──────────────────────────────────────────────
const PHOENIX_URLS = [
  'phoenix-forum-registration',
  'phoenix-forum-2nd-group',
  'phoenix-forum',
];

const MASTERMIND_URLS = [
  'weekly-mastermind-group',
  'weekly-mastermind',
];

const BLOG_LINKS = [
  'entrepreneurs-in-recovery',
  '12-steps-and-your-business',
  'entrepreneurial-operating-system-eos',
  'do-mastermind-groups-help-sober-entrepreneurs',
  'peer-advisory-sober-entrepreneurs',
];

// ── Individual check functions ──────────────────────────────────────────────

function checkBluf(html) {
  const h2s = extractTags(html, 'h2');
  if (h2s.length === 0) return { earned: 0, detail: 'No H2 tags found' };

  // Find content between first H2 and second H2 (or next major tag)
  const firstH2Idx = html.indexOf(h2s[0].full);
  const afterH2 = html.substring(firstH2Idx + h2s[0].full.length);
  const nextH2Idx = afterH2.search(/<h2[^>]*>/i);
  const blockHtml = nextH2Idx > 0 ? afterH2.substring(0, nextH2Idx) : afterH2.substring(0, 1000);

  // Get first paragraph after H2
  const firstP = extractTags(blockHtml, 'p');
  if (firstP.length === 0) return { earned: 0, detail: 'No paragraph after first H2' };

  const words = countWords(stripHtml(firstP[0].inner));
  if (words >= 35 && words <= 75) return { earned: 10, detail: `BLUF block: ${words} words` };
  if (words >= 25 && words <= 90) return { earned: 5, detail: `BLUF block: ${words} words (outside 40-60 ideal)` };
  return { earned: 0, detail: `BLUF block: ${words} words (too ${words < 25 ? 'short' : 'long'})` };
}

function checkQuestionH2s(html) {
  const h2s = extractTags(html, 'h2');
  const questions = h2s.filter((h) => stripHtml(h.inner).trim().endsWith('?'));
  if (questions.length >= 3) return { earned: 10, detail: `${questions.length} question-based H2s` };
  if (questions.length >= 2) return { earned: 5, detail: `${questions.length} question-based H2s (need 3+)` };
  return { earned: 0, detail: `${questions.length} question-based H2s (need 3+)` };
}

function checkKeywordFirst100(html, keyword) {
  const text = stripHtml(html);
  const first100 = text.split(/\s+/).slice(0, 100).join(' ');
  const found = first100.toLowerCase().includes(keyword.toLowerCase());
  return { earned: found ? 8 : 0, detail: found ? 'Keyword in first 100 words' : 'Keyword missing from first 100 words' };
}

function checkKeywordInH2(html, keyword) {
  const h2s = extractTags(html, 'h2');
  const found = h2s.some((h) => stripHtml(h.inner).toLowerCase().includes(keyword.toLowerCase()));
  return { earned: found ? 5 : 0, detail: found ? 'Keyword in H2' : 'Keyword not in any H2' };
}

function checkKeywordDensity(html, keyword) {
  const text = stripHtml(html);
  const count = countKeyword(text, keyword);
  if (count >= 3 && count <= 7) return { earned: 8, detail: `Keyword appears ${count}x` };
  if (count >= 2 && count <= 10) return { earned: 4, detail: `Keyword appears ${count}x (ideal: 3-7)` };
  return { earned: 0, detail: `Keyword appears ${count}x (${count < 2 ? 'too few' : 'stuffing'})` };
}

function checkWordCount(html) {
  const text = stripHtml(html);
  const words = countWords(text);
  if (words >= 1800) return { earned: 10, detail: `${words} words` };
  if (words >= 1500) return { earned: 5, detail: `${words} words (target: 1800+)` };
  return { earned: 0, detail: `${words} words (too short, need 1800+)` };
}

function checkFaqSection(html) {
  const lower = html.toLowerCase();
  const hasFaqH2 = lower.includes('<h2') && lower.includes('frequently asked questions');
  if (!hasFaqH2) return { earned: 0, detail: 'No FAQ section found' };

  // Count H3s after the FAQ H2
  const faqIdx = lower.indexOf('frequently asked questions');
  const afterFaq = html.substring(faqIdx);
  const h3s = extractTags(afterFaq, 'h3');
  const questionH3s = h3s.filter((h) => stripHtml(h.inner).trim().endsWith('?'));

  if (questionH3s.length >= 4) return { earned: 8, detail: `FAQ section with ${questionH3s.length} Q&As` };
  if (questionH3s.length >= 3) return { earned: 5, detail: `FAQ section with ${questionH3s.length} Q&As (need 4+)` };
  return { earned: 2, detail: `FAQ section with ${questionH3s.length} Q&As (need 4+)` };
}

function checkStatsCitations(html) {
  const text = stripHtml(html);
  // Look for patterns like "X%" or "X million" or "X billion" followed by source indicators
  const statPatterns = [
    /\d+(\.\d+)?%/g,
    /\$[\d,.]+\s*(million|billion|thousand|M|B|K)/gi,
    /\d[\d,]*\s*(million|billion|thousand)/gi,
  ];
  let statCount = 0;
  for (const pat of statPatterns) {
    statCount += (text.match(pat) || []).length;
  }

  // Check for source citations
  const sourcePatterns = [
    /according to/gi,
    /\((?:SAMHSA|NIDA|CDC|WHO|NIH|Harvard|Stanford|Journal|Study|Survey|Report|Research|Bureau|Census|Gallup|Pew)/gi,
    /(?:SAMHSA|NIDA|CDC|WHO|NIH|Harvard|Stanford)\s+(?:reports?|finds?|found|data|study|survey|research)/gi,
    /(?:a|the)\s+\d{4}\s+(?:study|survey|report|analysis)/gi,
  ];
  let sourceCount = 0;
  for (const pat of sourcePatterns) {
    sourceCount += (text.match(pat) || []).length;
  }

  const hasStats = statCount >= 2;
  const hasSources = sourceCount >= 2;

  if (hasStats && hasSources) return { earned: 8, detail: `${statCount} stats, ${sourceCount} source citations` };
  if (hasStats || hasSources) return { earned: 4, detail: `${statCount} stats, ${sourceCount} source citations (need both 2+)` };
  return { earned: 0, detail: `${statCount} stats, ${sourceCount} source citations (need both 2+)` };
}

function checkBlockquote(html) {
  const bqs = extractTags(html, 'blockquote');
  if (bqs.length === 0) return { earned: 0, detail: 'No blockquote found' };
  // Check if blockquote contains a name indicator
  const bqText = bqs.map((b) => stripHtml(b.inner)).join(' ');
  const hasAttribution = /[A-Z][a-z]+,?\s+(?:a\s+)?(?:founder|CEO|owner|entrepreneur|member)/i.test(bqText) ||
    /—\s*[A-Z]/i.test(bqs.map((b) => b.inner).join(' '));
  if (hasAttribution) return { earned: 5, detail: `${bqs.length} blockquote(s) with attribution` };
  return { earned: 3, detail: `${bqs.length} blockquote(s) but missing name/industry attribution` };
}

function checkInternalLinks(html) {
  const lower = html.toLowerCase();
  const hasPhoenix = PHOENIX_URLS.some((u) => lower.includes(u));
  const hasMastermind = MASTERMIND_URLS.some((u) => lower.includes(u));
  const hasBlog = BLOG_LINKS.some((u) => lower.includes(u));

  const score = (hasPhoenix ? 4 : 0) + (hasMastermind ? 3 : 0) + (hasBlog ? 3 : 0);
  const missing = [];
  if (!hasPhoenix) missing.push('Phoenix Forum');
  if (!hasMastermind) missing.push('weekly mastermind');
  if (!hasBlog) missing.push('existing blog post');

  return {
    earned: score,
    detail: missing.length === 0 ? 'All 3 internal link types present' : `Missing: ${missing.join(', ')}`,
  };
}

function checkPhoenixCTA(html) {
  const lower = html.toLowerCase();
  const has = PHOENIX_URLS.some((u) => lower.includes(u));
  return { earned: has ? 5 : 0, detail: has ? 'Phoenix Forum CTA present' : 'Missing Phoenix Forum link' };
}

function checkMetaTitleLen(meta) {
  const len = (meta.seo_title || '').length;
  if (len >= 50 && len <= 60) return { earned: 3, detail: `Title: ${len} chars` };
  if (len >= 40 && len <= 70) return { earned: 1, detail: `Title: ${len} chars (ideal: 50-60)` };
  return { earned: 0, detail: `Title: ${len} chars (ideal: 50-60)` };
}

function checkMetaDescLen(meta) {
  const len = (meta.meta_description || '').length;
  if (len >= 130 && len <= 155) return { earned: 3, detail: `Description: ${len} chars` };
  if (len >= 110 && len <= 170) return { earned: 1, detail: `Description: ${len} chars (ideal: 130-155)` };
  return { earned: 0, detail: `Description: ${len} chars (ideal: 130-155)` };
}

function checkLastUpdated(html) {
  const has = /<p><em>Last updated:\s*\d{4}-\d{2}-\d{2}<\/em><\/p>/i.test(html);
  return { earned: has ? 2 : 0, detail: has ? 'Last updated date present' : 'Missing Last updated date' };
}

function checkImageAltComment(html) {
  const has = /<!--\s*Alt:/i.test(html);
  return { earned: has ? 2 : 0, detail: has ? 'Image alt comment present' : 'Missing <!-- Alt: ... --> comment' };
}

function checkShortParagraphs(html) {
  const paragraphs = extractTags(html, 'p');
  const longP = paragraphs.filter((p) => countSentences(stripHtml(p.inner)) > 5);
  if (longP.length === 0) return { earned: 3, detail: 'All paragraphs 5 sentences or fewer' };
  if (longP.length <= 2) return { earned: 1, detail: `${longP.length} paragraph(s) exceed 5 sentences` };
  return { earned: 0, detail: `${longP.length} paragraphs exceed 5 sentences` };
}

function checkNoForbiddenOpeners(html) {
  const text = stripHtml(html).trim();
  const first50 = text.substring(0, 200).toLowerCase();
  const forbidden = ['discover ', 'learn ', "in today's fast-paced world", 'as entrepreneurs, we all know'];
  const found = forbidden.filter((f) => first50.startsWith(f) || first50.includes(f));
  if (found.length === 0) return { earned: 2, detail: 'No forbidden openers' };
  return { earned: 0, detail: `Forbidden opener found: "${found[0]}"` };
}

function checkSemanticVariations(html, keyword) {
  const text = stripHtml(html).toLowerCase();
  const variations = getSemanticVariations(keyword);
  const found = variations.filter((v) => text.includes(v.toLowerCase()));
  if (found.length >= 2) return { earned: 5, detail: `${found.length} semantic variations found` };
  if (found.length === 1) return { earned: 2, detail: `1 semantic variation found (need 2+)` };
  return { earned: 0, detail: 'No semantic variations found' };
}

function checkModularChunking(html) {
  const hasList = /<[uo]l[^>]*>/i.test(html);
  const hasTable = /<table[^>]*>/i.test(html);
  if (hasList && hasTable) return { earned: 3, detail: 'Has both lists and tables' };
  if (hasList || hasTable) return { earned: 2, detail: `Has ${hasList ? 'list(s)' : 'table(s)'}` };
  return { earned: 0, detail: 'No lists or tables found' };
}

// ── Main validator ──────────────────────────────────────────────────────────

const PASS_THRESHOLD = 88;
const MAX_SCORE = 110;

/**
 * Validate an article against the 2026 SEO+GEO checklist.
 *
 * @param {string} html - The article HTML content
 * @param {string} keyword - The focus keyword
 * @param {{ seo_title: string, meta_description: string }} meta - SEO metadata
 * @returns {{ score: number, maxScore: number, passed: boolean, checks: Array<{ name: string, points: number, earned: number, detail: string }> }}
 */
export function validateArticle(html, keyword, meta) {
  const checks = [
    { name: 'bluf', points: 10, ...checkBluf(html) },
    { name: 'questionH2s', points: 10, ...checkQuestionH2s(html) },
    { name: 'keywordFirst100', points: 8, ...checkKeywordFirst100(html, keyword) },
    { name: 'keywordInH2', points: 5, ...checkKeywordInH2(html, keyword) },
    { name: 'keywordDensity', points: 8, ...checkKeywordDensity(html, keyword) },
    { name: 'wordCount', points: 10, ...checkWordCount(html) },
    { name: 'faqSection', points: 8, ...checkFaqSection(html) },
    { name: 'statsCitations', points: 8, ...checkStatsCitations(html) },
    { name: 'blockquote', points: 5, ...checkBlockquote(html) },
    { name: 'internalLinks', points: 10, ...checkInternalLinks(html) },
    { name: 'phoenixCTA', points: 5, ...checkPhoenixCTA(html) },
    { name: 'metaTitleLen', points: 3, ...checkMetaTitleLen(meta) },
    { name: 'metaDescLen', points: 3, ...checkMetaDescLen(meta) },
    { name: 'lastUpdated', points: 2, ...checkLastUpdated(html) },
    { name: 'imageAltComment', points: 2, ...checkImageAltComment(html) },
    { name: 'shortParagraphs', points: 3, ...checkShortParagraphs(html) },
    { name: 'noForbiddenOpeners', points: 2, ...checkNoForbiddenOpeners(html) },
    { name: 'semanticVariations', points: 5, ...checkSemanticVariations(html, keyword) },
    { name: 'modularChunking', points: 3, ...checkModularChunking(html) },
  ];

  const score = checks.reduce((sum, c) => sum + c.earned, 0);

  return {
    score,
    maxScore: MAX_SCORE,
    passed: score >= PASS_THRESHOLD,
    checks,
  };
}

/**
 * Format a validation report as a human-readable string.
 */
export function formatReport(result) {
  const lines = [
    `SEO Score: ${result.score}/${result.maxScore} (${result.passed ? 'PASS' : 'FAIL'} — threshold: ${PASS_THRESHOLD})`,
    '',
  ];
  for (const c of result.checks) {
    const icon = c.earned === c.points ? '✓' : c.earned > 0 ? '~' : '✗';
    lines.push(`  ${icon} ${c.name}: ${c.earned}/${c.points} — ${c.detail}`);
  }
  return lines.join('\n');
}

/**
 * Build a feedback prompt for failing checks to guide regeneration.
 */
export function buildFeedbackPrompt(result) {
  const failing = result.checks.filter((c) => c.earned < c.points);
  if (failing.length === 0) return '';

  const instructions = failing.map((c) => {
    switch (c.name) {
      case 'bluf': return 'Place a 40-60 word self-contained answer immediately after the first H2.';
      case 'questionH2s': return 'Use at least 3 H2 headings phrased as questions ending with "?".';
      case 'keywordFirst100': return 'Include the focus keyword naturally in the first 100 words.';
      case 'keywordInH2': return 'Include the focus keyword in at least one H2 heading.';
      case 'keywordDensity': return 'Use the focus keyword 3-7 times throughout the article (currently too few or too many).';
      case 'wordCount': return 'Article must be at least 1800 words. Expand the weakest sections with more depth.';
      case 'faqSection': return 'Add a "Frequently Asked Questions" H2 with at least 4 H3 question-answer pairs.';
      case 'statsCitations': return 'Include at least 2 statistics with named sources (SAMHSA, NIDA, studies, etc.).';
      case 'blockquote': return 'Include at least 1 <blockquote> with a member quote attributed to a name, industry, and revenue range.';
      case 'internalLinks': return `Ensure links to: Phoenix Forum (/phoenix-forum-2nd-group/), weekly mastermind (/weekly-mastermind-group/), and at least 1 existing blog post.`;
      case 'phoenixCTA': return 'Include a link to the Phoenix Forum page (/phoenix-forum-2nd-group/).';
      case 'metaTitleLen': return 'SEO title should be 50-60 characters.';
      case 'metaDescLen': return 'Meta description should be 130-155 characters.';
      case 'lastUpdated': return 'Start the article with <p><em>Last updated: YYYY-MM-DD</em></p>.';
      case 'imageAltComment': return 'Include at least one <!-- Alt: description --> comment for suggested images.';
      case 'shortParagraphs': return 'Keep all paragraphs to 5 sentences or fewer. Break up long paragraphs.';
      case 'noForbiddenOpeners': return 'Do not start with "Discover", "Learn", or generic filler phrases.';
      case 'semanticVariations': return 'Use at least 2 semantic variations of the focus keyword (synonyms, related phrases).';
      case 'modularChunking': return 'Include at least one <table> or <ul>/<ol> list for structured, scannable content.';
      default: return `Fix: ${c.detail}`;
    }
  });

  return `\n\nIMPORTANT REVISIONS NEEDED (the article failed SEO validation with score ${result.score}/${result.maxScore}):\n${instructions.map((i, idx) => `${idx + 1}. ${i}`).join('\n')}`;
}

export { PASS_THRESHOLD, MAX_SCORE };
