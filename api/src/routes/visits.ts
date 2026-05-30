import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { authMiddleware } from '../middleware/auth';
import { haversineDistance } from '../services/geofence';

const router = Router();

router.use(authMiddleware);

router.post('/geofence', async (req: Request, res: Response): Promise<void> => {
  const { tech_lat, tech_lng } = req.body as {
    tech_lat?: number;
    tech_lng?: number;
  };

  if (tech_lat === undefined || tech_lng === undefined) {
    res.status(400).json({ error: 'tech_lat and tech_lng are required' });
    return;
  }

  const radiusKm = parseFloat(process.env.GEOFENCE_RADIUS_KM ?? '5');
  const technicianId = req.user!.id;

  // Pending machines with GPS coords + org name, excluding already-collected today
  const machines = await query<{
    id: number;
    org_id: number;
    org_name: string;
    last_known_lat: string;
    last_known_lng: string;
    days_offline: number | null;
    pin: string | null;
    custom_name: string | null;
    machine_hours: string | null;
  }>(
    `SELECT m.id, m.org_id, o.name AS org_name,
            m.last_known_lat, m.last_known_lng, m.days_offline,
            m.pin, m.custom_name, m.machine_hours
     FROM machines m
     JOIN organizations o ON o.id = m.org_id
     WHERE m.last_known_lat IS NOT NULL
       AND m.last_known_lng IS NOT NULL
       AND (m.days_offline >= 30 OR m.last_call_date IS NULL)
       AND m.org_id IS NOT NULL
       AND m.id NOT IN (
         SELECT machine_id FROM activities
         WHERE status IN ('completed', 'no_use')
           AND machine_id IS NOT NULL
           AND created_at >= NOW() - INTERVAL '24 hours'
       )`
  );

  // Group machines by org, keeping only those within the radius
  type OrgData = {
    org_name: string;
    min_distance_km: number;
    machines: { pin?: string; days_offline?: number; machine_hours?: number }[];
  };
  const orgMap = new Map<number, OrgData>();

  for (const m of machines) {
    const dist = haversineDistance(
      tech_lat, tech_lng,
      Number(m.last_known_lat), Number(m.last_known_lng)
    );
    if (dist > radiusKm) continue;

    const machineData = {
      pin: m.pin ?? m.custom_name ?? undefined,
      days_offline: m.days_offline ?? undefined,
      machine_hours: m.machine_hours !== null ? Number(m.machine_hours) : undefined,
    };

    const entry = orgMap.get(m.org_id);
    if (entry) {
      if (dist < entry.min_distance_km) entry.min_distance_km = dist;
      entry.machines.push(machineData);
    } else {
      orgMap.set(m.org_id, { org_name: m.org_name, min_distance_km: dist, machines: [machineData] });
    }
  }

  if (orgMap.size === 0) {
    res.json({ nearby_orgs: [] });
    return;
  }

  // Upsert one visit record per nearby org per calendar day (idempotent on repeated calls)
  for (const [orgId, orgData] of orgMap) {
    const pendingPins = orgData.machines.map((m) => m.pin).filter(Boolean) as string[];

    await query(
      `INSERT INTO field_visits_no_collection
         (technician_id, org_id, visit_lat, visit_lng, detected_at,
          machines_pending, machine_pins_pending, visit_status)
       SELECT $1, $2, $3, $4, NOW(), $5, $6, 'pending'
       WHERE NOT EXISTS (
         SELECT 1 FROM field_visits_no_collection
         WHERE technician_id = $1
           AND org_id = $2
           AND detected_at IS NOT NULL
           AND DATE(detected_at) = CURRENT_DATE
       )`,
      [
        technicianId,
        orgId,
        tech_lat,
        tech_lng,
        orgData.machines.length,
        pendingPins.length > 0 ? pendingPins : null,
      ]
    );
  }

  const nearbyOrgs = Array.from(orgMap.entries()).map(([org_id, d]) => ({
    org_id,
    org_name: d.org_name,
    distance_km: Math.round(d.min_distance_km * 10) / 10,
    pending_machines: d.machines,
  }));

  res.json({ nearby_orgs: nearbyOrgs });
});

router.get('/management', async (req: Request, res: Response): Promise<void> => {
  if (req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Admin only' });
    return;
  }

  const { from, to, technician_id, org_id, status } = req.query as Record<string, string>;

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let p = 1;

  if (from) {
    conditions.push(`fv.detected_at >= $${p++}`);
    params.push(new Date(from));
  }
  if (to) {
    conditions.push(`fv.detected_at <= $${p++}`);
    params.push(new Date(to));
  }
  if (technician_id) {
    conditions.push(`fv.technician_id = $${p++}`);
    params.push(parseInt(technician_id, 10));
  }
  if (org_id) {
    conditions.push(`fv.org_id = $${p++}`);
    params.push(parseInt(org_id, 10));
  }

  const rows = await query<Record<string, unknown>>(
    `WITH collected AS (
       SELECT
         a.technician_id,
         a.org_id,
         DATE(a.created_at)                                                      AS activity_date,
         COUNT(DISTINCT a.machine_id)                                            AS cnt,
         ARRAY_REMOVE(ARRAY_AGG(DISTINCT COALESCE(m.pin, m.custom_name)), NULL)  AS pins
       FROM activities a
       LEFT JOIN machines m ON m.id = a.machine_id
       WHERE a.status = 'completed' AND a.machine_id IS NOT NULL
       GROUP BY a.technician_id, a.org_id, DATE(a.created_at)
     )
     SELECT
       fv.id,
       fv.detected_at,
       fv.visit_lat,
       fv.visit_lng,
       COALESCE(fv.machines_pending, 0)                                          AS machines_pending,
       fv.machine_pins_pending,
       t.name                                                                    AS technician_name,
       t.employee_id,
       t.id                                                                      AS technician_id,
       o.name                                                                    AS org_name,
       o.id                                                                      AS org_id,
       COALESCE(c.cnt, 0)                                                        AS machines_collected,
       GREATEST(0, COALESCE(fv.machines_pending, 0) - COALESCE(c.cnt, 0))       AS machines_not_collected,
       c.pins                                                                    AS machine_pins_collected,
       (SELECT ARRAY_AGG(pin_val)
        FROM UNNEST(COALESCE(fv.machine_pins_pending, ARRAY[]::TEXT[])) AS pin_val
        WHERE pin_val != ALL(COALESCE(c.pins, ARRAY[]::TEXT[]))
       )                                                                         AS machine_pins_missed,
       CASE
         WHEN COALESCE(c.cnt, 0) = 0                                             THEN 'no_collection'
         WHEN COALESCE(c.cnt, 0) >= COALESCE(fv.machines_pending, 0)             THEN 'full_collection'
         ELSE                                                                          'partial_collection'
       END                                                                       AS visit_status
     FROM field_visits_no_collection fv
     LEFT JOIN technicians t ON t.id = fv.technician_id
     LEFT JOIN organizations o ON o.id = fv.org_id
     LEFT JOIN collected c ON (
       c.technician_id  = fv.technician_id
       AND c.org_id     = fv.org_id
       AND c.activity_date = DATE(fv.detected_at)
     )
     WHERE ${conditions.join(' AND ')}
     ORDER BY fv.detected_at DESC
     LIMIT 500`,
    params
  );

  // status filter is applied in-memory because the field is computed in the CTE
  const filtered = status ? rows.filter((r) => r.visit_status === status) : rows;

  res.json(filtered);
});

router.get('/no-collection', async (req: Request, res: Response): Promise<void> => {
  const { date_from, date_to } = req.query as Record<string, string>;

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let p = 1;

  if (date_from) {
    conditions.push(`fv.created_at >= $${p++}`);
    params.push(new Date(date_from));
  }
  if (date_to) {
    conditions.push(`fv.created_at <= $${p++}`);
    params.push(new Date(date_to));
  }

  const rows = await query(
    `SELECT
       fv.*,
       t.name AS technician_name,
       t.employee_id,
       o.name AS org_name
     FROM field_visits_no_collection fv
     LEFT JOIN technicians t ON t.id = fv.technician_id
     LEFT JOIN organizations o ON o.id = fv.org_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY fv.created_at DESC
     LIMIT 500`,
    params
  );

  res.json(rows);
});

export default router;
