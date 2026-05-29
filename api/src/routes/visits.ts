import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { authMiddleware } from '../middleware/auth';
import { isWithinRadius } from '../services/geofence';

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

  // Get all machines with known position that are offline >= 30 days
  const machines = await query<{
    id: number;
    org_id: number;
    last_known_lat: number;
    last_known_lng: number;
    days_offline: number | null;
  }>(
    `SELECT id, org_id, last_known_lat, last_known_lng, days_offline
     FROM machines
     WHERE last_known_lat IS NOT NULL
       AND last_known_lng IS NOT NULL
       AND (days_offline >= 30 OR last_call_date IS NULL)
       AND org_id IS NOT NULL`
  );

  // Group machines by org and find which orgs are within radius
  const nearbyOrgIds = new Set<number>();
  const orgMachineCount = new Map<number, number>();

  for (const machine of machines) {
    if (
      isWithinRadius(
        tech_lat,
        tech_lng,
        Number(machine.last_known_lat),
        Number(machine.last_known_lng),
        radiusKm
      )
    ) {
      nearbyOrgIds.add(machine.org_id);
      orgMachineCount.set(machine.org_id, (orgMachineCount.get(machine.org_id) ?? 0) + 1);
    }
  }

  if (nearbyOrgIds.size === 0) {
    res.json({ recorded: 0, nearby_orgs: [] });
    return;
  }

  // Check if technician has any activity today for each nearby org
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const recordedOrgs: number[] = [];

  for (const orgId of nearbyOrgIds) {
    const existingActivity = await query<{ id: number }>(
      `SELECT id FROM activities
       WHERE technician_id = $1 AND org_id = $2 AND created_at >= $3
       LIMIT 1`,
      [technicianId, orgId, today]
    );

    if (existingActivity.length === 0) {
      // No activity in this org today — record a visit without collection
      await query(
        `INSERT INTO field_visits_no_collection
           (technician_id, org_id, visit_lat, visit_lng, detected_at, machines_pending)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [
          technicianId,
          orgId,
          tech_lat,
          tech_lng,
          orgMachineCount.get(orgId) ?? 0,
        ]
      );
      recordedOrgs.push(orgId);
    }
  }

  res.json({
    recorded: recordedOrgs.length,
    nearby_orgs: Array.from(nearbyOrgIds),
  });
});

router.get('/no-collection', async (req: Request, res: Response): Promise<void> => {
  // Admin view: visits where no collection was performed
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
