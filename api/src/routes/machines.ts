import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const term = ((req.query.pin as string | undefined) ?? '').trim();

  if (term.length < 2) {
    res.json([]);
    return;
  }

  const rows = await query(
    `SELECT m.id, m.pin, m.custom_name, m.is_john_deere, m.modelo,
            m.days_offline, m.last_call_date, m.machine_hours,
            m.last_known_lat, m.last_known_lng, m.org_id,
            o.name AS org_name
     FROM machines m
     LEFT JOIN organizations o ON o.id = m.org_id
     WHERE m.pin ILIKE $1
        OR m.custom_name ILIKE $1
        OR o.name ILIKE $1
     ORDER BY m.days_offline DESC NULLS LAST
     LIMIT 30`,
    [`%${term}%`]
  );

  res.json(rows);
});

router.get('/:pin', async (req: Request, res: Response): Promise<void> => {
  const machine = await queryOne(
    `SELECT m.*, o.name AS org_name
     FROM machines m
     LEFT JOIN organizations o ON o.id = m.org_id
     WHERE m.pin = $1`,
    [req.params.pin]
  );

  if (!machine) {
    res.status(404).json({ error: 'Machine not found' });
    return;
  }

  res.json(machine);
});

router.post('/:id/impediment', async (req: Request, res: Response): Promise<void> => {
  const machineId = parseInt(req.params.id, 10);
  if (isNaN(machineId)) { res.status(400).json({ error: 'Invalid machine id' }); return; }

  const { reason, custom_reason, notes, tech_lat, tech_lng } = req.body as {
    reason?: string;
    custom_reason?: string;
    notes?: string;
    tech_lat?: number;
    tech_lng?: number;
  };

  if (!reason) { res.status(400).json({ error: 'reason is required' }); return; }

  const machine = await queryOne<{ org_id: number | null }>('SELECT org_id FROM machines WHERE id = $1', [machineId]);
  if (!machine) { res.status(404).json({ error: 'Machine not found' }); return; }

  const rows = await query<{ id: number; recorded_at: Date }>(
    `INSERT INTO machine_impediments (machine_id, technician_id, org_id, reason, custom_reason, notes, tech_lat, tech_lng)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING id, recorded_at`,
    [machineId, req.user!.id, machine.org_id, reason, custom_reason ?? null, notes ?? null, tech_lat ?? null, tech_lng ?? null]
  );

  res.status(201).json(rows[0]);
});

router.post('/non-jd', async (req: Request, res: Response): Promise<void> => {
  const { org_id, custom_name, custom_description } = req.body as {
    org_id?: number;
    custom_name?: string;
    custom_description?: string;
  };

  if (!custom_name) {
    res.status(400).json({ error: 'custom_name is required' });
    return;
  }

  const rows = await query<{ id: number }>(
    `INSERT INTO machines (org_id, is_john_deere, custom_name, custom_description)
     VALUES ($1, FALSE, $2, $3)
     RETURNING id`,
    [org_id ?? null, custom_name, custom_description ?? null]
  );

  const machine = await queryOne(
    'SELECT * FROM machines WHERE id = $1',
    [rows[0].id]
  );

  res.status(201).json(machine);
});

export default router;
