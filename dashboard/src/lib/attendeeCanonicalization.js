const NON_PERSON_TOKENS = new Set([
  'iphone',
  'ipad',
  'android',
  'galaxy',
  'phone',
  'zoom',
  'user',
  'guest',
  'host',
  'cohost',
  'admin',
  'desktop',
  'laptop',
  'macbook',
  'pc',
  'meeting',
]);

const PREFIX_RULES = [
  { regex: /^chris\s+lipper\b/i, canonical: 'Chris Lipper' },
  { regex: /^allen\s+g(?:\b|[^a-z0-9])/i, canonical: 'Allen Goddard' },
  { regex: /^allen\s+godard\b/i, canonical: 'Allen Goddard' },
  { regex: /^allen\s+goddard\b/i, canonical: 'Allen Goddard' },
  { regex: /^josh\s+cougler\b/i, canonical: 'Josh Cougler' },
  { regex: /^matt\s+s\b/i, canonical: 'Matt Shiebler' },
];

export function normalizeAliasKey(value = '') {
  return String(value).toLowerCase().trim().replace(/\s+/g, ' ');
}

function normalizeForTokens(value = '') {
  return normalizeAliasKey(value)
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value = '') {
  return normalizeForTokens(value)
    .split(' ')
    .map((token) => token.trim())
    .filter(Boolean);
}

function toDisplayToken(token = '') {
  if (!/[a-z]/.test(token)) return token.toUpperCase();
  return token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
}

function resolveAliasChain(rawName = '', aliasMap = new Map()) {
  const fallback = String(rawName || '').trim();
  let current = fallback;
  let currentKey = normalizeAliasKey(current);
  const seen = new Set();

  for (let i = 0; i < 12; i += 1) {
    if (!currentKey || seen.has(currentKey)) break;
    seen.add(currentKey);

    const next = aliasMap instanceof Map ? aliasMap.get(currentKey) : null;
    if (!next) break;

    const nextTrimmed = String(next || '').trim();
    const nextKey = normalizeAliasKey(nextTrimmed);
    if (!nextTrimmed || !nextKey || nextKey === currentKey) break;

    current = nextTrimmed;
    currentKey = nextKey;
  }

  return current || fallback;
}

export function inferFirstLastCanonical(rawName = '') {
  const tokens = tokenize(rawName);
  if (tokens.length < 3) return null;

  const first = tokens[0] || '';
  const last = tokens[1] || '';
  if (first.length < 2 || last.length < 2) return null;
  if (!/[a-z]/.test(first) || !/[a-z]/.test(last)) return null;
  if (NON_PERSON_TOKENS.has(first) || NON_PERSON_TOKENS.has(last)) return null;

  return `${toDisplayToken(first)} ${toDisplayToken(last)}`;
}

export function applyCanonicalNameHeuristics(rawName = '') {
  const trimmed = String(rawName || '').trim();
  if (!trimmed) return '';

  for (const rule of PREFIX_RULES) {
    if (rule.regex.test(trimmed)) return rule.canonical;
  }

  return inferFirstLastCanonical(trimmed) || trimmed;
}

export function buildAliasMap(aliasRows = []) {
  const map = new Map();
  (aliasRows || []).forEach((row) => {
    const original = String(row?.original_name || '').trim();
    const target = String(row?.target_name || '').trim();
    const key = normalizeAliasKey(original);
    if (!key || !target) return;
    map.set(key, target);
  });
  return map;
}

export function resolveCanonicalAttendeeName(rawName = '', aliasMap = new Map()) {
  const aliased = resolveAliasChain(rawName, aliasMap);
  return applyCanonicalNameHeuristics(aliased || rawName);
}
