import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import ExportButton from '../components/ExportButton';

interface JdUnlinkedMachine {
  id: number;
  pin?: string;
  organization_name?: string;
  brand?: string;
  model?: string;
  machine_name?: string;
  machine_type?: string;
  year?: number;
  engine_hours?: number;
  notes?: string;
  created_by?: string;
  created_at: string;
  technician_name?: string;
  activity_count?: number;
  last_activity_at?: string;
}

interface NonJdMachine {
  id: number;
  serial_number?: string;
  custom_name: string;
  brand?: string;
  model?: string;
  description?: string;
  created_at: string;
  created_by?: string;
  org_count?: number;
  org_names?: string;
  activity_count?: number;
  last_activity_at?: string;
}

type Tab = 'jd' | 'non_jd';

function fmtDate(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR');
}

function thisMonth(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

export default function MachinesPage() {
  const [tab, setTab]             = useState<Tab>('jd');
  const [jdMachines, setJd]       = useState<JdUnlinkedMachine[]>([]);
  const [nonJdMachines, setNonJd] = useState<NonJdMachine[]>([]);
  const [loading, setLoading]     = useState(true);

  // Filters
  const [filterPin, setFilterPin]   = useState('');
  const [filterTech, setFilterTech] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterFrom, setFilterFrom] = useState('');
  const [filterTo, setFilterTo]     = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [jdRes, nonJdRes] = await Promise.all([
        api.get<JdUnlinkedMachine[]>('/machines/jd-unlinked'),
        api.get<NonJdMachine[]>('/non-jd-machines'),
      ]);
      setJd(Array.isArray(jdRes.data) ? jdRes.data : []);
      setNonJd(Array.isArray(nonJdRes.data) ? nonJdRes.data : []);
    } catch {
      // keep stale data
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  // KPIs
  const totalJd         = jdMachines.length;
  const totalNonJd      = nonJdMachines.length;
  const cadastrosMonth  = [
    ...jdMachines.filter((m) => thisMonth(m.created_at)),
    ...nonJdMachines.filter((m) => thisMonth(m.created_at)),
  ].length;

  const techCounts: Record<string, number> = {};
  [...jdMachines, ...nonJdMachines].forEach((m) => {
    const t = (m as JdUnlinkedMachine).technician_name
      ?? (m as JdUnlinkedMachine).created_by
      ?? '—';
    if (thisMonth(m.created_at)) techCounts[t] = (techCounts[t] ?? 0) + 1;
  });
  const topTech = Object.entries(techCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '—';

  // Filtered views
  const filteredJd = jdMachines.filter((m) => {
    if (filterPin  && !(m.pin ?? '').toLowerCase().includes(filterPin.toLowerCase()))   return false;
    if (filterTech && !(m.technician_name ?? m.created_by ?? '').toLowerCase().includes(filterTech.toLowerCase())) return false;
    if (filterType && m.machine_type !== filterType) return false;
    if (filterFrom && new Date(m.created_at) < new Date(filterFrom)) return false;
    if (filterTo   && new Date(m.created_at) > new Date(filterTo + 'T23:59:59'))        return false;
    return true;
  });

  const filteredNonJd = nonJdMachines.filter((m) => {
    if (filterPin  && !(m.serial_number ?? '').toLowerCase().includes(filterPin.toLowerCase()) &&
        !m.custom_name.toLowerCase().includes(filterPin.toLowerCase()))                 return false;
    if (filterTech && !(m.created_by ?? '').toLowerCase().includes(filterTech.toLowerCase())) return false;
    if (filterFrom && new Date(m.created_at) < new Date(filterFrom))                   return false;
    if (filterTo   && new Date(m.created_at) > new Date(filterTo + 'T23:59:59'))        return false;
    return true;
  });

  const jdExportRows = filteredJd.map((m) => ({
    'PIN/Chassi':      m.pin ?? '—',
    'Organização':     m.organization_name ?? '—',
    'Marca':           m.brand ?? 'John Deere',
    'Modelo':          m.model ?? '—',
    'Nome':            m.machine_name ?? '—',
    'Tipo':            m.machine_type ?? '—',
    'Ano':             m.year ?? '—',
    'Horímetro':       m.engine_hours ?? '—',
    'Técnico':         m.technician_name ?? m.created_by ?? '—',
    'Cadastrado em':   fmtDate(m.created_at),
    'Atividades':      m.activity_count ?? 0,
    'Observações':     m.notes ?? '',
  }));

  const nonJdExportRows = filteredNonJd.map((m) => ({
    'Série/Chassi':  m.serial_number ?? '—',
    'Nome':          m.custom_name,
    'Marca':         m.brand ?? '—',
    'Modelo':        m.model ?? '—',
    'Organizações':  m.org_names ?? '—',
    'Técnico':       m.created_by ?? '—',
    'Cadastrado em': fmtDate(m.created_at),
    'Atividades':    m.activity_count ?? 0,
  }));

  const JD_TYPES = ['Trator', 'Colhedora', 'Pulverizador', 'Plantadeira', 'Outro'];

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Máquinas Cadastradas</h1>
          <p className="text-sm text-gray-500 mt-1">Máquinas JD sem vínculo e máquinas não-JD registradas em campo</p>
        </div>
        <ExportButton
          data={tab === 'jd' ? jdExportRows : nonJdExportRows}
          filename={tab === 'jd' ? 'maquinas-jd' : 'maquinas-nao-jd'}
          label="Exportar Excel"
        />
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'JD cadastradas',     value: totalJd,        color: 'text-jd-green' },
          { label: 'Não-JD cadastradas', value: totalNonJd,     color: 'text-gray-900' },
          { label: 'Cadastros este mês', value: cadastrosMonth, color: 'text-blue-600' },
          { label: 'Técnico mais ativo', value: topTech,        color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
            <p className={`text-2xl font-bold ${color} truncate`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl w-fit">
        {(['jd', 'non_jd'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-colors ${
              tab === t ? 'bg-white text-jd-green shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'jd' ? `🟡 John Deere (${totalJd})` : `⚙️ Não-JD (${totalNonJd})`}
          </button>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-3">
        <input
          type="text" value={filterPin} onChange={(e) => setFilterPin(e.target.value)}
          placeholder="PIN / Chassi" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        />
        <input
          type="text" value={filterTech} onChange={(e) => setFilterTech(e.target.value)}
          placeholder="Técnico" className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
        />
        {tab === 'jd' && (
          <select
            value={filterType} onChange={(e) => setFilterType(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green"
          >
            <option value="">Todos os tipos</option>
            {JD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        )}
        <input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green" />
        <input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-jd-green" />
        <button onClick={() => { setFilterPin(''); setFilterTech(''); setFilterType(''); setFilterFrom(''); setFilterTo(''); }}
          className="border border-gray-200 rounded-lg px-4 py-2 text-sm text-gray-500 hover:bg-gray-50">
          Limpar
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jd-green" />
          </div>
        ) : tab === 'jd' ? (
          filteredJd.length === 0 ? (
            <p className="text-center py-12 text-gray-400 text-sm">Nenhuma máquina JD cadastrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['PIN/Chassi', 'Organização', 'Marca', 'Modelo', 'Nome', 'Tipo', 'Ano', 'Horímetro', 'Técnico', 'Cadastro', 'Atividades', 'Observações'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredJd.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">{m.pin ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700 max-w-[140px] truncate">{m.organization_name ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{m.brand ?? 'John Deere'}</td>
                      <td className="px-4 py-3 text-gray-700">{m.model ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{m.machine_name ?? '—'}</td>
                      <td className="px-4 py-3">
                        {m.machine_type ? (
                          <span className="bg-yellow-50 text-yellow-800 text-xs font-semibold px-2 py-0.5 rounded-full">
                            {m.machine_type}
                          </span>
                        ) : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-right">{m.year ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 text-right">{m.engine_hours != null ? `${m.engine_hours} h` : '—'}</td>
                      <td className="px-4 py-3 text-gray-700">
                        <div>{m.technician_name ?? m.created_by ?? '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        {(m.activity_count ?? 0) > 0 ? (
                          <span className="bg-jd-green/10 text-jd-green text-xs font-bold px-2 py-0.5 rounded-full">
                            {m.activity_count}
                          </span>
                        ) : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate" title={m.notes ?? ''}>
                        {m.notes ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          filteredNonJd.length === 0 ? (
            <p className="text-center py-12 text-gray-400 text-sm">Nenhuma máquina não-JD cadastrada ainda.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b border-gray-100">
                  <tr>
                    {['Série/Chassi', 'Nome', 'Marca', 'Modelo', 'Tipo', 'Ano', 'Horímetro', 'Organizações', 'Técnico', 'Cadastro', 'Atividades', 'Observações'].map((h) => (
                      <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredNonJd.map((m) => (
                    <tr key={m.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs font-semibold text-gray-800">{m.serial_number ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-gray-900">{m.custom_name}</td>
                      <td className="px-4 py-3 text-gray-500">{m.brand ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{m.model ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-300">—</td>
                      <td className="px-4 py-3 text-gray-300 text-right">—</td>
                      <td className="px-4 py-3 text-gray-300 text-right">—</td>
                      <td className="px-4 py-3 text-gray-600 max-w-[200px] truncate" title={m.org_names ?? ''}>
                        {m.org_names || <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-700">{m.created_by ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{fmtDate(m.created_at)}</td>
                      <td className="px-4 py-3 text-center">
                        {(m.activity_count ?? 0) > 0 ? (
                          <span className="bg-jd-green/10 text-jd-green text-xs font-bold px-2 py-0.5 rounded-full">
                            {m.activity_count}
                          </span>
                        ) : <span className="text-gray-300">0</span>}
                      </td>
                      <td className="px-4 py-3 text-gray-400 text-xs max-w-[160px] truncate" title={m.description ?? ''}>
                        {m.description ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>
    </div>
  );
}
