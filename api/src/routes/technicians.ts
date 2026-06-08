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

// Save or update push notification token for the authenticated technician
router.post('/push-token', async (req: Request, res: Response): Promise<void> => {
  const { push_token } = req.body as { push_token?: string };

  if (!push_token) {
    res.status(400).json({ error: 'push_token is required' });
    return;
  }

  await query('UPDATE technicians SET push_token = $1 WHERE id = $2', [push_token, req.user!.id]);
  res.json({ ok: true });
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
  const { employee_id, name, email, role, active } = req.body as {
    employee_id?: string;
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

  if (employee_id !== undefined) {
    if (!EMPLOYEE_ID_REGEX.test(employee_id)) {
      res.status(400).json({ error: 'employee_id must match x000000 format' });
      return;
    }
    const conflict = await queryOne(
      'SELECT id FROM technicians WHERE employee_id = $1 AND id != $2',
      [employee_id, req.params.id]
    );
    if (conflict) {
      res.status(409).json({ error: 'Employee ID já está em uso por outro técnico' });
      return;
    }
  }

  if (role !== undefined && !['admin', 'technician'].includes(role)) {
    res.status(400).json({ error: 'role must be admin or technician' });
    return;
  }

  const updated = await queryOne(
    `UPDATE technicians
     SET
       employee_id = COALESCE($2, employee_id),
       name = COALESCE($3, name),
       email = COALESCE($4, email),
       role = COALESCE($5, role),
       active = COALESCE($6, active)
     WHERE id = $1
     RETURNING *`,
    [req.params.id, employee_id ?? null, name ?? null, email ?? null, role ?? null, active ?? null]
  );

  res.json(updated);
});

router.delete('/:id', async (req: Request, res: Response): Promise<void> => {
  const tech = await queryOne<{ id: number }>(
    'SELECT id FROM technicians WHERE id = $1',
    [req.params.id]
  );
  if (!tech) {
    res.status(404).json({ error: 'Technician not found' });
    return;
  }

  const result = await queryOne<{ count: string }>(
    'SELECT COUNT(*) AS count FROM activities WHERE technician_id = $1',
    [req.params.id]
  );
  const count = parseInt(result?.count ?? '0', 10);

  if (count > 0) {
    res.status(409).json({
      error: `Técnico possui ${count} atividade${count === 1 ? '' : 's'} registrada${count === 1 ? '' : 's'} e não pode ser excluído`,
    });
    return;
  }

  await query('DELETE FROM technicians WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
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
