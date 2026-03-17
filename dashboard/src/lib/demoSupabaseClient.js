/**
 * Mock Supabase client for demo mode.
 * Intercepts .from(table).select().filter()... chains and returns dummy data.
 * Supports all chainable methods used across dashboard views.
 */
import TABLE_DATA from './demoData';

function applyFilter(rows, column, op, value) {
  return rows.filter((row) => {
    const v = row[column];
    switch (op) {
      case 'eq': return v === value;
      case 'neq': return v !== value;
      case 'gt': return v > value;
      case 'gte': return v >= value;
      case 'lt': return v < value;
      case 'lte': return v <= value;
      case 'in': return Array.isArray(value) && value.includes(v);
      default: return true;
    }
  });
}

function createQueryBuilder(tableName) {
  let data = [...(TABLE_DATA[tableName] || [])];
  let isSingle = false;
  let limitN = null;
  let rangeFrom = null;
  let rangeTo = null;

  const builder = {
    select() { return builder; },
    eq(col, val) { data = applyFilter(data, col, 'eq', val); return builder; },
    neq(col, val) { data = applyFilter(data, col, 'neq', val); return builder; },
    gt(col, val) { data = applyFilter(data, col, 'gt', val); return builder; },
    gte(col, val) { data = applyFilter(data, col, 'gte', val); return builder; },
    lt(col, val) { data = applyFilter(data, col, 'lt', val); return builder; },
    lte(col, val) { data = applyFilter(data, col, 'lte', val); return builder; },
    in(col, vals) { data = applyFilter(data, col, 'in', vals); return builder; },
    or() { return builder; }, // or filters are complex — just return all data
    not() { return builder; },
    is(col, val) { data = data.filter((r) => r[col] === val); return builder; },
    contains() { return builder; },
    ilike() { return builder; },
    order(col, opts) {
      const asc = opts?.ascending !== false;
      data.sort((a, b) => {
        const av = a[col], bv = b[col];
        if (av == null && bv == null) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        if (av < bv) return asc ? -1 : 1;
        if (av > bv) return asc ? 1 : -1;
        return 0;
      });
      return builder;
    },
    limit(n) { limitN = n; return builder; },
    range(from, to) { rangeFrom = from; rangeTo = to; return builder; },
    single() { isSingle = true; return builder; },
    maybeSingle() { isSingle = true; return builder; },
    // Write operations are no-ops in demo mode
    insert() { return Promise.resolve({ data: [], error: null }); },
    update() { return builder; },
    upsert() { return Promise.resolve({ data: [], error: null }); },
    delete() { return builder; },

    // Terminal — returns a promise
    then(resolve, reject) {
      try {
        let result = data;
        if (rangeFrom != null && rangeTo != null) {
          result = result.slice(rangeFrom, rangeTo + 1);
        }
        if (limitN != null) {
          result = result.slice(0, limitN);
        }
        if (isSingle) {
          resolve({ data: result[0] || null, error: result.length ? null : { message: 'No rows found' } });
        } else {
          resolve({ data: result, error: null });
        }
      } catch (err) {
        if (reject) reject(err);
        else resolve({ data: [], error: { message: err.message } });
      }
    },
  };

  return builder;
}

export const demoSupabase = {
  from(tableName) {
    return createQueryBuilder(tableName);
  },
  functions: {
    invoke(fnName) {
      // Edge function calls return mock success
      if (fnName === 'manage_attendee_aliases') {
        return Promise.resolve({
          data: { ok: true, aliases: TABLE_DATA.attendee_aliases || [] },
          error: null,
        });
      }
      if (fnName === 'sync_mailchimp') {
        return Promise.resolve({
          data: { campaigns: [], synced: 0 },
          error: null,
        });
      }
      if (fnName === 'ai-briefing') {
        return Promise.resolve({
          data: {
            summary: 'Demo mode: AI briefing is not available with dummy data.',
            recommendations: ['Enable live data to see real AI insights.'],
          },
          error: null,
        });
      }
      // Default: return a generic success
      return Promise.resolve({
        data: { ok: true, message: 'Demo mode — edge function call simulated.' },
        error: null,
      });
    },
  },
  rpc(fnName) {
    return Promise.resolve({ data: [], error: null });
  },
  auth: {
    getSession() { return Promise.resolve({ data: { session: null }, error: null }); },
    getUser() { return Promise.resolve({ data: { user: null }, error: null }); },
    onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; },
  },
  channel() {
    return {
      on() { return this; },
      subscribe() { return this; },
      unsubscribe() {},
    };
  },
  removeChannel() {},
};
