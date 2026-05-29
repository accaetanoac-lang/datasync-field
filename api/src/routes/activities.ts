import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { authMiddleware } from '../middleware/auth';
import { Machine } from '../types';

const router = Router();

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const {
    org_id,
    machine_id,
    method,
    current_hours,
    tech_lat,
    tech_lng,
    synced_offline,
    notes,
  } = req.body as {
    org_id?: number;
    machine_id?: number;
    method?: string;
    current_hours?: number;
    tech_lat?: number;
    tech_lng?: number;
    synced_offline?: boolean;
    notes?: string;
  };

  if (!method || !['starlink_data_sync', 'pen_drive'].includes(method)) {
    res.status(400).json({ error: 'method must be starlink_data_sync or pen_drive' });
    return;
  }

  // Validate hours diff for JD machines
  if (machine_id && current_hours !== undefined) {
    const machine = await queryOne<Machine>(
      'SELECT * FROM machines WHERE id = $1',
      [machine_id]
    );

    if (machine && machine.machine_hours !== null && machine.machine_hours !== undefined) {
      const diff = current_hours - Number(machine.machine_hours);
      if (diff < 50) {
        res.status(422).json({
          error: 'Hours difference is less than 50. Use the no-use endpoint instead.',
          diff,
        });
        return;
      }
    }
  }

  const machine = machine_id
    ? await queryOne<Machine>('SELECT * FROM machines WHERE id = $1', [machine_id])
    : null;

  const hoursDiff =
    machine && machine.machine_hours !== null && current_hours !== undefined
      ? current_hours - Number(machine.machine_hours)
      : null;

  const rows = await query<{ id: number }>(
    `INSERT INTO activities
       (technician_id, machine_id, org_id, method, status, current_hours, hours_diff,
        tech_lat, tech_lng, started_at, synced_offline, notes)
     VALUES ($1,$2,$3,$4,'in_progress',$5,$6,$7,$8,NOW(),$9,$10)
     RETURNING id`,
    [
      req.user!.id,
      machine_id ?? null,
      org_id ?? null,
      method,
      current_hours ?? null,
      hoursDiff,
      tech_lat ?? null,
      tech_lng ?? null,
      synced_offline ?? false,
      notes ?? null,
    ]
  );

  const activity = await queryOne(
    'SELECT * FROM activities WHERE id = $1',
    [rows[0].id]
  );
  res.status(201).json(activity);
});

router.put('/:id/finish', async (req: Request, res: Response): Promise<void> => {
  const { notes } = req.body as { notes?: string };
  const activityId = parseInt(req.params.id, 10);

  const existing = await queryOne<{ id: number; technician_id: number; started_at: Date }>(
    'SELECT id, technician_id, started_at FROM activities WHERE id = $1',
    [activityId]
  );

  if (!existing) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }

  if (req.user!.role !== 'admin' && existing.technician_id !== req.user!.id) {
    res.status(403).json({ error: 'Not authorized to finish this activity' });
    return;
  }

  const updated = await queryOne(
    `UPDATE activities
     SET finished_at = NOW(),
         status = 'completed',
         duration_minutes = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60,
         notes = COALESCE($2, notes)
     WHERE id = $1
     RETURNING *`,
    [activityId, notes ?? null]
  );

  res.json(updated);
});

router.put('/:id/no-use', async (req: Request, res: Response): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

  // Allow creating a no-use record directly (without prior activity)
  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM activities WHERE id = $1',
    [activityId]
  );

  if (!existing) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }

  const updated = await queryOne(
    `UPDATE activities SET status = 'no_use', finished_at = NOW() WHERE id = $1 RETURNING *`,
    [activityId]
  );

  res.json(updated);
});

router.post('/no-use-direct', async (req: Request, res: Response): Promise<void> => {
  const { org_id, machine_id, current_hours, tech_lat, tech_lng, synced_offline } = req.body as {
    org_id?: number;
    machine_id?: number;
    current_hours?: number;
    tech_lat?: number;
    tech_lng?: number;
    synced_offline?: boolean;
  };

  const machine = machine_id
    ? await queryOne<Machine>('SELECT * FROM machines WHERE id = $1', [machine_id])
    : null;

  const hoursDiff =
    machine && machine.machine_hours !== null && current_hours !== undefined
      ? current_hours - Number(machine.machine_hours)
      : null;

  const rows = await query<{ id: number }>(
    `INSERT INTO activities
       (technician_id, machine_id, org_id, method, status, current_hours, hours_diff,
        tech_lat, tech_lng, started_at, finished_at, synced_offline)
     VALUES ($1,$2,$3,'pen_drive','no_use',$4,$5,$6,$7,NOW(),NOW(),$8)
     RETURNING id`,
    [
      req.user!.id,
      machine_id ?? null,
      org_id ?? null,
      current_hours ?? null,
      hoursDiff,
      tech_lat ?? null,
      tech_lng ?? null,
      synced_offline ?? false,
    ]
  );

  const activity = await queryOne('SELECT * FROM activities WHERE id = $1', [rows[0].id]);
  res.status(201).json(activity);
});

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const {
    tech_id,
    org_id,
    date_from,
    date_to,
    status,
    method,
  } = req.query as Record<string, string>;

  // Non-admin technicians only see their own activities
  const effectiveTechId =
    req.user!.role !== 'admin' ? String(req.user!.id) : tech_id;

  const conditions: string[] = ['1=1'];
  const params: unknown[] = [];
  let paramIdx = 1;

  if (effectiveTechId) {
    conditions.push(`a.technician_id = $${paramIdx++}`);
    params.push(parseInt(effectiveTechId, 10));
  }
  if (org_id) {
    conditions.push(`a.org_id = $${paramIdx++}`);
    params.push(parseInt(org_id, 10));
  }
  if (date_from) {
    conditions.push(`a.created_at >= $${paramIdx++}`);
    params.push(new Date(date_from));
  }
  if (date_to) {
    conditions.push(`a.created_at <= $${paramIdx++}`);
    params.push(new Date(date_to));
  }
  if (status) {
    conditions.push(`a.status = $${paramIdx++}`);
    params.push(status);
  }
  if (method) {
    conditions.push(`a.method = $${paramIdx++}`);
    params.push(method);
  }

  const rows = await query(
    `SELECT
       a.*,
       t.name AS technician_name,
       t.employee_id,
       o.name AS org_name,
       m.pin AS machine_pin,
       m.custom_name AS machine_custom_name
     FROM activities a
     LEFT JOIN technicians t ON t.id = a.technician_id
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN machines m ON m.id = a.machine_id
     WHERE ${conditions.join(' AND ')}
     ORDER BY a.created_at DESC
     LIMIT 500`,
    params
  );

  res.json(rows);
});

export default router;
