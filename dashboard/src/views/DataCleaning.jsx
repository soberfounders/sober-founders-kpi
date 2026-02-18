import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function DataCleaning() {
  const [loading, setLoading] = useState(true);
  const [attendees, setAttendees] = useState([]);
  const [aliases, setAliases] = useState([]);
  const [aliasError, setAliasError] = useState('');
  const [selectedName, setSelectedName] = useState(null);
  const [targetName, setTargetName] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  async function fetchData() {
    setLoading(true);
    setAliasError('');

    const { data: metricsData } = await supabase
      .from('kpi_metrics')
      .select('*')
      .eq('metric_name', 'Zoom Meeting Attendees')
      .order('created_at', { ascending: false })
      .limit(10);

    const allNames = new Set();
    if (metricsData) {
      metricsData.forEach((m) => {
        if (m.metadata && m.metadata.attendees) {
          m.metadata.attendees.forEach((name) => allNames.add(name));
        }
      });
    }
    setAttendees(Array.from(allNames).sort());

    const { data: aliasesData, error: aliasesErr } = await supabase
      .from('attendee_aliases')
      .select('*')
      .order('created_at', { ascending: false });

    if (aliasesErr) {
      const msg = String(aliasesErr.message || '');
      if (msg.toLowerCase().includes('could not find the table') && msg.toLowerCase().includes('attendee_aliases')) {
        setAliasError('Alias table is not deployed yet. Run Supabase migrations to enable merge rules.');
      } else {
        setAliasError(msg || 'Unable to load alias rules.');
      }
      setAliases([]);
    } else {
      setAliases(aliasesData || []);
    }

    setLoading(false);
  }

  async function handleMerge() {
    if (!selectedName || !targetName) return;
    if (aliasError) {
      alert('Alias rules are unavailable until attendee_aliases exists.');
      return;
    }

    const { error } = await supabase
      .from('attendee_aliases')
      .insert([{ original_name: selectedName, target_name: targetName }]);

    if (error) {
      alert('Error creating alias: ' + error.message);
    } else {
      setIsModalOpen(false);
      setTargetName('');
      setSelectedName(null);
      fetchData();
    }
  }

  async function handleDeleteAlias(id) {
    if (!window.confirm('Are you sure you want to delete this rule?')) return;
    if (aliasError) {
      alert('Alias rules are unavailable until attendee_aliases exists.');
      return;
    }

    const { error } = await supabase
      .from('attendee_aliases')
      .delete()
      .eq('id', id);

    if (error) alert(error.message);
    else fetchData();
  }

  return (
    <div className="p-8 bg-gray-900 min-h-screen text-white font-sans">
      <h1 className="text-3xl font-bold mb-6 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-600">
        Data Cleaning & Deduplication
      </h1>

      {aliasError && (
        <div className="mb-6 bg-yellow-900/30 border border-yellow-500/50 text-yellow-200 p-4 rounded-xl">
          <p className="font-bold">Alias rules unavailable</p>
          <p className="text-sm mt-1">{aliasError}</p>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-pink-400">Recent Attendees</h2>
          <p className="text-gray-400 text-sm mb-4">Found in the last 10 meetings. Use Merge to normalize names.</p>

          <div className="h-96 overflow-y-auto pr-2 custom-scrollbar">
            {loading ? <p>Loading...</p> : (
              <ul className="space-y-3">
                {attendees.map((name) => (
                  <li
                    key={name}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 bg-gray-700/70 border border-gray-600 p-3 rounded-xl hover:bg-gray-700 hover:border-purple-400/50 transition"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-gray-900/70 border border-gray-600 flex items-center justify-center text-xs font-bold text-purple-300 shrink-0">
                        {name?.charAt(0)?.toUpperCase() || '?'}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-gray-100 truncate">{name}</p>
                        <p className="text-xs text-gray-400">Alias this attendee name</p>
                      </div>
                    </div>
                    <button
                      onClick={() => { setSelectedName(name); setIsModalOpen(true); }}
                      className="bg-gradient-to-r from-purple-600 to-pink-600 hover:opacity-90 text-white px-4 py-2 rounded-lg text-xs font-bold tracking-wide uppercase"
                    >
                      Merge
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <div className="bg-gray-800 p-6 rounded-xl shadow-lg border border-gray-700">
          <h2 className="text-xl font-semibold mb-4 text-purple-400">Active Merge Rules</h2>
          <p className="text-gray-400 text-sm mb-4">These overrides are applied automatically before sync.</p>

          <div className="h-96 overflow-y-auto pr-2 custom-scrollbar">
            {aliases.length === 0 ? <p className="text-gray-500">No rules yet.</p> : (
              <ul className="space-y-3">
                {aliases.map((alias) => (
                  <li
                    key={alias.id}
                    className="grid grid-cols-[1fr_auto] items-center gap-3 bg-gray-700/70 border border-gray-600 p-3 rounded-xl hover:border-pink-400/40 transition"
                  >
                    <div className="text-sm flex items-center gap-2 flex-wrap">
                      <span className="text-red-300 line-through bg-red-900/20 border border-red-500/30 px-2 py-1 rounded">
                        {alias.original_name}
                      </span>
                      <span className="text-gray-400 text-xs uppercase tracking-wide">merged to</span>
                      <span className="text-green-300 font-bold bg-green-900/20 border border-green-500/30 px-2 py-1 rounded">
                        {alias.target_name}
                      </span>
                    </div>
                    <button
                      onClick={() => handleDeleteAlias(alias.id)}
                      className="text-red-300 hover:text-red-200 border border-red-500/40 hover:border-red-400 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide"
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center p-4">
          <div className="bg-gray-800 p-6 rounded-xl w-full max-w-md border border-gray-600">
            <h3 className="text-xl font-bold mb-4">Merge "{selectedName}"</h3>
            <p className="mb-2 text-sm text-gray-400">Enter the correct canonical name for this attendee:</p>
            <input
              type="text"
              className="w-full p-2 rounded bg-gray-700 border border-gray-600 focus:outline-none focus:border-purple-500 mb-4"
              placeholder="e.g. Lori Smith"
              value={targetName}
              onChange={(e) => setTargetName(e.target.value)}
            />

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 rounded text-gray-300 hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={handleMerge}
                className="px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 rounded text-white font-bold hover:opacity-90"
              >
                Save Rule
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
