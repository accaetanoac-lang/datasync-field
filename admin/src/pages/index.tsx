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
import { SummaryStats, BiRow, TechnicianReport, Machine, FieldVisitNoCollection, Activity, VisitManagement, Impediment, HighlyEngagedReport } from '../types';

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
  const [diagnosisActivities, setDiagnosisActivities] = useState<Activity[]>([]);
  const [impediments, setImpediments] = useState<Impediment[]>([]);
  const [nonJdCount, setNonJdCount]         = useState(0);
  const [ocSummary, setOcSummary]           = useState<{ has_app: number; uses_it: number; interested: number; total_surveyed: number } | null>(null);
  const [highlyEngaged, setHighlyEngaged]   = useState<HighlyEngagedReport | null>(null);
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
      api.get<Activity[]>('/activities', {
        params: {
          is_diagnosis: 'true',
          date_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        },
      }),
    ]).then(([sum, bi, tech, orgs, v, live, vm, diag]) => {
      // Normalize summary so nested properties are always defined
      const raw = sum.data as Partial<SummaryStats> | null | undefined;
      setSummary({
        machines: {
          total:             raw?.machines?.total             ?? 0,
          range_30_60:       raw?.machines?.range_30_60       ?? 0,
          range_61_365:      raw?.machines?.range_61_365      ?? 0,
          range_365plus:     raw?.machines?.range_365plus     ?? 0,
          no_connection_date: raw?.machines?.no_connection_date ?? 0,
        },
        hectares: {
          risk_acres:           raw?.hectares?.risk_acres           ?? 0,
          highly_engaged_acres: raw?.hectares?.highly_engaged_acres ?? 0,
        },
        organizations_total: raw?.organizations_total ?? 0,
      });
      setBiData(Array.isArray(bi.data) ? bi.data : []);
      setTechData(Array.isArray(tech.data) ? tech.data : []);
      setOrgData(Array.isArray(orgs.data) ? orgs.data.slice(0, 10) : []);
      setVisits(Array.isArray(v.data) ? v.data : []);
      setLiveActivities(Array.isArray(live.data) ? live.data : []);
      setVisitData(Array.isArray(vm.data) ? vm.data : []);
      setDiagnosisActivities(Array.isArray(diag.data) ? diag.data : []);
    }).catch(console.error)
      .finally(() => setLoading(false));

    const from30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    api.get<Impediment[]>('/impediments', { params: { from: from30d } })
      .then((r) => setImpediments(Array.isArray(r.data) ? r.data : []))
      .catch(() => setImpediments([]));

    api.get<{ id: number }[]>('/non-jd-machines')
      .then((r) => setNonJdCount(Array.isArray(r.data) ? r.data.length : 0))
      .catch(() => setNonJdCount(0));

    api.get<{ summary: typeof ocSummary }>('/reports/oc-adoption')
      .then((r) => setOcSummary(r.data?.summary ?? null))
      .catch(() => setOcSummary(null));

    api.get<HighlyEngagedReport>('/reports/highly-engaged')
      .then((r) => setHighlyEngaged(r.data ?? null))
      .catch(() => setHighlyEngaged(null));
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
  // 18.1 denominator: orgs with at least 1 machine whose last_call_date is not null (JD spec)
  const orgsWithConnectedMachines = biData.filter((r) => (r.connected_machines_count ?? 0) > 0);
  const basicTechPct = orgsWithConnectedMachines.length
    ? (orgsWithConnectedMachines.filter((r) => r.vca_setup_file === true && r.vca_equipment_monitoring === true).length / orgsWithConnectedMachines.length) * 100
    : 0;
  const orgsWithData = biData.filter((r) => r.vca_setup_file !== undefined);
  const advOrgCount = orgsWithData.filter((r) => r.vca_work_plan || r.vca_agronomic_reports || r.vca_work_details).length;
  const advTechPct  = orgsWithData.length ? (advOrgCount / orgsWithData.length) * 100 : 0;

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

        {/* Connectivity diagnostics KPI */}
        {diagnosisActivities.length > 0 && (() => {
          const noModemActivities = diagnosisActivities.filter((a) => a.diagnosis_result === 'no_modem');
          const noModemMachines = Array.from(
            new Map(noModemActivities.filter((a) => a.machine_pin ?? a.machine_custom_name)
              .map((a) => [a.machine_pin ?? a.machine_custom_name, a.machine_pin ?? a.machine_custom_name ?? '—'])
            ).values()
          );

          const uniqueMachines = Array.from(
            new Map(
              diagnosisActivities
                .filter((a) => a.machine_pin ?? a.machine_custom_name)
                .map((a) => [
                  a.machine_pin ?? a.machine_custom_name,
                  { pin: a.machine_pin ?? a.machine_custom_name ?? '—', org: a.org_name ?? '—', result: a.diagnosis_result },
                ])
            ).values()
          ).slice(0, 10);

          return (
            <div className="mb-6 space-y-4">
              <div className="bg-orange-50 border border-orange-200 rounded-xl p-5">
                <div className="flex items-center gap-3 mb-3">
                  <span className="text-2xl">🔧</span>
                  <div>
                    <p className="font-bold text-orange-800 text-base">
                      {diagnosisActivities.length} diagnóstico{diagnosisActivities.length !== 1 ? 's' : ''} de conectividade — últimos 30 dias
                    </p>
                    <p className="text-orange-700 text-sm mt-0.5">
                      Máquinas com problema de conectividade identificado
                    </p>
                  </div>
                  {noModemMachines.length > 0 && (
                    <span className="ml-auto bg-blue-100 text-blue-700 text-xs font-bold px-3 py-1 rounded-full whitespace-nowrap">
                      📡 {noModemMachines.length} sem modem JDLink
                    </span>
                  )}
                </div>
                {uniqueMachines.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-orange-200">
                          <th className="text-left py-2 text-orange-700 font-medium">Máquina</th>
                          <th className="text-left py-2 text-orange-700 font-medium">Fazenda</th>
                          <th className="text-left py-2 text-orange-700 font-medium">Último resultado</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uniqueMachines.map((m, i) => (
                          <tr key={i} className="border-b border-orange-100">
                            <td className="py-1.5 font-mono text-xs text-gray-700">{m.pin}</td>
                            <td className="py-1.5 text-gray-700">{m.org}</td>
                            <td className="py-1.5">
                              {m.result === 'resolved'    && <span className="text-green-700 font-medium">✅ Restabelecida</span>}
                              {m.result === 'needs_return'&& <span className="text-yellow-700 font-medium">🔄 Requer retorno</span>}
                              {m.result === 'no_modem'    && <span className="text-blue-700 font-medium">📡 Sem Modem</span>}
                              {m.result === 'unidentified'&& <span className="text-red-700 font-medium">❌ Não identificado</span>}
                              {!m.result && <span className="text-gray-400">Em diagnóstico</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {noModemMachines.length > 0 && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-center gap-3">
                  <span className="text-xl">📡</span>
                  <div>
                    <p className="font-semibold text-blue-800 text-sm">
                      {noModemMachines.length} máquina{noModemMachines.length !== 1 ? 's' : ''} sem Modem JDLink instalado
                    </p>
                    <p className="text-blue-600 text-xs mt-0.5">
                      Sem o JDLink M ou R não é possível conectar ao Operations Center — requer instalação ou OS aberta
                    </p>
                  </div>
                </div>
              )}
            </div>
          );
        })()}
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
            level={getSemaphoreLevel(advTechPct, [8, 16, 20])}
            label="18.2 Advanced Tech"
            value={`${advOrgCount} org${advOrgCount !== 1 ? 's' : ''} = ${advTechPct.toFixed(1)}%`}
            thresholds="🔴<8% 🟡8-16% 🟢16-20% 🟢🟢>20%"
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

        {/* 18.6 — Highly Engaged Organizations (JD definition) */}
        {highlyEngaged && (
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide mb-3">
              18.6 — Highly Engaged Organizations (R12 · ≥4 VCAs em ≥10 dias)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Highly Engaged</p>
                <p className="text-3xl font-bold text-green-700">{highlyEngaged.total_highly_engaged}</p>
                <p className="text-xs text-gray-400">
                  {highlyEngaged.total_orgs > 0
                    ? `${((highlyEngaged.total_highly_engaged / highlyEngaged.total_orgs) * 100).toFixed(1)}% das orgs`
                    : '—'}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Retained</p>
                <p className="text-3xl font-bold text-jd-green">{highlyEngaged.total_retained}</p>
                <p className="text-xs text-gray-400">
                  {highlyEngaged.total_highly_engaged > 0
                    ? `${((highlyEngaged.total_retained / highlyEngaged.total_highly_engaged) * 100).toFixed(1)}% dos HE`
                    : '—'}
                </p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Novas HE</p>
                <p className="text-3xl font-bold text-blue-600">
                  {highlyEngaged.total_highly_engaged - highlyEngaged.total_retained}
                </p>
                <p className="text-xs text-gray-400">não eram HE no período anterior</p>
              </div>
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5 flex flex-col gap-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Total Orgs</p>
                <p className="text-3xl font-bold text-gray-700">{highlyEngaged.total_orgs}</p>
                <p className="text-xs text-gray-400">com dados no sistema</p>
              </div>
            </div>
            {highlyEngaged.orgs.filter((o) => o.is_highly_engaged).length > 0 && (
              <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
                  Orgs Highly Engaged — dias qualificados R12
                </p>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {highlyEngaged.orgs
                    .filter((o) => o.is_highly_engaged)
                    .map((o) => (
                      <div key={o.org_id} className="flex items-center gap-3">
                        <span className="text-xs text-gray-400 w-4">
                          {o.is_retained ? '🔒' : '🆕'}
                        </span>
                        <span className="text-sm text-gray-700 flex-1 truncate">{o.org_name}</span>
                        <div className="flex items-center gap-2">
                          <div
                            className="h-2 bg-green-400 rounded"
                            style={{ width: `${Math.min(80, o.qualifying_days * 4)}px` }}
                          />
                          <span className="text-sm font-bold text-green-700 w-12 text-right">
                            {o.qualifying_days}d
                          </span>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}
          </div>
        )}

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
            value={(summary.hectares?.risk_acres ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
            subtitle="Risk Acres total"
            color="text-red-600"
          />
          <StatCard
            title="Hectares Altamente Engajados"
            value={(summary.hectares?.highly_engaged_acres ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 0 })}
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

      {/* Bloco 5 — Operations Center Adoption */}
      {ocSummary && ocSummary.total_surveyed > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-gray-800 mb-3">📱 Adoção do Operations Center</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { emoji: '📱', label: 'OC Instalado',   n: ocSummary.has_app,    color: 'text-blue-600' },
              { emoji: '👍', label: 'Usa Ativamente',  n: ocSummary.uses_it,    color: 'text-green-600' },
              { emoji: '🎓', label: 'Quer Aprender',   n: ocSummary.interested, color: 'text-amber-600' },
              { emoji: '🔢', label: 'Pesquisados',     n: ocSummary.total_surveyed, color: 'text-gray-700' },
            ].map(({ emoji, label, n, color }) => (
              <div key={label} className="bg-white rounded-xl border border-gray-100 shadow-sm p-4">
                <p className="text-xl">{emoji}</p>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-1">{label}</p>
                <p className={`text-2xl font-bold ${color} mt-0.5`}>{n}</p>
                {ocSummary.total_surveyed > 0 && n !== ocSummary.total_surveyed && (
                  <p className="text-xs text-gray-400">{Math.round((n / ocSummary.total_surveyed) * 100)}%</p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Bloco 6 — Máquinas Não-JD KPI */}
      {nonJdCount > 0 && (
        <section>
          <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm flex items-center gap-4 max-w-xs">
            <span className="text-3xl">🚜</span>
            <div>
              <p className="text-2xl font-bold text-gray-900">{nonJdCount}</p>
              <p className="text-sm text-gray-500">máquina{nonJdCount !== 1 ? 's' : ''} não-JD cadastrada{nonJdCount !== 1 ? 's' : ''}</p>
            </div>
          </div>
        </section>
      )}

      {/* Bloco 6 — Impedimentos */}
      {impediments.length > 0 && (() => {
        const REASON_LABELS: Record<string, string> = {
          maintenance:  'Em manutenção',
          absent:       'Máquina ausente',
          in_operation: 'Em operação',
          outros:       'Outros',
        };
        const reasonCounts = impediments.reduce<Record<string, number>>((acc, imp) => {
          acc[imp.reason] = (acc[imp.reason] ?? 0) + 1;
          return acc;
        }, {});
        const topReasons = Object.entries(reasonCounts)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 3);

        return (
          <section>
            <h2 className="text-lg font-semibold text-gray-800 mb-3">Impedimentos — últimos 30 dias</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 flex items-center gap-4">
                <span className="text-4xl">⚠️</span>
                <div>
                  <p className="text-3xl font-bold text-amber-800">{impediments.length}</p>
                  <p className="text-sm text-amber-700">impedimento{impediments.length !== 1 ? 's' : ''} registrado{impediments.length !== 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="bg-white border border-gray-100 rounded-xl p-5 shadow-sm">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Motivos mais frequentes</p>
                <div className="space-y-2">
                  {topReasons.map(([reason, count]) => (
                    <div key={reason} className="flex items-center justify-between">
                      <span className="text-sm text-gray-700">{REASON_LABELS[reason] ?? reason}</span>
                      <span className="text-sm font-bold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </section>
        );
      })()}
    </div>
  );
}
