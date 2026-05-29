import { Router, Request, Response } from 'express';
import AWS from 'aws-sdk';
import { authMiddleware } from '../middleware/auth';
import { adminOnly } from '../middleware/adminOnly';
import { uploadMiddleware } from '../middleware/upload';
import { parseMlc, parseCde, parseGap } from '../services/excelParser';
import {
  upsertOrganizations,
  upsertOrganizationsFromCde,
  upsertMachines,
  upsertCustomerHealth,
  upsertHectaresGap,
} from '../services/upsert';
import { query, queryOne } from '../db/client';

const router = Router();

router.use(authMiddleware, adminOnly);

const s3 = new AWS.S3({ region: process.env.AWS_REGION });

async function uploadToS3(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  if (!process.env.S3_BUCKET_NAME) return key;
  await s3
    .putObject({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
    .promise();
  return `s3://${process.env.S3_BUCKET_NAME}/${key}`;
}

router.post('/', uploadMiddleware, async (req: Request, res: Response): Promise<void> => {
  const files = req.files as Record<string, Express.Multer.File[]>;
  const { reference_month } = req.body as { reference_month?: string };

  if (!files?.file_mlc?.[0] || !files?.file_cde?.[0] || !files?.file_gap?.[0]) {
    res.status(400).json({ error: 'All three files (file_mlc, file_cde, file_gap) are required' });
    return;
  }

  if (!reference_month) {
    res.status(400).json({ error: 'reference_month is required (YYYY-MM-DD)' });
    return;
  }

  const uploadMonth = new Date(reference_month);
  if (isNaN(uploadMonth.getTime())) {
    res.status(400).json({ error: 'reference_month must be a valid date (YYYY-MM-DD)' });
    return;
  }

  // Create upload record in processing state
  const uploadRows = await query<{ id: number }>(
    `INSERT INTO excel_uploads (uploaded_by, reference_month, status)
     VALUES ($1, $2, 'processing')
     RETURNING id`,
    [req.user!.id, uploadMonth]
  );
  const uploadId = uploadRows[0].id;

  try {
    const mlcBuffer = files.file_mlc[0].buffer;
    const cdeBuffer = files.file_cde[0].buffer;
    const gapBuffer = files.file_gap[0].buffer;

    // Parse all three files
    const mlcData = parseMlc(mlcBuffer);
    const cdeData = parseCde(cdeBuffer);
    const gapData = parseGap(gapBuffer);

    // Upsert organizations from MLC (primary source)
    let orgMap = await upsertOrganizations(mlcData.orgs);

    // Also upsert orgs from CDE (may have additional orgs) + set engagement level
    orgMap = await upsertOrganizationsFromCde(cdeData, orgMap);

    // For gap orgs not in orgMap yet
    for (const gapRow of gapData) {
      if (!orgMap.has(gapRow.orgId)) {
        const existing = await queryOne<{ id: number; org_id_jd: string }>(
          'SELECT id, org_id_jd FROM organizations WHERE org_id_jd = $1',
          [gapRow.orgId]
        );
        if (existing) {
          orgMap.set(gapRow.orgId, existing.id);
        }
      }
    }

    // Upsert machines
    const machinesCount = await upsertMachines(mlcData.machines, orgMap, uploadMonth);

    // Upsert customer health
    await upsertCustomerHealth(cdeData, orgMap, uploadMonth);

    // Upsert hectares gap
    await upsertHectaresGap(gapData, orgMap, uploadMonth);

    // Upload files to S3
    const month = reference_month.substring(0, 7);
    const [mlcPath, cdePath, gapPath] = await Promise.all([
      uploadToS3(mlcBuffer, `uploads/${month}/mlc-ultima-conexao.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      uploadToS3(cdeBuffer, `uploads/${month}/cde-saude-cliente.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
      uploadToS3(gapBuffer, `uploads/${month}/gap-comportamento.xlsx`, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ]);

    // Update upload record
    await query(
      `UPDATE excel_uploads
       SET status = 'done',
           file_mlc_path = $2,
           file_cde_path = $3,
           file_gap_path = $4,
           machines_processed = $5,
           orgs_processed = $6,
           processed_at = NOW()
       WHERE id = $1`,
      [uploadId, mlcPath, cdePath, gapPath, machinesCount, orgMap.size]
    );

    res.json({
      upload_id: uploadId,
      machines_processed: machinesCount,
      orgs_processed: orgMap.size,
      status: 'done',
    });
  } catch (err) {
    await query(
      `UPDATE excel_uploads SET status = 'error' WHERE id = $1`,
      [uploadId]
    );
    console.error('Upload processing error:', err);
    res.status(500).json({ error: 'Failed to process spreadsheets', upload_id: uploadId });
  }
});

router.get('/history', async (_req: Request, res: Response): Promise<void> => {
  const rows = await query(
    `SELECT eu.*, t.name AS uploaded_by_name
     FROM excel_uploads eu
     LEFT JOIN technicians t ON t.id = eu.uploaded_by
     ORDER BY eu.processed_at DESC
     LIMIT 50`
  );
  res.json(rows);
});

export default router;
