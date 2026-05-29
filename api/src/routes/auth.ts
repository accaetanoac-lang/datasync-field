import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { queryOne } from '../db/client';
import { Technician, JwtPayload } from '../types';
import { authMiddleware } from '../middleware/auth';

const router = Router();

const EMPLOYEE_ID_REGEX = /^x\d{6}$/;
const JWT_EXPIRES_IN = '7d';

function signToken(payload: Omit<JwtPayload, 'iat' | 'exp'>): string {
  return jwt.sign(payload, process.env.JWT_SECRET as string, { expiresIn: JWT_EXPIRES_IN });
}

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  const { employee_id } = req.body as { employee_id?: string };

  if (!employee_id || !EMPLOYEE_ID_REGEX.test(employee_id)) {
    res.status(400).json({ error: 'employee_id must match format x000000' });
    return;
  }

  const tech = await queryOne<Technician>(
    'SELECT * FROM technicians WHERE employee_id = $1',
    [employee_id]
  );

  if (!tech) {
    res.status(401).json({ error: 'Employee ID not found' });
    return;
  }

  if (!tech.active) {
    res.status(401).json({ error: 'Account is deactivated' });
    return;
  }

  const token = signToken({ id: tech.id, employee_id: tech.employee_id, role: tech.role });
  res.json({
    token,
    technician: {
      id: tech.id,
      employee_id: tech.employee_id,
      name: tech.name,
      role: tech.role,
    },
  });
});

router.post('/refresh', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  const user = req.user!;
  const tech = await queryOne<Technician>(
    'SELECT * FROM technicians WHERE id = $1 AND active = TRUE',
    [user.id]
  );

  if (!tech) {
    res.status(401).json({ error: 'Account not found or deactivated' });
    return;
  }

  const token = signToken({ id: tech.id, employee_id: tech.employee_id, role: tech.role });
  res.json({ token });
});

export default router;
