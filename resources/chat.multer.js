import multer from 'multer';
import path from 'path';
import fs from 'fs';

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/chat';
    // Create directory if it doesn't exist
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'chat-' + uniqueSuffix + path.extname(file.originalname));
  }
});

export const ChatUpload = multer({ 
  storage: storage,
  limits: { 
    fileSize: 50 * 1024 * 1024 // 50MB limit
  },
  fileFilter: function (req, file, cb) {
    // Accept common chat attachments by mime type first, then extension fallback.
    const allowedMimeTypes = new Set([
      // Images
      'image/jpeg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/avif',
      'image/bmp',
      'image/tiff',
      // Documents
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'application/rtf',
      // Audio
      'audio/mpeg',
      'audio/mp3',
      'audio/wav',
      'audio/ogg',
      'audio/webm',
      'audio/mp4',
      'audio/x-m4a',
      'audio/aac',
      // Video
      'video/mp4',
      'video/webm',
      'video/quicktime',
    ]);

    const allowedExtensions = /\.(jpg|jpeg|png|gif|webp|heic|heif|avif|bmp|tif|tiff|jfif|pdf|doc|docx|txt|rtf|mp3|wav|ogg|m4a|aac|webm|mp4|mov|m4v)$/i;
    const mimeType = String(file.mimetype || '').toLowerCase();
    const originalName = String(file.originalname || '');

    if (!allowedMimeTypes.has(mimeType) && !allowedExtensions.test(originalName)) {
      return cb(new Error('File type not allowed!'), false);
    }
    cb(null, true);
  }
});
