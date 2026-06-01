import { Router, Request, Response } from 'express';
import { query } from '../db/client';
import { authMiddleware } from '../middleware/auth';
import { APP_VERSION_CONFIG } from '../config/version';

const router = Router();

interface AppConfigRow {
  key: string;
  value: string;
}

interface VersionConfig {
  current_version: string;
  min_required_version: string;
  update_url: string;
  update_message: string;
  force_update: boolean;
}

async function getVersionConfig(): Promise<VersionConfig> {
  try {
    const rows = await query<AppConfigRow>(
      "SELECT key, value FROM app_config WHERE key IN ('current_version','min_required_version','update_url','update_message','force_update')"
    );
    if (rows.length === 0) return { ...APP_VERSION_CONFIG };
    const map: Record<string, string> = {};
    rows.forEach((r) => { map[r.key] = r.value; });
    return {
      current_version:     map.current_version     ?? APP_VERSION_CONFIG.current_version,
      min_required_version: map.min_required_version ?? APP_VERSION_CONFIG.min_required_version,
      update_url:          map.update_url           ?? APP_VERSION_CONFIG.update_url,
      update_message:      map.update_message       ?? APP_VERSION_CONFIG.update_message,
      force_update:        (map.force_update ?? String(APP_VERSION_CONFIG.force_update)) === 'true',
    };
  } catch {
    return { ...APP_VERSION_CONFIG };
  }
}

router.get('/', async (_req: Request, res: Response): Promise<void> => {
  const config = await getVersionConfig();
  res.json(config);
});

router.put('/', authMiddleware, async (req: Request, res: Response): Promise<void> => {
  if (req.user?.role !== 'admin') {
    res.status(403).json({ error: 'Forbidden' });
    return;
  }

  const { current_version, min_required_version, update_url, update_message, force_update } = req.body as Partial<{
    current_version: string;
    min_required_version: string;
    update_url: string;
    update_message: string;
    force_update: boolean;
  }>;

  const updates: [string, string][] = [];
  if (current_version     !== undefined) updates.push(['current_version',      String(current_version)]);
  if (min_required_version !== undefined) updates.push(['min_required_version', String(min_required_version)]);
  if (update_url          !== undefined) updates.push(['update_url',            String(update_url)]);
  if (update_message      !== undefined) updates.push(['update_message',        String(update_message)]);
  if (force_update        !== undefined) updates.push(['force_update',          String(Boolean(force_update))]);

  if (updates.length === 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  for (const [key, value] of updates) {
    await query(
      `INSERT INTO app_config (key, value, updated_at) VALUES ($1, $2, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [key, value]
    );
  }

  const config = await getVersionConfig();
  res.json(config);
});

export default router;
