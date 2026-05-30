import { Router, Request, Response } from 'express';
import { query, queryOne } from '../db/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const search = (req.query.search as string) ?? '';

  const rows = await query<{
    id: number;
    org_id_jd: string;
    name: string;
    engagement_level: string;
    offline_machine_count: string;
  }>(
    `SELECT
       o.id,
       o.org_id_jd,
       o.name,
       o.engagement_level,
       COUNT(m.id) FILTER (WHERE m.days_offline >= 30 OR m.last_call_date IS NULL) AS offline_machine_count
     FROM organizations o
     LEFT JOIN machines m ON m.org_id = o.id
     WHERE ($1 = '' OR o.name ILIKE '%' || $1 || '%')
     GROUP BY o.id
     HAVING COUNT(m.id) FILTER (WHERE m.days_offline >= 30 OR m.last_call_date IS NULL) > 0
     ORDER BY offline_machine_count DESC, o.name
     LIMIT 200`,
    [search]
  );

  res.json(rows.map((r) => ({
    ...r,
    offline_machine_count: parseInt(r.offline_machine_count, 10),
  })));
});

router.get('/:id', async (req: Request, res: Response): Promise<void> => {
  const org = await queryOne(
    'SELECT * FROM organizations WHERE id = $1',
    [req.params.id]
  );

  if (!org) {
    res.status(404).json({ error: 'Organization not found' });
    return;
  }

  res.json(org);
});

router.get('/:id/machines', async (req: Request, res: Response): Promise<void> => {
  const machines = await query(
    `SELECT id, pin, days_offline, machine_hours, last_call_date,
            last_known_lat, last_known_lng, offline_range, custom_name, is_john_deere
     FROM machines
     WHERE org_id = $1
       AND (days_offline >= 30 OR last_call_date IS NULL)
       AND id NOT IN (
         SELECT machine_id FROM activities
         WHERE status = 'completed'
           AND machine_id IS NOT NULL
           AND created_at >= NOW() - INTERVAL '24 hours'
       )
       AND id NOT IN (
         SELECT machine_id FROM activities
         WHERE status = 'no_use'
           AND machine_id IS NOT NULL
           AND created_at >= NOW() - INTERVAL '30 days'
       )
     ORDER BY days_offline DESC NULLS LAST`,
    [req.params.id]
  );

  res.json(machines);
});

export default router;
