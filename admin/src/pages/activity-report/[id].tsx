import React, { useEffect, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import api from '../../lib/api';

interface ActivityReport {
  id: number;
  technician_name?: string;
  employee_id?: string;
  org_name?: string;
  machine_pin?: string;
  machine_custom_name?: string;
  modelo?: string;
  machine_last_hours?: number;
  current_hours?: number;
  hours_diff?: number;
  days_offline?: number;
  tech_lat?: number;
  tech_lng?: number;
  method: string;
  started_at?: string;
  finished_at?: string;
  duration_minutes?: number;
  total_pause_minutes?: number;
  status: string;
  notes?: string;
  photo_url?: string;
  pre_signed_photo_url?: string;
  photo_taken_at?: string;
  created_at: string;
  is_diagnosis?: boolean;
  diagnosis_result?: string;
  diagnosis_checklist?: boolean[] | Record<string, string>;
  connectivity_issue?: boolean;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function formatDuration(minutes?: number): string {
  if (!minutes) return '—';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${pad(h)}:${pad(m)}`;
}

function formatDateTime(iso?: string): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('pt-BR');
}

const METHOD_LABEL: Record<string, string> = {
  starlink_data_sync: 'Starlink + Data Sync',
  pen_drive: 'Pen Drive',
  diagnosis: 'Diagnóstico de Conectividade',
};

const DIAGNOSIS_RESULT_LABEL: Record<string, string> = {
  resolved:     '✅ Conectividade restabelecida',
  escalated:    '🔧 Escalonado para suporte técnico',
  needs_return: '🔄 Requer retorno com peça/suporte',
  unidentified: '❌ Causa não identificada',
  no_modem:     '📡 Máquina sem Modem JDLink instalado',
};

const PREDISPOSED_LABEL: Record<string, string> = {
  yes:     'Sim — possui conector/chicote para instalação',
  no:      'Não — requer adaptação/instalação de chicote',
  unknown: 'Não sei — verificação técnica necessária',
};

const RECOMMENDATION_LABEL: Record<string, string> = {
  recommend_install: 'Recomendar instalação do Modem JDLink ao cliente',
  open_os:           'Abrir OS de instalação do modem',
  tech_verify:       'Verificação técnica necessária antes de recomendar',
};

const STATUS_LABEL: Record<string, string> = {
  completed: 'Concluído',
  no_use: 'Sem uso',
  in_progress: 'Em andamento',
};

export default function ActivityReportPage() {
  const router = useRouter();
  const { id } = router.query;
  const [report, setReport] = useState<ActivityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.get<ActivityReport>(`/activities/${id}/report`)
      .then((res) => setReport(res.data))
      .catch(() => setError('Atividade não encontrada.'))
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-jd-green" />
      </div>
    );
  }

  if (error || !report) {
    return <div className="text-center text-red-600 mt-16">{error || 'Erro ao carregar.'}</div>;
  }

  const machineId = report.machine_pin ?? report.machine_custom_name ?? '—';
  const techCode = report.employee_id ? `x${report.employee_id}` : '—';

  return (
    <>
      <Head>
        <title>OS #{report.id} — DataSync Field</title>
      </Head>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white !important; }
          .print-page { box-shadow: none !important; max-width: 100% !important; }
        }
      `}</style>

      <div className="no-print flex justify-between items-center mb-6">
        <button
          onClick={() => router.back()}
          className="text-sm text-gray-500 hover:text-gray-700"
        >
          ← Voltar
        </button>
        <button
          onClick={() => window.print()}
          className="bg-jd-green text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-green-700 transition-colors"
        >
          Imprimir / PDF
        </button>
      </div>

      <div className="print-page max-w-2xl mx-auto bg-white shadow-sm rounded-xl border border-gray-200 overflow-hidden">
        <div className="bg-jd-green text-white px-6 py-4">
          <div className="text-lg font-bold">DataSync Field — Relatório de Coleta</div>
          <div className="flex justify-between mt-1 text-sm text-green-100">
            <span>OS Nº: {report.id}</span>
            <span>{new Date(report.created_at).toLocaleDateString('pt-BR')}</span>
          </div>
        </div>

        <Section title="DADOS DO TÉCNICO">
          <Row label="ID" value={techCode} />
          <Row label="Nome" value={report.technician_name ?? '—'} />
        </Section>

        <Section title="DADOS DA MÁQUINA">
          <Row label="PIN / Chassi" value={machineId} mono />
          <Row label="Modelo" value={report.modelo ?? '—'} />
          <Row
            label="Horímetro última conexão"
            value={report.machine_last_hours != null ? `${report.machine_last_hours} h` : '—'}
          />
          <Row
            label="Horímetro informado"
            value={report.current_hours != null ? `${report.current_hours} h` : '—'}
          />
          <Row
            label="Diferença"
            value={report.hours_diff != null ? `${Number(report.hours_diff).toFixed(1)} h` : '—'}
          />
          <Row
            label="Dias offline"
            value={report.days_offline != null ? `${report.days_offline} dias` : '—'}
          />
        </Section>

        <Section title="LOCAL DA COLETA">
          <Row label="Organização" value={report.org_name ?? '—'} />
          <Row
            label="Coordenadas"
            value={
              report.tech_lat != null && report.tech_lng != null
                ? `${Number(report.tech_lat).toFixed(6)}, ${Number(report.tech_lng).toFixed(6)}`
                : '—'
            }
          />
        </Section>

        <Section title="OPERAÇÃO">
          <Row label="Método" value={METHOD_LABEL[report.method] ?? report.method} />
          <Row label="Início" value={formatDateTime(report.started_at)} />
          <Row label="Término" value={formatDateTime(report.finished_at)} />
          <Row label="Duração" value={formatDuration(report.duration_minutes)} />
          {report.total_pause_minutes != null && report.total_pause_minutes > 0 && (
            <Row label="Tempo pausado" value={`${report.total_pause_minutes} min`} />
          )}
          <Row label="Status" value={STATUS_LABEL[report.status] ?? report.status} />
        </Section>

        {report.is_diagnosis && report.diagnosis_result === 'no_modem' && (() => {
          const cl = report.diagnosis_checklist as Record<string, string> | undefined;
          return (
            <Section title="AUSÊNCIA DE MODEM JDLINK">
              <Row label="Resultado" value={DIAGNOSIS_RESULT_LABEL.no_modem} />
              <Row
                label="Pré-disposta para instalação"
                value={cl?.predisposed ? (PREDISPOSED_LABEL[cl.predisposed] ?? cl.predisposed) : '—'}
              />
              <Row
                label="Recomendação"
                value={cl?.recommendation ? (RECOMMENDATION_LABEL[cl.recommendation] ?? cl.recommendation) : '—'}
              />
            </Section>
          );
        })()}

        {report.is_diagnosis && report.diagnosis_result !== 'no_modem' && (
          <Section title="DIAGNÓSTICO DE CONECTIVIDADE">
            <Row
              label="Resultado"
              value={report.diagnosis_result
                ? (DIAGNOSIS_RESULT_LABEL[report.diagnosis_result] ?? report.diagnosis_result)
                : 'Em andamento'}
            />
            {report.connectivity_issue && (
              <Row label="Falha de conectividade" value="Confirmada" />
            )}
          </Section>
        )}

        <Section title={report.diagnosis_result === 'no_modem' ? 'EVIDÊNCIA FOTOGRÁFICA — LOCAL DO MODEM' : 'EVIDÊNCIA FOTOGRÁFICA'}>
          {report.photo_url ? (
            <div className="px-4 pb-4">
              <img
                src={report.pre_signed_photo_url ?? report.photo_url}
                alt="Painel da máquina"
                className="w-full rounded-lg border border-gray-200 object-cover"
                style={{ maxHeight: 360 }}
              />
              <p className="text-xs text-gray-500 text-center mt-2">
                {report.diagnosis_result === 'no_modem'
                  ? 'Local de instalação do modem'
                  : report.diagnosis_result === 'needs_return'
                  ? 'Modem/máquina com problema'
                  : 'Painel da máquina após coleta'}
                {report.photo_taken_at && (
                  <span> · {formatDateTime(report.photo_taken_at)}</span>
                )}
              </p>
            </div>
          ) : (
            <div className="px-4 pb-4">
              <div className="bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-center text-red-600 text-sm font-medium">
                Sem foto registrada
              </div>
            </div>
          )}
        </Section>

        <Section title="OBSERVAÇÕES" last>
          <div className="px-4 pb-4 text-sm text-gray-700 min-h-[48px]">
            {report.notes || <span className="text-gray-400 italic">Nenhuma observação.</span>}
          </div>
        </Section>
      </div>
    </>
  );
}

function Section({
  title,
  children,
  last,
}: {
  title: string;
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div className={`border-t border-gray-200`}>
      <div className="bg-gray-50 px-4 py-2 text-xs font-bold text-gray-500 uppercase tracking-wider">
        {title}
      </div>
      {children}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between items-baseline px-4 py-2 border-b border-gray-50 last:border-0">
      <span className="text-xs font-medium text-gray-500 w-44 flex-shrink-0">{label}</span>
      <span className={`text-sm text-gray-900 text-right ${mono ? 'font-mono' : ''}`}>{value}</span>
    </div>
  );
}