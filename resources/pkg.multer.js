import multer from 'multer';
import fs from 'fs';
import path from 'path';

// Ensure Uploads/kg directory exists
export const uploadDir = path.join('uploads', 'pkg');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname}`),
});

export const pkgUpload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid image format. Use JPEG, PNG, or WEBP'), false);
    }
  },
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});