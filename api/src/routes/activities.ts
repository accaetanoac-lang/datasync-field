import { Router, Request, Response, NextFunction } from 'express';
import multer from 'multer';
import AWS from 'aws-sdk';
import { query, queryOne } from '../db/client';
import { authMiddleware } from '../middleware/auth';
import { Machine } from '../types';

const router = Router();

router.use(authMiddleware);

const BUCKET = 'datasync-field-uploads-496795891165';
const ALLOWED_METHODS = ['starlink_data_sync', 'pen_drive', 'diagnosis'];

async function presign(s3: AWS.S3, photoUrl: string): Promise<string> {
  const key = new URL(photoUrl).pathname.slice(1);
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

// ─── POST / — Start activity or diagnosis ────────────────────────────────────

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
    diagnosis_result,
    diagnosis_checklist,
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
    diagnosis_result?: string;
    diagnosis_checklist?: boolean[];
  };

  if (!method || !ALLOWED_METHODS.includes(method)) {
    res.status(400).json({ error: `method must be one of: ${ALLOWED_METHODS.join(', ')}` });
    return;
  }

  // Conflict check (skip for diagnosis — technician is investigating, not collecting)
  if (machine_id && !is_diagnosis) {
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

  // Hours diff validation — skip for diagnosis (low diff is the trigger condition)
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
        tech_lat, tech_lng, started_at, synced_offline, notes,
        is_diagnosis, connectivity_issue, diagnosis_result, diagnosis_checklist)
     VALUES ($1,$2,$3,$4,'in_progress',$5,$6,$7,$8,NOW(),$9,$10,$11,$12,$13,$14)
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
      diagnosis_result ?? null,
      diagnosis_checklist ? JSON.stringify(diagnosis_checklist) : null,
    ]
  );

  const activity = await queryOne('SELECT * FROM activities WHERE id = $1', [rows[0].id]);
  res.status(201).json(activity);
});

// ─── POST /:id/photo ─────────────────────────────────────────────────────────

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
    const bucket = BUCKET;

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

// ─── POST /:id/connectivity-photo ────────────────────────────────────────────

router.post('/:id/connectivity-photo', (req: Request, res: Response, next: NextFunction): void => {
  photoUpload(req, res, (err) => {
    if (err) {
      res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' });
      return;
    }
    next();
  });
}, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

  if (!req.file) {
    res.status(400).json({ error: 'No photo uploaded — send field "photo" as image file' });
    return;
  }

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
    const key = `activities/${activityId}/connectivity_${Date.now()}.jpg`;

    await s3.putObject({
      Bucket: BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: 'image/jpeg',
    }).promise();

    const photoUrl = `https://${BUCKET}.s3.amazonaws.com/${key}`;
    await queryOne(
      `UPDATE activities SET connectivity_photo_url = $1, connectivity_photo_taken_at = NOW() WHERE id = $2`,
      [photoUrl, activityId]
    );

    res.json({
      connectivity_photo_url: photoUrl,
      pre_signed_connectivity_photo_url: await presign(s3, photoUrl),
    });
  } catch (error) {
    next(error);
  }
});

// ─── PUT /:id/pause ──────────────────────────────────────────────────────────

router.put('/:id/pause', async (req: Request, res: Response): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

  const existing = await queryOne<{ id: number; paused_at: Date | null }>(
    'SELECT id, paused_at FROM activities WHERE id = $1',
    [activityId]
  );

  if (!existing) {
    res.status(404).json({ error: 'Activity not found' });
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

  res.json({ paused_at: updated!.paused_at });
});

// ─── PUT /:id/resume ─────────────────────────────────────────────────────────

router.put('/:id/resume', async (req: Request, res: Response): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

  const existing = await queryOne<{ id: number; paused_at: Date | null }>(
    'SELECT id, paused_at FROM activities WHERE id = $1',
    [activityId]
  );

  if (!existing) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }
  if (!existing.paused_at) {
    res.status(409).json({ error: 'Activity is not paused' });
    return;
  }

  const updated = await queryOne<{ total_pause_minutes: number }>(
    `UPDATE activities
     SET total_pause_minutes = COALESCE(total_pause_minutes, 0)
                               + FLOOR(EXTRACT(EPOCH FROM (NOW() - paused_at)) / 60),
         paused_at = NULL
     WHERE id = $1
     RETURNING total_pause_minutes`,
    [activityId]
  );

  res.json({ total_pause_minutes: updated!.total_pause_minutes });
});

// ─── PUT /:id/finish ─────────────────────────────────────────────────────────

router.put('/:id/finish', async (req: Request, res: Response): Promise<void> => {
  const { notes, diagnosis_result, diagnosis_checklist, total_pause_minutes, method } = req.body as {
    notes?: string;
    diagnosis_result?: string;
    diagnosis_checklist?: boolean[];
    total_pause_minutes?: number;
    method?: string;
  };
  const activityId = parseInt(req.params.id, 10);

  const existing = await queryOne<{ id: number; technician_id: number; started_at: Date }>(
    'SELECT id, technician_id, started_at FROM activities WHERE id = $1',
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

  const updated = await queryOne(
    `UPDATE activities
     SET finished_at = NOW(),
         status = 'completed',
         duration_minutes = GREATEST(0,
           FLOOR(EXTRACT(EPOCH FROM (NOW() - started_at)) / 60)
           - COALESCE($2::integer, total_pause_minutes, 0)
           - CASE WHEN paused_at IS NOT NULL AND $2::integer IS NULL
               THEN FLOOR(EXTRACT(EPOCH FROM (NOW() - paused_at)) / 60)
               ELSE 0 END
         ),
         paused_at = NULL,
         notes = COALESCE($3, notes),
         diagnosis_result = COALESCE($4, diagnosis_result),
         diagnosis_checklist = COALESCE($5::jsonb, diagnosis_checklist),
         method = COALESCE($6, method)
     WHERE id = $1
     RETURNING *`,
    [
      activityId,
      total_pause_minutes ?? null,
      notes ?? null,
      diagnosis_result ?? null,
      diagnosis_checklist ? JSON.stringify(diagnosis_checklist) : null,
      method ?? null,
    ]
  );

  res.json(updated);
});

// ─── PUT /:id/no-use ─────────────────────────────────────────────────────────

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

// ─── PUT /:id/cancel ─────────────────────────────────────────────────────────

router.put('/:id/cancel', async (req: Request, res: Response): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);
  if (isNaN(activityId)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const { cancel_reason } = req.body as { cancel_reason?: string };

  if (!cancel_reason || !cancel_reason.trim()) {
    res.status(400).json({ error: 'cancel_reason is required' });
    return;
  }

  const existing = await queryOne<{ id: number }>(
    'SELECT id FROM activities WHERE id = $1',
    [activityId]
  );

  if (!existing) {
    res.status(404).json({ error: 'Activity not found' });
    return;
  }

  await query(
    `UPDATE activities
     SET status = 'cancelled', cancelled_at = NOW(), paused_at = NULL,
         cancel_reason = $2
     WHERE id = $1`,
    [activityId, cancel_reason ?? null]
  );

  res.json({ ok: true });
});

// ─── PUT /:id/oc-survey ──────────────────────────────────────────────────────

router.put('/:id/oc-survey', async (req: Request, res: Response): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);
  if (isNaN(activityId)) { res.status(400).json({ error: 'Invalid id' }); return; }

  const { oc_has_app, oc_uses_it, oc_interested, oc_explained, oc_notes } = req.body as {
    oc_has_app?: boolean | null;
    oc_uses_it?: boolean | null;
    oc_interested?: boolean | null;
    oc_explained?: boolean;
    oc_notes?: string;
  };

  await query(
    `UPDATE activities SET oc_has_app=$1, oc_uses_it=$2, oc_interested=$3, oc_explained=$4, oc_notes=$5 WHERE id=$6`,
    [oc_has_app ?? null, oc_uses_it ?? null, oc_interested ?? null, oc_explained ?? false, oc_notes ?? null, activityId]
  );

  res.json({ ok: true });
});

// ─── POST /:id/oc-photo ──────────────────────────────────────────────────────

router.post('/:id/oc-photo', (req: Request, res: Response, next: NextFunction): void => {
  photoUpload(req, res, (err) => {
    if (err) { res.status(400).json({ error: err instanceof Error ? err.message : 'Upload error' }); return; }
    next();
  });
}, async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const activityId = parseInt(req.params.id, 10);

  if (!req.file) { res.status(400).json({ error: 'No photo uploaded' }); return; }

  const existing = await queryOne<{ id: number }>('SELECT id FROM activities WHERE id = $1', [activityId]);
  if (!existing) { res.status(404).json({ error: 'Activity not found' }); return; }

  try {
    const s3 = new AWS.S3({ region: process.env.AWS_REGION ?? 'us-east-1' });
    const key = `activities/${activityId}/oc_explanation_${Date.now()}.jpg`;
    await s3.putObject({
      Bucket: BUCKET, Key: key, Body: req.file.buffer, ContentType: 'image/jpeg',
    }).promise();
    const photoUrl = `https://${BUCKET}.s3.amazonaws.com/${key}`;
    await query(`UPDATE activities SET oc_photo_url=$1, oc_explained=TRUE WHERE id=$2`, [photoUrl, activityId]);
    res.json({ oc_photo_url: photoUrl });
  } catch (error) {
    next(error);
  }
});

// ─── POST /no-use-direct ─────────────────────────────────────────────────────

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

// ─── GET / — List activities ─────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response): Promise<void> => {
  const {
    tech_id,
    org_id,
    date_from,
    date_to,
    status,
    method,
    is_diagnosis,
    diagnosis_result,
  } = req.query as Record<string, string>;

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
  if (is_diagnosis !== undefined) {
    conditions.push(`a.is_diagnosis = $${paramIdx++}`);
    params.push(is_diagnosis === 'true');
  }
  if (diagnosis_result) {
    conditions.push(`a.diagnosis_result = $${paramIdx++}`);
    params.push(diagnosis_result);
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
    (rows as Record<string, unknown>[]).map(async (row) => {
      const enriched: Record<string, unknown> = { ...row };
      if (row.photo_url)
        enriched.pre_signed_photo_url = await presign(s3, row.photo_url as string);
      if (row.connectivity_photo_url)
        enriched.pre_signed_connectivity_photo_url = await presign(s3, row.connectivity_photo_url as string);
      return enriched;
    })
  );
  res.json(result);
});

// ─── GET /:id/report ─────────────────────────────────────────────────────────

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
  const row = activity as Record<string, unknown>;
  const enriched: Record<string, unknown> = { ...row };
  if (row.photo_url)
    enriched.pre_signed_photo_url = await presign(s3, row.photo_url as string);
  if (row.connectivity_photo_url)
    enriched.pre_signed_connectivity_photo_url = await presign(s3, row.connectivity_photo_url as string);
  res.json(enriched);
});

export default router;
