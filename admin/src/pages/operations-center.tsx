import React, { useEffect, useState, useCallback } from 'react';
import api from '../lib/api';
import ExportButton from '../components/ExportButton';

interface OcSummary {
  has_app: number;
  uses_it: number;
  interested: number;
  explained: number;
  total_surveyed: number;
}

interface OcByOrg {
  org_name: string;
  has_app: number;
  uses_it: number;
  interested: number;
  total_surveyed: number;
}

interface OcAdoptionData {
  summary: OcSummary;
  by_org: OcByOrg[];
}

function pct(n: number, total: number): string {
  if (!total) return '—';
  return `${Math.round((n / total) * 100)}%`;
}

function defaultFrom(): string {
  const d = new Date(); d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

export default function OperationsCenterPage() {
  const [data, setData]       = useState<OcAdoptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [from, setFrom]       = useState(defaultFrom());
  const [to, setTo]           = useState('');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, string> = {};
      if (from) params.from = new Date(from).toISOString();
      if (to)   params.to   = new Date(to + 'T23:59:59').toISOString();
      const res = await api.get<OcAdoptionData>('/reports/oc-adoption', { params });
      setData(res.data);
    } catch {
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [from, to]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const exportRows = (data?.by_org ?? []).map((o) => ({
    'Organização':        o.org_name,
    'Tem OC instalado':   o.has_app,
    'Usa OC':             o.uses_it,
    'Quer aprender':      o.interested,
    'Total pesquisado':   o.total_surveyed,
    '% Instalado':        pct(o.has_app, o.total_surveyed),
    '% Usa':              pct(o.uses_it, o.total_surveyed),
    '% Interessado':      pct(o.interested, o.total_surveyed),
  }));

  const s = data?.summary;
  const total = s?.total_surveyed ?? 0;

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📱 Adoção do Operations Center</h1>
          <p className="text-sm text-gray-500 mt-1">Plataforma gratuita John Deere — dados coletados pelos técnicos</p>
        </div>
        <ExportButton data={exportRows} filename="oc-adoption" label="Exportar Excel" />
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">De</label>
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jd-green" />
        </div>
        <div>
          <label className="block text-xs font-semibold text-gray-500 mb-1 uppercase tracking-wide">Até</label>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-jd-green" />
        </div>
        <button onClick={fetchData}
          className="px-4 py-2 bg-jd-green text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors">
          Filtrar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-32">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jd-green" />
        </div>
      ) : !data ? (
        <div className="text-center py-12 text-gray-400">Erro ao carregar dados.</div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { emoji: '📱', label: 'OC Instalado',       value: s!.has_app,    pctVal: pct(s!.has_app, total),    color: 'text-blue-600' },
              { emoji: '👍', label: 'Usa Ativamente',     value: s!.uses_it,    pctVal: pct(s!.uses_it, total),    color: 'text-green-600' },
              { emoji: '🎓', label: 'Quer Aprender',      value: s!.interested, pctVal: pct(s!.interested, total), color: 'text-amber-600' },
              { emoji: '📷', label: 'Técnico Explicou',   value: s!.explained,  pctVal: pct(s!.explained, total),  color: 'text-purple-600' },
            ].map(({ emoji, label, value, pctVal, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-2xl mb-1">{emoji}</p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
                <p className="text-xs text-gray-400 mt-0.5">{pctVal} de {total} pesquisados</p>
              </div>
            ))}
          </div>

          {total === 0 && (
            <div className="text-center py-8 text-gray-400 bg-white rounded-xl border border-gray-100">
              Nenhuma pesquisa de OC registrada no período. As pesquisas aparecem após técnicos finalizarem atividades.
            </div>
          )}

          {/* By-org table */}
          {data.by_org.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-800">Adoção por Organização</h2>
                <p className="text-xs text-gray-400 mt-0.5">Somente organizações com pelo menos uma pesquisa registrada</p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-100">
                    <tr>
                      {['Organização', 'Pesquisados', '📱 Instalado', '👍 Usa', '🎓 Interessado', 'Oportunidade'].map((h) => (
                        <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_org.map((o) => {
                      const notUsing = o.has_app - o.uses_it;
                      const noApp = o.total_surveyed - o.has_app;
                      return (
                        <tr key={o.org_name} className="border-b border-gray-50 hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-900 max-w-[200px] truncate">{o.org_name}</td>
                          <td className="px-4 py-3 text-center text-gray-500">{o.total_surveyed}</td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${o.has_app > 0 ? 'text-blue-600' : 'text-gray-300'}`}>
                              {o.has_app} <span className="text-xs text-gray-400">({pct(o.has_app, o.total_surveyed)})</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${o.uses_it > 0 ? 'text-green-600' : 'text-gray-300'}`}>
                              {o.uses_it} <span className="text-xs text-gray-400">({pct(o.uses_it, o.total_surveyed)})</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-semibold ${o.interested > 0 ? 'text-amber-600' : 'text-gray-300'}`}>
                              {o.interested} <span className="text-xs text-gray-400">({pct(o.interested, o.total_surveyed)})</span>
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-500">
                            {noApp > 0 && <span className="mr-2 bg-red-50 text-red-600 px-1.5 py-0.5 rounded">{noApp} sem app</span>}
                            {notUsing > 0 && <span className="bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded">{notUsing} não usa</span>}
                            {noApp === 0 && notUsing === 0 && <span className="text-green-600">✅ Engajados</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
