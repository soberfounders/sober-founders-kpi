import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

const DEFAULT_TTL_HOURS = 6;

function stableObject(value) {
  if (Array.isArray(value)) return value.map((item) => stableObject(item));
  if (value && typeof value === 'object') {
    return Object.keys(value)
      .sort((a, b) => a.localeCompare(b))
      .reduce((acc, key) => {
        acc[key] = stableObject(value[key]);
        return acc;
      }, {});
  }
  return value;
}

function stableJson(value) {
  return JSON.stringify(stableObject(value || {}));
}

function isFreshSnapshot(createdAtIso, ttlHours = DEFAULT_TTL_HOURS) {
  if (!createdAtIso) return false;
  const createdAtMs = Date.parse(createdAtIso);
  if (!Number.isFinite(createdAtMs)) return false;
  return (Date.now() - createdAtMs) <= (ttlHours * 60 * 60 * 1000);
}

export default function useManagerReport(managerKey, period, compare, filters = {}) {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [fromCache, setFromCache] = useState(false);
  const [snapshotMeta, setSnapshotMeta] = useState({ snapshotId: null, createdAt: null, inputsHash: null });

  const normalizedFilters = useMemo(() => stableObject(filters || {}), [stableJson(filters || {})]);
  const normalizedFiltersJson = useMemo(() => stableJson(normalizedFilters), [normalizedFilters]);

  const fetchReport = useCallback(async ({ force = false } = {}) => {
    if (!managerKey) return null;

    setError('');
    if (force) setRefreshing(true);
    else setLoading(true);

    try {
      if (!force) {
        const { data: snapshotRows, error: snapshotError } = await supabase
          .from('analysis_snapshots')
          .select('id,filters,output,created_at,status,inputs_hash')
          .eq('manager_key', managerKey)
          .eq('period', period)
          .eq('compare', compare)
          .eq('status', 'success')
          .order('created_at', { ascending: false })
          .limit(20);

        if (snapshotError) throw snapshotError;

        const matchingSnapshot = (snapshotRows || []).find((row) => stableJson(row?.filters || {}) === normalizedFiltersJson)
          || (snapshotRows || [])[0]
          || null;

        if (matchingSnapshot && isFreshSnapshot(matchingSnapshot.created_at, DEFAULT_TTL_HOURS)) {
          setReport(matchingSnapshot.output || null);
          setFromCache(true);
          setSnapshotMeta({
            snapshotId: matchingSnapshot.id || null,
            createdAt: matchingSnapshot.created_at || null,
            inputsHash: matchingSnapshot.inputs_hash || null,
          });
          return matchingSnapshot.output || null;
        }
      }

      const { data, error: invokeError } = await supabase.functions.invoke('ai-manager-report', {
        body: {
          manager_key: managerKey,
          period,
          compare,
          filters: normalizedFilters,
          force,
        },
      });

      if (invokeError) throw invokeError;
      if (!data?.ok) throw new Error(data?.error || 'ai-manager-report failed');

      setReport(data || null);
      setFromCache(!!data?.from_cache);
      setSnapshotMeta({
        snapshotId: data?.snapshot_id || null,
        createdAt: data?.generated_at || null,
        inputsHash: data?.inputs_hash || null,
      });
      return data;
    } catch (err) {
      setError(err?.message || 'Failed to load manager report.');
      return null;
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [managerKey, period, compare, normalizedFilters, normalizedFiltersJson]);

  useEffect(() => {
    fetchReport({ force: false });
  }, [fetchReport]);

  return {
    report,
    loading,
    refreshing,
    error,
    fromCache,
    snapshotMeta,
    refresh: () => fetchReport({ force: true }),
    reload: () => fetchReport({ force: false }),
  };
}
