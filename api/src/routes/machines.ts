import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/search', async (req: Request, res: Response): Promise<void> => {
  const term = ((req.query.pin as string | undefined) ?? '').trim();

  if (term.length < 2) {
    res.json({ found: false });
    return;
  }

  // 1. JD machines linked to an org
  const jdLinked = await queryOne<Record<string, unknown>>(
    `SELECT m.id, m.pin, m.custom_name, m.is_john_deere, m.modelo,
            m.days_offline, m.last_call_date, m.machine_hours,
            m.last_known_lat, m.last_known_lng, m.org_id,
            o.name AS org_name
     FROM machines m
     LEFT JOIN organizations o ON o.id = m.org_id
     WHERE m.pin ILIKE $1
     ORDER BY m.days_offline DESC NULLS LAST
     LIMIT 1`,
    [`%${term}%`]
  );
  if (jdLinked) {
    res.json({ found: true, source: 'jd_linked', machine: jdLinked });
    return;
  }

  // 2. JD machines registered without an org
  const jdUnlinked = await queryOne<Record<string, unknown>>(
    `SELECT m.id, m.pin, TRUE AS is_john_deere,
            j.machine_name AS custom_name, j.model AS modelo,
            NULL::integer AS days_offline, NULL::timestamp AS last_call_date,
            j.engine_hours AS machine_hours,
            NULL::numeric AS last_known_lat, NULL::numeric AS last_known_lng,
            NULL::integer AS org_id, j.organization_name AS org_name
     FROM jd_unlinked_machines j
     JOIN machines m ON m.id = j.machine_id
     WHERE j.pin ILIKE $1
     LIMIT 1`,
    [`%${term}%`]
  );
  if (jdUnlinked) {
    res.json({ found: true, source: 'jd_unlinked', machine: jdUnlinked });
    return;
  }

  // 3. Non-JD machines
  const nonJd = await queryOne<Record<string, unknown>>(
    `SELECT njm.id, njm.serial_number AS pin, njm.custom_name,
            FALSE AS is_john_deere, njm.model AS modelo,
            NULL::integer AS days_offline, NULL::timestamp AS last_call_date,
            NULL::numeric AS machine_hours,
            NULL::numeric AS last_known_lat, NULL::numeric AS last_known_lng,
            njm.org_id, NULL::text AS org_name, njm.brand
     FROM non_jd_machines njm
     WHERE njm.serial_number ILIKE $1
     LIMIT 1`,
    [`%${term}%`]
  );
  if (nonJd) {
    res.json({ found: true, source: 'non_jd', machine: nonJd });
    return;
  }

  res.json({ found: false });
});

// ─── GET /jd-unlinked — admin list ───────────────────────────────────────────

router.get('/jd-unlinked', async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT j.*,
            t.name AS technician_name,
            COUNT(a.id)::int AS activity_count,
            MAX(a.created_at) AS last_activity_at
     FROM jd_unlinked_machines j
     LEFT JOIN technicians t ON t.employee_id = j.created_by
     LEFT JOIN activities a ON a.machine_id = j.machine_id
     GROUP BY j.id, t.name
     ORDER BY j.created_at DESC`
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

// ─── POST /jd-unlinked — register JD machine without org ─────────────────────

router.post('/jd-unlinked', async (req: Request, res: Response): Promise<void> => {
  const {
    pin, organization_name, model, machine_name, machine_type,
    year, engine_hours, notes,
  } = req.body as {
    pin?: string;
    organization_name?: string;
    model?: string;
    machine_name?: string;
    machine_type?: string;
    year?: number;
    engine_hours?: number;
    notes?: string;
  };

  if (!pin?.trim()) {
    res.status(400).json({ error: 'pin is required' });
    return;
  }

  const existing = await queryOne<{ id: number; machine_id: number }>(
    'SELECT id, machine_id FROM jd_unlinked_machines WHERE pin = $1',
    [pin.trim()]
  );
  if (existing) {
    res.status(409).json({ error: 'PIN already registered', id: existing.id, machine_id: existing.machine_id });
    return;
  }

  // Create machines entry for activity compatibility
  const mRows = await query<{ id: number }>(
    `INSERT INTO machines (is_john_deere, pin, custom_name) VALUES (TRUE, $1, $2) RETURNING id`,
    [pin.trim(), machine_name?.trim() || pin.trim()]
  );
  const machineId = mRows[0].id;

  const createdBy = req.user!.employee_id ?? String(req.user!.id);

  const rows = await query(
    `INSERT INTO jd_unlinked_machines
       (pin, organization_name, model, machine_name, machine_type, year, engine_hours, notes, created_by, machine_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
     RETURNING *`,
    [
      pin.trim(),
      organization_name?.trim() || null,
      model?.trim() || null,
      machine_name?.trim() || null,
      machine_type?.trim() || null,
      year || null,
      engine_hours || null,
      notes?.trim() || null,
      createdBy,
      machineId,
    ]
  );

  res.status(201).json({ ...rows[0], machine_id: machineId });
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
