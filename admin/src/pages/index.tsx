import React, { useEffect, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import api from '../lib/api';
import StatCard from '../components/ui/StatCard';
import Semaphore, { getSemaphoreLevel } from '../components/ui/Semaphore';
import ConnectivityPie from '../components/charts/ConnectivityPie';
import GapBars from '../components/charts/GapBars';
import EngagementDonut from '../components/charts/EngagementDonut';
import TechHoursChart from '../components/charts/TechHoursChart';
import ExportButton from '../components/ExportButton';
import { SummaryStats, BiRow, TechnicianReport, Machine, FieldVisitNoCollection, Activity, VisitManagement } from '../types';

const POLL_MS = 30_000;

const MachineMap = dynamic(() => import('../components/map/MachineMap'), { ssr: false });

export default function DashboardPage() {
  const [summary, setSummary] = useState<SummaryStats | null>(null);
  const [biData, setBiData] = useState<BiRow[]>([]);
  const [techData, setTechData] = useState<TechnicianReport[]>([]);
  const [orgData, setOrgData] = useState<{ name: string; offline_machines: number }[]>([]);
  const [visits, setVisits] = useState<FieldVisitNoCollection[]>([]);
  const [liveActivities, setLiveActivities] = useState<Activity[]>([]);
  const [visitData, setVisitData] = useState<VisitManagement[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get<SummaryStats>('/reports/summary'),
      api.get<BiRow[]>('/reports/bi'),
      api.get<TechnicianReport[]>('/reports/technicians'),
      api.get<{ name: string; offline_machines: number }[]>('/reports/organizations'),
      api.get<FieldVisitNoCollection[]>('/visits/no-collection'),
      api.get<Activity[]>('/activities', { params: { status: 'in_progress' } }),
      api.get<VisitManagement[]>('/visits/management', {
        params: { from: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString() },
      }),
    ]).then(([sum, bi, tech, orgs, v, live, vm]) => {
      setSummary(sum.data);
      setBiData(Array.isArray(bi.data) ? bi.data : []);
      setTechData(Array.isArray(tech.data) ? tech.data : []);
      setOrgData(Array.isArray(orgs.data) ? orgs.data.slice(0, 10) : []);
      setVisits(Array.isArray(v.data) ? v.data : []);
      setLiveActivities(Array.isArray(live.data) ? live.data : []);
      setVisitData(Array.isArray(vm.data) ? vm.data : []);
    }).catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const refreshLive = useCallback(async () => {
    try {
      const res = await api.get<Activity[]>('/activities', { params: { status: 'in_progress' } });
      setLiveActivities(Array.isArray(res.data) ? res.data : []);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    const interval = setInterval(refreshLive, POLL_MS);
    return () => clearInterval(interval);
  }, [refreshLive]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-jd-green" />
      </div>
    );
  }

  if (!summary) return <div className="text-red-500">Erro ao carregar dados.</div>;

  // Indicator 18 calculations
  const orgsWithData = biData.filter((r) => r.vca_setup_file !== undefined);
  const basicTechPct = orgsWithData.length
    ? (orgsWithData.filter((r) => r.vca_setup_file || r.vca_equipment_monitoring).length / orgsWithData.length) * 100
    : 0;
  const advTechPct = orgsWithData.length
    ? (orgsWithData.filter((r) => r.vca_work_plan || r.vca_agronomic_reports || r.vca_work_details).length / orgsWithData.length) * 100
    : 0;

  const totalMaxHarvest = biData.reduce((a, r) => a + (r.max_harvest ?? 0), 0);
  const totalYtdHarvest = biData.reduce((a, r) => a + (r.ytd_harvest ?? 0), 0);
  const harvestPct = totalMaxHarvest > 0 ? (totalYtdHarvest / totalMaxHarvest) * 100 : 0;

  const totalAcres = biData.reduce((a, r) => a + (r.risk_acres ?? 0) + (r.highly_engaged_acres ?? 0), 0);
  const riskPct = totalAcres > 0 ? (biData.reduce((a, r) => a + (r.risk_acres ?? 0), 0) / totalAcres) * 100 : 0;

  const totalModems = biData.reduce((a, r) => a + (r.all_modems ?? 0), 0);
  const inactiveModems = biData.reduce((a, r) => a + (r.non_active_modems ?? 0), 0);
  const gen45 = biData.reduce((a, r) => a + (r.lg_ag_connected_gen45 ?? 0), 0);
  const notSubmitting = biData.reduce((a, r) => a + (r.lg_ag_not_submitting ?? 0), 0);

  const machineMapData: Partial<Machine>[] = biData.map((r) => ({
    id: r.org_id,
    org_name: r.org_name,
    days_offline: r.offline_machines_count,
  }));

  const visitMapData = visits.map((v) => ({
    visit_lat: v.visit_lat ?? 0,
    visit_lng: v.visit_lng ?? 0,
    has_collection: false,
    technician_name: v.technician_name,
  }));

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard — BI DataSync Field</h1>
          <p className="text-gray-500 text-sm mt-1">Indicadores John Deere Operations Center · Indicador 18</p>
        </div>
        <ExportButton
          data={biData.map((r) => ({
            Organização: r.org_name,
            'ID JD': r.org_id_jd,
            Engajamento: r.engagement_level ?? '',
            'Total Modems': r.all_modems ?? '',
            'Modems Inativos': r.non_active_modems ?? '',
            'Gen4/G5 Conectadas': r.lg_ag_connected_gen45 ?? '',
            'Conectadas s/ Dados': r.lg_ag_not_submitting ?? '',
            'Hectares em Risco': r.risk_acres ?? '',
            'Hectares Engajados': r.highly_engaged_acres ?? '',
            'YTD Preparo (ha)': r.ytd_prepare ?? '',
            'GAP Preparo (ha)': r.gap_prepare ?? '',
            'YTD Plantio (ha)': r.ytd_plant ?? '',
            'GAP Plantio (ha)': r.gap_plant ?? '',
            'YTD Aplicação (ha)': r.ytd_apply ?? '',
            'GAP Aplicação (ha)': r.gap_apply ?? '',
            'YTD Colheita (ha)': r.ytd_harvest ?? '',
            'GAP Colheita (ha)': r.gap_harvest ?? '',
            'Máq. Offline': r.offline_machines_count ?? '',
          }))}
          filename="bi-datasync-field"
          label="Exportar BI Excel"
        />
      </div>

      {/* Bloco 1 — Conectividade */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Conectividade de Máquinas</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard title="Total Máquinas" value={summary.machines.total} />
          <StatCard title="30–60 dias offline" value={summary.machines.range_30_60} color="text-yellow-600" />
          <StatCard title="61–365 dias offline" value={summary.machines.range_61_365} color="text-red-600" />
          <StatCard title="365+ dias offline" value={summary.machines.range_365plus} color="text-gray-900" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ConnectivityPie stats={summary} />
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">
            <h3 className="font-semibold text-gray-700 mb-4">Top 10 — Organizações com mais máquinas offline</h3>
            <div className="space-y-2">
              {orgData.map((o, i) => (
                <div key={i} className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 truncate max-w-[200px]">{o.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="h-2 bg-red-400 rounded" style={{ width: `${Math.min(100, (o.offline_machines / (orgData[0]?.offline_machines || 1)) * 100)}px` }} />
                    <span className="text-sm font-semibold text-gray-900 w-8 text-right">{o.offline_machines}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Bloco 2 — Indicador 18 */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Indicador 18 — Adoção e Utilização de Tecnologias</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <Semaphore
            level={getSemaphoreLevel(basicTechPct, [45, 58, 65])}
            label="18.1 Basic Tech Utilization"
            value={`${basicTechPct.toFixed(1)}%`}
            thresholds="🔴<45% 🟡45-58% 🟢58-65% 🟢🟢>65%"
          />
          <Semaphore
            level={getSemaphoreLevel(advTechPct, [10, 20, 30])}
            label="18.2 Advanced Tech"
            value={`${advTechPct.toFixed(1)}%`}
            thresholds="🔴<10% 🟡10-20% 🟢10-30% 🟢🟢>30%"
          />
          <Semaphore
            level={getSemaphoreLevel(harvestPct, [30, 60, 80])}
            label="18.3 Harvesting Tech"
            value={`${harvestPct.toFixed(1)}%`}
            thresholds="🔴<30% 🟡30-60% 🟢60-80% 🟢🟢>80%"
          />
          <Semaphore
            level={getSemaphoreLevel(riskPct, [10, 20, 5], true)}
            label="18.4 % Hectares em Risco"
            value={`${riskPct.toFixed(1)}%`}
            thresholds="🔴>20% 🟡10-20% 🟢5-10% 🟢🟢<5%"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <GapBars biData={biData} />
          <EngagementDonut biData={biData} />
        </div>

        {/* 18.7 — Modems */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <StatCard title="Total Modems JDLink" value={totalModems} />
          <StatCard title="Modems Inativos" value={inactiveModems} color="text-red-600" />
          <StatCard title="Gen4/G5 Conectadas" value={gen45} color="text-green-700" />
          <StatCard title="Conectadas s/ Dados Agron." value={notSubmitting} color="text-yellow-600" />
        </div>

        {/* 18.8 — Hectares summary */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <StatCard
            title="Hectares em Risco"
            value={summary.hectares.risk_acres.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            subtitle="Risk Acres total"
            color="text-red-600"
          />
          <StatCard
            title="Hectares Altamente Engajados"
            value={summary.hectares.highly_engaged_acres.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            subtitle="Highly Engaged Acres"
            color="text-green-700"
          />
          <StatCard
            title="Total Organizações"
            value={summary.organizations_total}
            subtitle="Com dados no sistema"
          />
        </div>
      </section>

      {/* Bloco 3 — Conformidade de Visitas */}
      {(() => {
        const nonPending = visitData.filter((v) => v.visit_status !== 'pending');
        const full = nonPending.filter((v) => v.visit_status === 'full_collection').length;
        const partial = nonPending.filter((v) => v.visit_status === 'partial_collection').length;
        const noCol = nonPending.filter((v) => v.visit_status === 'no_collection').length;
        const compliancePct = nonPending.length > 0 ? Math.round((full / nonPending.length) * 100) : 0;

        // Top 3 technicians by compliance rate
        type TechStat = { name: string; full: number; total: number };
        const techMap = new Map<number, TechStat>();
        nonPending.forEach((v) => {
          const key = v.technician_id ?? 0;
          const s = techMap.get(key) ?? { name: v.technician_name ?? '?', full: 0, total: 0 };
          s.total++;
          if (v.visit_status === 'full_collection') s.full++;
          techMap.set(key, s);
        });
        const topTechs = Array.from(techMap.values())
          .filter((s) => s.total > 0)
          .map((s) => ({ name: s.name, pct: Math.round((s.full / s.total) * 100), total: s.total }))
          .sort((a, b) => b.pct - a.pct)
          .slice(0, 3);

        // Alert: technicians with 2+ consecutive no_collection
        const techVisits = new Map<number, VisitManagement[]>();
        visitData.forEach((v) => {
          const key = v.technician_id ?? 0;
          const arr = techVisits.get(key) ?? [];
          arr.push(v);
          techVisits.set(key, arr);
        });
        const alertTechs: string[] = [];
        techVisits.forEach((vs) => {
          const sorted = [...vs].sort(
            (a, b) => new Date(b.detected_at).getTime() - new Date(a.detected_at).getTime()
          );
          if (
            sorted.length >= 2 &&
            sorted[0].visit_status === 'no_collection' &&
            sorted[1].visit_status === 'no_collection'
          ) {
            alertTechs.push(sorted[0].technician_name ?? '?');
          }
        });

        if (nonPending.length === 0) return null;

        return (
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Conformidade de Visitas — últimos 7 dias</h2>

            {/* Alert banner */}
            {alertTechs.length > 0 && (
              <div className="mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
                <span className="text-red-500 text-xl">⚠️</span>
                <div>
                  <p className="font-semibold text-red-800 text-sm">Técnicos com 2+ visitas seguidas sem coleta</p>
                  <p className="text-red-700 text-sm mt-0.5">{alertTechs.join(', ')}</p>
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 col-span-2 md:col-span-1 flex flex-col items-center justify-center">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1">Conformidade</p>
                <p className={`text-4xl font-bold ${compliancePct >= 80 ? 'text-green-600' : compliancePct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {compliancePct}%
                </p>
                <p className="text-xs text-gray-400 mt-1">{nonPending.length} visitas avaliadas</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase">Coleta Completa</p>
                <p className="text-2xl font-bold text-green-600">{full}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase">Coleta Parcial</p>
                <p className="text-2xl font-bold text-yellow-600">{partial}</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col justify-between">
                <p className="text-xs font-semibold text-gray-400 uppercase">Sem Coleta</p>
                <p className="text-2xl font-bold text-red-600">{noCol}</p>
              </div>
            </div>

            {/* Top 3 technicians */}
            {topTechs.length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <h3 className="font-semibold text-gray-700 text-sm mb-3">Top 3 Técnicos por Conformidade</h3>
                <div className="space-y-2">
                  {topTechs.map((t, i) => (
                    <div key={t.name} className="flex items-center gap-3">
                      <span className="text-xs font-bold text-gray-400 w-4">{i + 1}.</span>
                      <span className="text-sm text-gray-700 flex-1">{t.name}</span>
                      <div className="flex items-center gap-2">
                        <div
                          className={`h-2 rounded ${t.pct >= 80 ? 'bg-green-400' : t.pct >= 50 ? 'bg-yellow-400' : 'bg-red-400'}`}
                          style={{ width: `${Math.max(8, t.pct)}px` }}
                        />
                        <span className={`text-sm font-bold w-10 text-right ${t.pct >= 80 ? 'text-green-600' : t.pct >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
                          {t.pct}%
                        </span>
                        <span className="text-xs text-gray-400">({t.total})</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* Bloco 4 — Campo */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">Indicadores de Campo</h2>

        {/* Live collections panel */}
        <div className={`rounded-xl border p-5 mb-6 ${liveActivities.length > 0 ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
          <div className="flex items-center gap-2 mb-3">
            <span className={`w-2 h-2 rounded-full inline-block ${liveActivities.length > 0 ? 'bg-blue-500 animate-pulse' : 'bg-gray-300'}`} />
            <h3 className={`font-semibold text-sm ${liveActivities.length > 0 ? 'text-blue-800' : 'text-gray-500'}`}>
              Coletas em Andamento — {liveActivities.length === 0 ? 'Nenhuma no momento' : `${liveActivities.length} ativa${liveActivities.length > 1 ? 's' : ''}`}
            </h3>
          </div>
          {liveActivities.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-blue-200">
                    <th className="text-left py-2 text-blue-700 font-medium">Técnico</th>
                    <th className="text-left py-2 text-blue-700 font-medium">Fazenda</th>
                    <th className="text-left py-2 text-blue-700 font-medium">Máquina</th>
                    <th className="text-left py-2 text-blue-700 font-medium">Método</th>
                    <th className="text-right py-2 text-blue-700 font-medium">Iniciada às</th>
                  </tr>
                </thead>
                <tbody>
                  {liveActivities.map((a) => (
                    <tr key={a.id} className="border-b border-blue-100">
                      <td className="py-2 font-medium text-gray-900">{a.technician_name ?? '—'}</td>
                      <td className="py-2 text-gray-700">{a.org_name ?? '—'}</td>
                      <td className="py-2 font-mono text-xs text-gray-600">{a.machine_pin ?? a.machine_custom_name ?? '—'}</td>
                      <td className="py-2 text-gray-600 text-xs">
                        {a.method === 'starlink_data_sync' ? 'Starlink + Data Sync' : 'Pen Drive'}
                      </td>
                      <td className="py-2 text-right text-gray-500 text-xs">
                        {new Date(a.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <TechHoursChart data={techData} />

        {visits.length > 0 && (
          <div className="mt-6 bg-amber-50 border border-amber-200 rounded-xl p-5">
            <h3 className="font-semibold text-amber-800 mb-3">
              Alertas — Técnicos presentes sem coleta ({visits.length})
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-amber-200">
                    <th className="text-left py-2 text-amber-700">Data</th>
                    <th className="text-left py-2 text-amber-700">Técnico</th>
                    <th className="text-left py-2 text-amber-700">Organização</th>
                    <th className="text-right py-2 text-amber-700">Máq. Pendentes</th>
                  </tr>
                </thead>
                <tbody>
                  {visits.slice(0, 10).map((v) => (
                    <tr key={v.id} className="border-b border-amber-100">
                      <td className="py-2">{new Date(v.created_at).toLocaleDateString('pt-BR')}</td>
                      <td className="py-2">{v.technician_name}</td>
                      <td className="py-2">{v.org_name}</td>
                      <td className="py-2 text-right font-semibold text-red-600">{v.machines_pending}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
