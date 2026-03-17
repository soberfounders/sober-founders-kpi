const rawEnv = import.meta.env || {};

const MIN_LOOKBACK_DAYS = 30;
const MAX_LOOKBACK_DAYS = 1095;
const DEFAULT_INITIAL_ATTRIBUTION_LOOKBACK_DAYS = 120;

function getString(key, fallback = '') {
  return String(rawEnv[key] ?? fallback).trim();
}

function getBoolean(key, fallback = false) {
  const value = rawEnv[key];
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  return String(value).toLowerCase() === 'true';
}

function getBoundedInt(key, fallback, { min = Number.NEGATIVE_INFINITY, max = Number.POSITIVE_INFINITY } = {}) {
  const parsed = Number(rawEnv[key] ?? fallback);
  if (!Number.isFinite(parsed) || parsed < min) return fallback;
  return Math.min(Math.floor(parsed), max);
}

export const SUPABASE_URL = getString('VITE_SUPABASE_URL');
export const SUPABASE_ANON_KEY = getString('VITE_SUPABASE_ANON_KEY');

export const DASHBOARD_LOOKBACK_DAYS = getBoundedInt('VITE_DASHBOARD_LOOKBACK_DAYS', 365, {
  min: MIN_LOOKBACK_DAYS,
  max: MAX_LOOKBACK_DAYS,
});

export const HUBSPOT_CONTACT_LOOKBACK_DAYS = getBoundedInt(
  'VITE_HUBSPOT_CONTACT_LOOKBACK_DAYS',
  DASHBOARD_LOOKBACK_DAYS,
  { min: MIN_LOOKBACK_DAYS, max: MAX_LOOKBACK_DAYS },
);

export const ENABLE_REMOTE_AI_MODULE_ANALYSIS = getBoolean('VITE_ENABLE_REMOTE_AI_MODULE_ANALYSIS');
export const USE_DUMMY_DONATIONS = getBoolean('VITE_USE_DUMMY_DONATIONS');

export const LEADS_LOOKBACK_DAYS = getBoundedInt('VITE_LEADS_LOOKBACK_DAYS', 365, {
  min: MIN_LOOKBACK_DAYS,
  max: MAX_LOOKBACK_DAYS,
});

export const LEADS_ATTRIBUTION_HISTORY_DAYS = getBoundedInt(
  'VITE_LEADS_ATTRIBUTION_HISTORY_DAYS',
  DEFAULT_INITIAL_ATTRIBUTION_LOOKBACK_DAYS,
  { min: MIN_LOOKBACK_DAYS, max: MAX_LOOKBACK_DAYS },
);

export const ATTENDANCE_BACKFILL_DAYS = getBoundedInt('VITE_ATTENDANCE_BACKFILL_DAYS', 365, {
  min: MIN_LOOKBACK_DAYS,
  max: MAX_LOOKBACK_DAYS,
});

export const ATTENDANCE_ENABLE_BAD_NAMES_QA = getBoolean('VITE_ATTENDANCE_ENABLE_BAD_NAMES_QA', false);

export const HUBSPOT_PORTAL_ID = getString('VITE_HUBSPOT_PORTAL_ID', '45070276');

export const OPENAI_API_KEY = getString('VITE_OPENAI_API_KEY');
export const GEMINI_API_KEY = getString('VITE_GEMINI_API_KEY');
export const CLAUDE_API_KEY = getString('VITE_CLAUDE_API_KEY');
export const ANTHROPIC_API_KEY = getString('VITE_ANTHROPIC_API_KEY');
export const CLAUDE_OR_ANTHROPIC_API_KEY = CLAUDE_API_KEY || ANTHROPIC_API_KEY;

export const DEMO_MODE = getBoolean('VITE_DEMO_MODE', false);
