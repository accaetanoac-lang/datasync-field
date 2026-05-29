import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { authMiddleware } from '../middleware/auth';
import { adminOnly } from '../middleware/adminOnly';

const router = Router();

router.use(authMiddleware, adminOnly);

router.get('/summary', async (_req: Request, res: Response): Promise<void> => {
  const [machineStats] = await query<{
    total: string;
    range_16_60: string;
    range_61_365: string;
    range_365plus: string;
    no_date: string;
  }>(
    `SELECT
       COUNT(*) AS total,
       COUNT(*) FILTER (WHERE days_offline BETWEEN 30 AND 60) AS range_16_60,
       COUNT(*) FILTER (WHERE days_offline BETWEEN 61 AND 365) AS range_61_365,
       COUNT(*) FILTER (WHERE days_offline > 365) AS range_365plus,
       COUNT(*) FILTER (WHERE last_call_date IS NULL) AS no_date
     FROM machines`
  );

  const [healthStats] = await query<{ total_risk_acres: string; total_highly_engaged: string }>(
    `SELECT
       COALESCE(SUM(risk_acres), 0) AS total_risk_acres,
       COALESCE(SUM(highly_engaged_acres), 0) AS total_highly_engaged
     FROM customer_health ch
     JOIN (
       SELECT org_id, MAX(upload_month) AS latest FROM customer_health GROUP BY org_id
     ) latest ON ch.org_id = latest.org_id AND ch.upload_month = latest.latest`
  );

  const [orgCount] = await query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM organizations'
  );

  res.json({
    machines: {
      total: parseInt(machineStats?.total ?? '0', 10),
      range_30_60: parseInt(machineStats?.range_16_60 ?? '0', 10),
      range_61_365: parseInt(machineStats?.range_61_365 ?? '0', 10),
      range_365plus: parseInt(machineStats?.range_365plus ?? '0', 10),
      no_connection_date: parseInt(machineStats?.no_date ?? '0', 10),
    },
    hectares: {
      risk_acres: parseFloat(healthStats?.total_risk_acres ?? '0'),
      highly_engaged_acres: parseFloat(healthStats?.total_highly_engaged ?? '0'),
    },
    organizations_total: parseInt(orgCount?.count ?? '0', 10),
  });
});

router.get('/technicians', async (req: Request, res: Response): Promise<void> => {
  const { date_from, date_to } = req.query as Record<string, string>;

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (date_from) {
    conditions.push(`a.created_at >= $${paramIdx++}`);
    params.push(new Date(date_from));
  }
  if (date_to) {
    conditions.push(`a.created_at <= $${paramIdx++}`);
    params.push(new Date(date_to));
  }

  const rows = await query(
    `SELECT
       t.id,
       t.employee_id,
       t.name,
       COUNT(a.id) FILTER (WHERE a.status != 'no_use') AS visits,
       COUNT(a.id) FILTER (WHERE a.status = 'completed') AS machines_collected,
       COALESCE(SUM(a.duration_minutes) FILTER (WHERE a.status = 'completed'), 0) AS total_minutes,
       COUNT(a.id) FILTER (WHERE a.method = 'starlink_data_sync') AS starlink_count,
       COUNT(a.id) FILTER (WHERE a.method = 'pen_drive') AS pen_drive_count,
       MAX(a.created_at) AS last_activity
     FROM technicians t
     LEFT JOIN activities a ON a.technician_id = t.id AND ${conditions.join(' AND ')}
     GROUP BY t.id, t.employee_id, t.name
     ORDER BY t.name`,
    params
  );

  res.json(rows);
});

router.get('/organizations', async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       o.id,
       o.name,
       o.org_id_jd,
       COUNT(m.id) FILTER (WHERE m.days_offline >= 30 OR m.last_call_date IS NULL) AS offline_machines,
       MAX(a.created_at) AS last_visit,
       t.name AS last_technician,
       COUNT(a.id) FILTER (WHERE a.status = 'completed') AS machines_collected,
       COUNT(m.id) FILTER (WHERE (m.days_offline >= 30 OR m.last_call_date IS NULL)
         AND NOT EXISTS (SELECT 1 FROM activities a2 WHERE a2.machine_id = m.id AND a2.status = 'completed')) AS pending
     FROM organizations o
     LEFT JOIN machines m ON m.org_id = o.id
     LEFT JOIN activities a ON a.org_id = o.id
     LEFT JOIN technicians t ON t.id = a.technician_id
     GROUP BY o.id, o.name, o.org_id_jd, t.name
     ORDER BY offline_machines DESC
     LIMIT 200`
  );

  res.json(rows);
});

router.get('/bi', async (_req: Request, res: Response): Promise<void> => {
  // Full BI dataset — cross join of latest CDE + GAP per org
  const rows = await query(
    `SELECT
       o.id AS org_id,
       o.org_id_jd,
       o.name AS org_name,
       o.engagement_level,
       ch.all_modems,
       ch.non_active_modems,
       ch.lg_ag_modems,
       ch.lg_ag_not_submitting,
       ch.lg_ag_connected_gen45,
       ch.risk_acres,
       ch.highly_engaged_acres,
       ch.prepare_acres,
       ch.plant_acres,
       ch.apply_acres,
       ch.harvest_acres,
       ch.vca_setup_file,
       ch.vca_work_plan,
       ch.vca_field_boundary,
       ch.vca_equipment_monitoring,
       ch.vca_work_details,
       ch.vca_agronomic_reports,
       ch.r12_vca_avg,
       ch.work_plans_created,
       ch.work_plans_completed,
       ch.fields_without_boundaries,
       ch.last_login_web,
       ch.last_login_mobile,
       hg.max_eh, hg.ytd_he, hg.gap_eh,
       hg.max_heh, hg.ytd_heh, hg.gap_heh,
       hg.max_prepare, hg.ytd_prepare, hg.gap_prepare,
       hg.max_plant, hg.ytd_plant, hg.gap_plant,
       hg.max_apply, hg.ytd_apply, hg.gap_apply,
       hg.max_harvest, hg.ytd_harvest, hg.gap_harvest,
       COUNT(m.id) FILTER (WHERE m.days_offline >= 30 OR m.last_call_date IS NULL) AS offline_machines_count
     FROM organizations o
     LEFT JOIN customer_health ch ON ch.org_id = o.id
       AND ch.upload_month = (SELECT MAX(upload_month) FROM customer_health WHERE org_id = o.id)
     LEFT JOIN hectares_gap hg ON hg.org_id = o.id
       AND hg.upload_month = (SELECT MAX(upload_month) FROM hectares_gap WHERE org_id = o.id)
     LEFT JOIN machines m ON m.org_id = o.id
     GROUP BY o.id, o.org_id_jd, o.name, o.engagement_level,
       ch.all_modems, ch.non_active_modems, ch.lg_ag_modems, ch.lg_ag_not_submitting,
       ch.lg_ag_connected_gen45, ch.risk_acres, ch.highly_engaged_acres,
       ch.prepare_acres, ch.plant_acres, ch.apply_acres, ch.harvest_acres,
       ch.vca_setup_file, ch.vca_work_plan, ch.vca_field_boundary, ch.vca_equipment_monitoring,
       ch.vca_work_details, ch.vca_agronomic_reports, ch.r12_vca_avg,
       ch.work_plans_created, ch.work_plans_completed, ch.fields_without_boundaries,
       ch.last_login_web, ch.last_login_mobile,
       hg.max_eh, hg.ytd_he, hg.gap_eh, hg.max_heh, hg.ytd_heh, hg.gap_heh,
       hg.max_prepare, hg.ytd_prepare, hg.gap_prepare, hg.max_plant, hg.ytd_plant, hg.gap_plant,
       hg.max_apply, hg.ytd_apply, hg.gap_apply, hg.max_harvest, hg.ytd_harvest, hg.gap_harvest
     ORDER BY o.name`
  );

  res.json(rows);
});

router.get('/export', async (req: Request, res: Response): Promise<void> => {
  const format = (req.query.format as string) ?? 'csv';
  const rows = await query(
    `SELECT
       a.id, a.created_at, t.name AS technician, t.employee_id,
       o.name AS organization, m.pin AS machine_pin, m.custom_name,
       a.method, a.current_hours, a.hours_diff, a.duration_minutes, a.status, a.notes
     FROM activities a
     LEFT JOIN technicians t ON t.id = a.technician_id
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN machines m ON m.id = a.machine_id
     ORDER BY a.created_at DESC
     LIMIT 5000`
  );

  if (format === 'csv') {
    const headers = [
      'ID', 'Data', 'Técnico', 'ID Func.', 'Organização',
      'Chassi/PIN', 'Máquina Não-JD', 'Método', 'Horímetro Informado',
      'Diff Horas', 'Duração (min)', 'Status', 'Observações',
    ];

    const csvRows = rows.map((r: Record<string, unknown>) => [
      r.id,
      r.created_at,
      r.technician,
      r.employee_id,
      r.organization,
      r.machine_pin ?? '',
      r.custom_name ?? '',
      r.method,
      r.current_hours ?? '',
      r.hours_diff ?? '',
      r.duration_minutes ?? '',
      r.status,
      (r.notes as string ?? '').replace(/"/g, '""'),
    ].map((v) => `"${v}"`).join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="activities.csv"');
    res.send('﻿' + csv); // BOM for Excel UTF-8
  } else {
    res.status(400).json({ error: 'Only csv format is supported server-side. Use jspdf client-side for PDF.' });
  }
});

export default router;
