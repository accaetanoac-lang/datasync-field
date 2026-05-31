import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import AWS from 'aws-sdk';
import { query, queryOne } from '../db/client';
import { authMiddleware } from '../middleware/auth';
import { Machine } from '../types';

const router = Router();

router.use(authMiddleware);

const BUCKET = 'datasync-field-uploads-496795891165';

// getSignedUrl is nominally synchronous in SDK v2, but container credentials
// (AWS_CONTAINER_CREDENTIALS_RELATIVE_URI) are resolved lazily and may not be
// cached yet on the first call, causing it to silently return a stub URL.
// getSignedUrlPromise() properly awaits credential resolution before signing.
async function presign(s3: AWS.S3, photoUrl: string): Promise<string> {
  const key = new URL(photoUrl).pathname.slice(1); // strip leading /
  return s3.getSignedUrlPromise('getObject', { Bucket: BUCKET, Key: key, Expires: 3600 });
}

const photoUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
}).single('photo');

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
    is_diagnosis,
    connectivity_issue,
  } = req.body as {
    org_id?: number;
    machine_id?: number;
    method?: string;
    current_hours?: number;
    tech_lat?: number;
    tech_lng?: number;
    synced_offline?: boolean;
    notes?: string;
    is_diagnosis?: boolean;
    connectivity_issue?: boolean;
  };

  if (!method || !['starlink_data_sync', 'pen_drive', 'diagnosis'].includes(method)) {
    res.status(400).json({ error: 'method must be starlink_data_sync, pen_drive, or diagnosis' });
    return;
  }

  // Diagnosis activities skip hours-diff validation and conflict check
  if (!is_diagnosis && machine_id) {
    const conflict = await queryOne<{ status: string; technician_name: string | null }>(
      `SELECT a.status, t.name AS technician_name
       FROM activities a
       LEFT JOIN technicians t ON t.id = a.technician_id
       WHERE a.machine_id = $1
         AND a.technician_id != $2
         AND a.status IN ('in_progress', 'completed')
       ORDER BY CASE WHEN a.status = 'completed' THEN 0 ELSE 1 END
       LIMIT 1`,
      [machine_id, req.user!.id]
    );

    if (conflict) {
      if (conflict.status === 'completed') {
        res.status(409).json({ error: 'Dados desta máquina já foram coletados por outro técnico' });
      } else {
        res.status(409).json({
          error: 'Esta máquina já está sendo coletada por outro técnico agora',
          technician: conflict.technician_name,
        });
      }
      return;
    }
  }

  // Validate hours diff for JD machines (skip for diagnosis activities)
  if (!is_diagnosis && machine_id && current_hours !== undefined) {
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
        tech_lat, tech_lng, started_at, synced_offline, notes, is_diagnosis, connectivity_issue)
     VALUES ($1,$2,$3,$4,'in_progress',$5,$6,$7,$8,NOW(),$9,$10,$11,$12)
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
      is_diagnosis ?? false,
      connectivity_issue ?? false,
    ]
  );

  const activity = await queryOne(
    'SELECT * FROM activities WHERE id = $1',
    [rows[0].id]
  );
  res.status(201).json(activity);
});

router.post('/:id/photo', (req: Request, res: Response, next: NextFunction): void => {
  photoUpload(req, res, (err) => {
    if (err) {
      console.error('Photo upload multer error:', err);
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
      return;
    }
    next();
  });
}, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

  if (!req.file) {
    console.error('Photo upload: no file received. Content-Type:', req.headers['content-type']);
    res.status(400).json({ error: 'No photo uploaded — send field "photo" as image file' });
    return;
  }

  console.log('Photo received:', req.file.originalname, req.file.size, 'bytes', req.file.mimetype);

  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM activities WHERE id = $1',
    [activityId]
  );
  if (!existing) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }

  try {
    const s3 = new AWS.S3({ region: process.env.AWS_REGION ?? 'us-east-1' });
    const timestamp = Date.now();
    const key = `activities/${activityId}/panel_${timestamp}.jpg`;
    const bucket = 'datasync-field-uploads-496795891165';

    console.log('Uploading to S3:', bucket, key);
    await s3.putObject({
      Bucket: bucket,
      Key: key,
      Body: req.file.buffer,
      ContentType: 'image/jpeg',
    }).promise();

    const photoUrl = `https://${bucket}.s3.amazonaws.com/${key}`;

    await queryOne(
      `UPDATE activities SET photo_url = $1, photo_taken_at = NOW() WHERE id = $2 RETURNING id`,
      [photoUrl, activityId]
    );

    res.json({ photo_url: photoUrl, pre_signed_photo_url: await presign(s3, photoUrl) });
  } catch (error) {
    console.error('Photo upload error:', error);
    next(error);
  }
});

router.put('/:id/pause', async (req: Request, res: Response): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

  const existing = await queryOne<{ id: number; technician_id: number; paused_at: Date | null }>(
    'SELECT id, technician_id, paused_at FROM activities WHERE id = $1',
    [activityId]
  );

  if (!existing) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }

  if (req.user!.role !== 'admin' && existing.technician_id !== req.user!.id) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  if (existing.paused_at) {
    res.status(409).json({ error: 'Activity is already paused' });
    return;
  }

  const updated = await queryOne<{ paused_at: Date }>(
    `UPDATE activities SET paused_at = NOW() WHERE id = $1 RETURNING paused_at`,
    [activityId]
  );

  res.json(updated);
});

router.put('/:id/resume', async (req: Request, res: Response): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

  const existing = await queryOne<{
    id: number;
    technician_id: number;
    paused_at: Date | null;
  }>(
    'SELECT id, technician_id, paused_at FROM activities WHERE id = $1',
    [activityId]
  );

  if (!existing) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }

  if (req.user!.role !== 'admin' && existing.technician_id !== req.user!.id) {
    res.status(403).json({ error: 'Not authorized' });
    return;
  }

  if (!existing.paused_at) {
    res.status(409).json({ error: 'Activity is not paused' });
    return;
  }

  const updated = await queryOne<{ total_pause_minutes: number }>(
    `UPDATE activities
     SET total_pause_minutes = COALESCE(total_pause_minutes, 0) +
           ROUND(EXTRACT(EPOCH FROM (NOW() - paused_at)) / 60),
         paused_at = NULL
     WHERE id = $1
     RETURNING total_pause_minutes`,
    [activityId]
  );

  res.json(updated);
});

router.put('/:id/finish', async (req: Request, res: Response): Promise<void> => {
  const {
    notes,
    diagnosis_result,
    diagnosis_checklist,
    total_pause_minutes: clientPauseMinutes,
  } = req.body as {
    notes?: string;
    diagnosis_result?: string;
    diagnosis_checklist?: boolean[];
    total_pause_minutes?: number;
  };
  const activityId = parseInt(req.params.id, 10);

  const existing = await queryOne<{
    id: number;
    technician_id: number;
    started_at: Date;
    is_diagnosis: boolean;
    total_pause_minutes: number;
  }>(
    'SELECT id, technician_id, started_at, is_diagnosis, total_pause_minutes FROM activities WHERE id = $1',
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

  // For diagnosis: subtract pause minutes from total elapsed
  const pauseMinutes = existing.is_diagnosis
    ? Math.max(0, clientPauseMinutes ?? existing.total_pause_minutes ?? 0)
    : 0;

  const updated = await queryOne(
    `UPDATE activities
     SET finished_at = NOW(),
         status = 'completed',
         duration_minutes = GREATEST(0,
           ROUND(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60) - $3
         ),
         notes = COALESCE($2, notes),
         diagnosis_result    = COALESCE($4, diagnosis_result),
         diagnosis_checklist = COALESCE($5, diagnosis_checklist),
         total_pause_minutes = $3,
         paused_at = NULL
     WHERE id = $1
     RETURNING *`,
    [
      activityId,
      notes ?? null,
      pauseMinutes,
      diagnosis_result ?? null,
      diagnosis_checklist ? JSON.stringify(diagnosis_checklist) : null,
    ]
  );

  res.json(updated);
});

router.put('/:id/no-use', async (req: Request, res: Response): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

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
    activity_type,
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
  if (activity_type === 'diagnosis') {
    conditions.push(`a.is_diagnosis = TRUE`);
  } else if (activity_type === 'normal') {
    conditions.push(`(a.is_diagnosis = FALSE OR a.is_diagnosis IS NULL)`);
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

  const s3 = new AWS.S3({ region: process.env.AWS_REGION ?? 'us-east-1' });
  const result = await Promise.all(
    (rows as Record<string, unknown>[]).map(async (row) =>
      row.photo_url
        ? { ...row, pre_signed_photo_url: await presign(s3, row.photo_url as string) }
        : row
    )
  );
  res.json(result);
});

router.get('/:id/report', async (req: Request, res: Response): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

  const activity = await queryOne(
    `SELECT
       a.*,
       t.name AS technician_name,
       t.employee_id,
       o.name AS org_name,
       m.pin AS machine_pin,
       m.custom_name AS machine_custom_name,
       m.modelo,
       m.machine_hours AS machine_last_hours,
       m.days_offline
     FROM activities a
     LEFT JOIN technicians t ON t.id = a.technician_id
     LEFT JOIN organizations o ON o.id = a.org_id
     LEFT JOIN machines m ON m.id = a.machine_id
     WHERE a.id = $1`,
    [activityId]
  );

  if (!activity) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }

  const s3 = new AWS.S3({ region: process.env.AWS_REGION ?? 'us-east-1' });
  const enriched = (activity as Record<string, unknown>).photo_url
    ? { ...activity, pre_signed_photo_url: await presign(s3, (activity as Record<string, unknown>).photo_url as string) }
    : activity;
  res.json(enriched);
});

export default router;
