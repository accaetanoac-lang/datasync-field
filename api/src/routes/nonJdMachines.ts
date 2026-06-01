import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();
router.use(authMiddleware);

// GET /non-jd-machines?serial=<val>   → search (mobile auto-complete)
// GET /non-jd-machines?org_id=<id>    → list for org (mobile MachineList section)
// GET /non-jd-machines                → full list with aggregates (admin)
router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { serial, org_id } = req.query as Record<string, string | undefined>;

  if (serial && serial.length >= 4) {
    const rows = await query<Record<string, unknown>>(
      `SELECT njm.*,
              array_agg(DISTINCT o.name) FILTER (WHERE o.name IS NOT NULL) AS org_names
       FROM non_jd_machines njm
       LEFT JOIN non_jd_machine_orgs nmo ON nmo.non_jd_machine_id = njm.id
       LEFT JOIN organizations o ON o.id = nmo.org_id
       WHERE njm.serial_number ILIKE $1
       GROUP BY njm.id
       LIMIT 1`,
      [`%${serial}%`]
    );
    if (rows.length === 0) {
      res.json({ found: false, machine: null });
    } else {
      res.json({ found: true, machine: rows[0] });
    }
    return;
  }

  if (org_id && !isNaN(Number(org_id))) {
    const rows = await query(
      `SELECT njm.*
       FROM non_jd_machines njm
       JOIN non_jd_machine_orgs nmo ON nmo.non_jd_machine_id = njm.id
       WHERE nmo.org_id = $1
       ORDER BY njm.custom_name`,
      [Number(org_id)]
    );
    res.json(rows);
    return;
  }

  // Full list with aggregates for admin
  const rows = await query(
    `SELECT njm.*,
            COUNT(DISTINCT nmo.org_id)::int AS org_count,
            STRING_AGG(DISTINCT o.name, ', ' ORDER BY o.name) AS org_names,
            COUNT(a.id)::int AS activity_count,
            MAX(a.created_at) AS last_activity_at
     FROM non_jd_machines njm
     LEFT JOIN non_jd_machine_orgs nmo ON nmo.non_jd_machine_id = njm.id
     LEFT JOIN organizations o ON o.id = nmo.org_id
     LEFT JOIN activities a ON a.non_jd_machine_id = njm.id
     GROUP BY njm.id
     ORDER BY njm.created_at DESC`
  );
  res.json(rows);
});

// POST /non-jd-machines — create or return existing; also registers org association
router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { serial_number, custom_name, brand, model, description, org_id } = req.body as {
    serial_number?: string;
    custom_name?: string;
    brand?: string;
    model?: string;
    description?: string;
    org_id?: number;
  };

  if (!custom_name?.trim()) {
    res.status(400).json({ error: 'custom_name is required' });
    return;
  }

  const serial = serial_number?.trim() || null;

  // Find existing by serial (if provided)
  let nonJdMachine: Record<string, unknown> | null = null;
  if (serial) {
    nonJdMachine = await queryOne<Record<string, unknown>>(
      'SELECT * FROM non_jd_machines WHERE serial_number = $1',
      [serial]
    );
  }

  if (!nonJdMachine) {
    // Create new non_jd_machine record
    const desc = [brand, model, description].filter(Boolean).join(' | ') || null;
    const rows = await query<Record<string, unknown>>(
      `INSERT INTO non_jd_machines (serial_number, custom_name, brand, model, description, org_id, registered_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       RETURNING *`,
      [serial, custom_name.trim(), brand?.trim() || null, model?.trim() || null, desc, org_id ?? null, req.user!.id]
    );
    nonJdMachine = rows[0];
  }

  // Register org association (idempotent)
  if (org_id) {
    await query(
      `INSERT INTO non_jd_machine_orgs (non_jd_machine_id, org_id)
       VALUES ($1, $2)
       ON CONFLICT (non_jd_machine_id, org_id) DO NOTHING`,
      [nonJdMachine.id, org_id]
    );
  }

  // Find or create corresponding machines entry for this org (backward compat with startActivity)
  const machineCustomName = String(nonJdMachine.custom_name);
  let machineId: number;
  const existing = await queryOne<{ id: number }>(
    `SELECT id FROM machines
     WHERE is_john_deere = FALSE AND custom_name = $1 AND ($2::int IS NULL OR org_id = $2)
     ORDER BY id
     LIMIT 1`,
    [machineCustomName, org_id ?? null]
  );

  if (existing) {
    machineId = existing.id;
  } else {
    const desc = [nonJdMachine.brand, nonJdMachine.model, nonJdMachine.description]
      .filter(Boolean).join(' | ') as string | null;
    const mRows = await query<{ id: number }>(
      `INSERT INTO machines (org_id, is_john_deere, custom_name, custom_description)
       VALUES ($1, FALSE, $2, $3)
       RETURNING id`,
      [org_id ?? null, machineCustomName, desc || null]
    );
    machineId = mRows[0].id;
  }

  res.status(201).json({ ...nonJdMachine, machine_id: machineId });
});

// GET /non-jd-machines/:id — full details with orgs and recent activities
router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const machine = await queryOne<Record<string, unknown>>(
    'SELECT * FROM non_jd_machines WHERE id = $1',
    [id]
  );
  if (!machine) { res.status(404).json({ error: 'Not found' }); return; }

  const orgs = await query(
    `SELECT o.id, o.name, nmo.first_seen_at
     FROM non_jd_machine_orgs nmo
     JOIN organizations o ON o.id = nmo.org_id
     WHERE nmo.non_jd_machine_id = $1
     ORDER BY nmo.first_seen_at`,
    [id]
  );

  const activities = await query(
    `SELECT a.id, a.created_at, a.status, a.method, a.duration_minutes,
            t.name AS technician_name, o.name AS org_name
     FROM activities a
     LEFT JOIN technicians t ON t.id = a.technician_id
     LEFT JOIN organizations o ON o.id = a.org_id
     WHERE a.non_jd_machine_id = $1
     ORDER BY a.created_at DESC
     LIMIT 50`,
    [id]
  );

  res.json({ ...machine, orgs, activities });
});

export default router;
