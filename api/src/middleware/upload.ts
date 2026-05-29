import multer from 'multer';

const storage = multer.memoryStorage();

const fileFilter = (
  _req: Express.Request,
  file: Express.Multer.File,
  cb: multer.FileFilterCallback
) => {
  if (
    file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    file.mimetype === 'application/vnd.ms-excel' ||
    file.originalname.endsWith('.xlsx') ||
    file.originalname.endsWith('.xls')
  ) {
    cb(null, true);
  } else {
    cb(new Error('Only Excel files (.xlsx, .xls) are allowed'));
  }
};

export const uploadMiddleware = multer({
  storage,
  fileFilter,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB per file
}).fields([
  { name: 'file_mlc', maxCount: 1 },
  { name: 'file_cde', maxCount: 1 },
  { name: 'file_gap', maxCount: 1 },
]);
