import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { authMiddleware } from '../middleware/auth';

const router = Router();

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const { from, to, technician_id, reason } = req.query as Record<string, string | undefined>;

  const conditions: string[] = [];
  const params: unknown[] = [];

  if (from) { params.push(from); conditions.push(`mi.recorded_at >= $${params.length}`); }
  if (to)   { params.push(to);   conditions.push(`mi.recorded_at <= $${params.length}`); }
  if (technician_id && !isNaN(Number(technician_id))) {
    params.push(Number(technician_id));
    conditions.push(`mi.technician_id = $${params.length}`);
  }
  if (reason) { params.push(reason); conditions.push(`mi.reason = $${params.length}`); }

  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const rows = await query(
    `SELECT mi.id, mi.recorded_at, mi.reason, mi.custom_reason, mi.notes,
            mi.tech_lat, mi.tech_lng,
            t.name AS technician_name, t.employee_id,
            o.name AS org_name,
            m.pin AS machine_pin, m.custom_name AS machine_custom_name
     FROM machine_impediments mi
     LEFT JOIN technicians t ON t.id = mi.technician_id
     LEFT JOIN organizations o ON o.id = mi.org_id
     LEFT JOIN machines m ON m.id = mi.machine_id
     ${where}
     ORDER BY mi.recorded_at DESC
     LIMIT 500`,
    params
  );

  res.json(rows);
});

export default router;
