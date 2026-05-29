import { pool } from '../db/client';
import { MlcMachineRow, MlcOrgRow, CdeRow, GapRow } from './excelParser';

export async function upsertOrganizations(orgs: MlcOrgRow[]): Promise<Map<string, number>> {
  const orgMap = new Map<string, number>();
  if (orgs.length === 0) return orgMap;

  const client = await pool.connect();
  try {
    for (const org of orgs) {
      const result = await client.query<{ id: number }>(
        `INSERT INTO organizations (org_id_jd, name, updated_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (org_id_jd)
         DO UPDATE SET name = EXCLUDED.name, updated_at = NOW()
         RETURNING id`,
        [org.orgId, org.orgName]
      );
      orgMap.set(org.orgId, result.rows[0].id);
    }
  } finally {
    client.release();
  }
  return orgMap;
}

export async function upsertOrganizationsFromCde(
  rows: CdeRow[],
  existingMap: Map<string, number>
): Promise<Map<string, number>> {
  const client = await pool.connect();
  try {
    for (const row of rows) {
      if (existingMap.has(row.orgId)) {
        // Update engagement level if org exists
        await client.query(
          `UPDATE organizations SET engagement_level = $1, updated_at = NOW() WHERE org_id_jd = $2`,
          [row.engagementLevel, row.orgId]
        );
      } else {
        const result = await client.query<{ id: number }>(
          `INSERT INTO organizations (org_id_jd, name, engagement_level, updated_at)
           VALUES ($1, $2, $3, NOW())
           ON CONFLICT (org_id_jd)
           DO UPDATE SET name = EXCLUDED.name, engagement_level = EXCLUDED.engagement_level, updated_at = NOW()
           RETURNING id`,
          [row.orgId, row.orgName, row.engagementLevel]
        );
        existingMap.set(row.orgId, result.rows[0].id);
      }
    }
  } finally {
    client.release();
  }
  return existingMap;
}

export async function upsertMachines(
  machines: MlcMachineRow[],
  orgMap: Map<string, number>,
  uploadDate: Date
): Promise<number> {
  let count = 0;
  const client = await pool.connect();
  try {
    for (const m of machines) {
      const orgId = orgMap.get(m.orgId) ?? null;

      let daysOffline: number | null = null;
      if (m.lastCalledInDate) {
        const diff = Math.floor(
          (uploadDate.getTime() - m.lastCalledInDate.getTime()) / (1000 * 60 * 60 * 24)
        );
        daysOffline = diff;
      }

      await client.query(
        `INSERT INTO machines (pin, org_id, is_john_deere, last_call_date, machine_hours,
          last_known_lat, last_known_lng, days_offline, offline_range, updated_at)
         VALUES ($1, $2, TRUE, $3, $4, $5, $6, $7, $8, NOW())
         ON CONFLICT (pin)
         DO UPDATE SET
           org_id = EXCLUDED.org_id,
           last_call_date = EXCLUDED.last_call_date,
           machine_hours = EXCLUDED.machine_hours,
           last_known_lat = EXCLUDED.last_known_lat,
           last_known_lng = EXCLUDED.last_known_lng,
           days_offline = EXCLUDED.days_offline,
           offline_range = EXCLUDED.offline_range,
           updated_at = NOW()`,
        [
          m.pin,
          orgId,
          m.lastCalledInDate,
          m.machineHours,
          m.lastKnownLat,
          m.lastKnownLng,
          daysOffline,
          m.lastCalledIn,
        ]
      );
      count++;
    }
  } finally {
    client.release();
  }
  return count;
}

export async function upsertCustomerHealth(
  rows: CdeRow[],
  orgMap: Map<string, number>,
  uploadMonth: Date
): Promise<void> {
  const client = await pool.connect();
  try {
    for (const row of rows) {
      const orgId = orgMap.get(row.orgId);
      if (!orgId) continue;

      await client.query(
        `INSERT INTO customer_health (
          org_id, upload_month, all_modems, non_active_modems, lg_ag_modems,
          lg_ag_not_submitting, lg_ag_connected_gen45, risk_acres, highly_engaged_acres,
          prepare_acres, plant_acres, apply_acres, harvest_acres,
          vca_setup_file, vca_work_plan, vca_field_boundary, vca_equipment_monitoring,
          vca_work_details, vca_agronomic_reports, r12_vca_avg,
          work_plans_created, work_plans_completed, fields_without_boundaries,
          last_login_web, last_login_mobile
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
        ON CONFLICT (org_id, upload_month)
        DO UPDATE SET
          all_modems = EXCLUDED.all_modems,
          non_active_modems = EXCLUDED.non_active_modems,
          lg_ag_modems = EXCLUDED.lg_ag_modems,
          lg_ag_not_submitting = EXCLUDED.lg_ag_not_submitting,
          lg_ag_connected_gen45 = EXCLUDED.lg_ag_connected_gen45,
          risk_acres = EXCLUDED.risk_acres,
          highly_engaged_acres = EXCLUDED.highly_engaged_acres,
          prepare_acres = EXCLUDED.prepare_acres,
          plant_acres = EXCLUDED.plant_acres,
          apply_acres = EXCLUDED.apply_acres,
          harvest_acres = EXCLUDED.harvest_acres,
          vca_setup_file = EXCLUDED.vca_setup_file,
          vca_work_plan = EXCLUDED.vca_work_plan,
          vca_field_boundary = EXCLUDED.vca_field_boundary,
          vca_equipment_monitoring = EXCLUDED.vca_equipment_monitoring,
          vca_work_details = EXCLUDED.vca_work_details,
          vca_agronomic_reports = EXCLUDED.vca_agronomic_reports,
          r12_vca_avg = EXCLUDED.r12_vca_avg,
          work_plans_created = EXCLUDED.work_plans_created,
          work_plans_completed = EXCLUDED.work_plans_completed,
          fields_without_boundaries = EXCLUDED.fields_without_boundaries,
          last_login_web = EXCLUDED.last_login_web,
          last_login_mobile = EXCLUDED.last_login_mobile`,
        [
          orgId, uploadMonth,
          row.allModems, row.nonActiveModems, row.lgAgModems,
          row.lgAgNotSubmitting, row.lgAgConnectedGen45,
          row.riskAcres, row.highlyEngagedAcres,
          row.prepareAcres, row.plantAcres, row.applyAcres, row.harvestAcres,
          row.vcaSetupFile, row.vcaWorkPlan, row.vcaFieldBoundary,
          row.vcaEquipmentMonitoring, row.vcaWorkDetails, row.vcaAgronomicReports,
          row.r12VcaAvg, row.workPlansCreated, row.workPlansCompleted,
          row.fieldsWithoutBoundaries, row.lastLoginWeb, row.lastLoginMobile,
        ]
      );
    }
  } finally {
    client.release();
  }
}

export async function upsertHectaresGap(
  rows: GapRow[],
  orgMap: Map<string, number>,
  uploadMonth: Date
): Promise<void> {
  const client = await pool.connect();
  try {
    for (const row of rows) {
      const orgId = orgMap.get(row.orgId);
      if (!orgId) continue;

      await client.query(
        `INSERT INTO hectares_gap (
          org_id, upload_month,
          max_eh, ytd_he, gap_eh,
          max_heh, ytd_heh, gap_heh,
          max_prepare, ytd_prepare, gap_prepare,
          max_plant, ytd_plant, gap_plant,
          max_apply, ytd_apply, gap_apply,
          max_harvest, ytd_harvest, gap_harvest
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
        ON CONFLICT (org_id, upload_month)
        DO UPDATE SET
          max_eh = EXCLUDED.max_eh, ytd_he = EXCLUDED.ytd_he, gap_eh = EXCLUDED.gap_eh,
          max_heh = EXCLUDED.max_heh, ytd_heh = EXCLUDED.ytd_heh, gap_heh = EXCLUDED.gap_heh,
          max_prepare = EXCLUDED.max_prepare, ytd_prepare = EXCLUDED.ytd_prepare, gap_prepare = EXCLUDED.gap_prepare,
          max_plant = EXCLUDED.max_plant, ytd_plant = EXCLUDED.ytd_plant, gap_plant = EXCLUDED.gap_plant,
          max_apply = EXCLUDED.max_apply, ytd_apply = EXCLUDED.ytd_apply, gap_apply = EXCLUDED.gap_apply,
          max_harvest = EXCLUDED.max_harvest, ytd_harvest = EXCLUDED.ytd_harvest, gap_harvest = EXCLUDED.gap_harvest`,
        [
          orgId, uploadMonth,
          row.maxEh, row.ytdHe, row.gapEh,
          row.maxHeh, row.ytdHeh, row.gapHeh,
          row.maxPrepare, row.ytdPrepare, row.gapPrepare,
          row.maxPlant, row.ytdPlant, row.gapPlant,
          row.maxApply, row.ytdApply, row.gapApply,
          row.maxHarvest, row.ytdHarvest, row.gapHarvest,
        ]
      );
    }
  } finally {
    client.release();
  }
}
