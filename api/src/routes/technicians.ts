import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { authMiddleware } from '../middleware/auth';
import { adminOnly } from '../middleware/adminOnly';

const router = Router();

const EMPLOYEE_ID_REGEX = /^x\d{6}$/;

router.use(authMiddleware);

// Self profile — any technician can view their own data
router.get('/me', async (req: Request, res: Response): Promise<void> => {
  const tech = await queryOne(
    'SELECT id, employee_id, name, email, role, active, created_at FROM technicians WHERE id = $1',
    [req.user!.id]
  );
  res.json(tech);
});

// All routes below are admin-only
router.use(adminOnly);

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       t.*,
       COUNT(a.id) AS total_activities,
       MAX(a.created_at) AS last_activity
     FROM technicians t
     LEFT JOIN activities a ON a.technician_id = t.id
     GROUP BY t.id
     ORDER BY t.name`
  );
  res.json(rows);
});

router.post('/', async (req: Request, res: Response): Promise<void> => {
  const { employee_id, name, email, role } = req.body as {
    employee_id?: string;
    name?: string;
    email?: string;
    role?: string;
  };

  if (!employee_id || !EMPLOYEE_ID_REGEX.test(employee_id)) {
    res.status(400).json({ error: 'employee_id must match x000000 format' });
    return;
  }

  if (!name) {
    res.status(400).json({ error: 'name is required' });
    return;
  }

  if (role && !['admin', 'technician'].includes(role)) {
    res.status(400).json({ error: 'role must be admin or technician' });
    return;
  }

  const existing = await queryOne(
    'SELECT id FROM technicians WHERE employee_id = $1',
    [employee_id]
  );
  if (existing) {
    res.status(409).json({ error: 'Employee ID already registered' });
    return;
  }

  const rows = await query<{ id: number }>(
    `INSERT INTO technicians (employee_id, name, email, role)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [employee_id, name, email ?? null, role ?? 'technician']
  );

  const tech = await queryOne('SELECT * FROM technicians WHERE id = $1', [rows[0].id]);
  res.status(201).json(tech);
});

router.put('/:id', async (req: Request, res: Response): Promise<void> => {
  const { name, email, role, active } = req.body as {
    name?: string;
    email?: string;
    role?: string;
    active?: boolean;
  };

  const tech = await queryOne<{ id: number }>(
    'SELECT id FROM technicians WHERE id = $1',
    [req.params.id]
  );
  if (!tech) {
    res.status(404).json({ error: 'Technician not found' });
    return;
  }

  const updated = await queryOne(
    `UPDATE technicians
     SET
       name = COALESCE($2, name),
       email = COALESCE($3, email),
       role = COALESCE($4, role),
       active = COALESCE($5, active)
     WHERE id = $1
     RETURNING *`,
    [req.params.id, name ?? null, email ?? null, role ?? null, active ?? null]
  );

  res.json(updated);
});

router.get('/:id/activities', async (req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT
       a.*,
       o.name AS org_name,
       m.pin AS machine_pin,
       m.custom_name
     FROM activities a
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN machines m ON m.id = a.machine_id
     WHERE a.technician_id = $1
     ORDER BY a.created_at DESC
     LIMIT 200`,
    [req.params.id]
  );
  res.json(rows);
});

export default router;
