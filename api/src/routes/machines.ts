import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

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
