import { Router } from 'express';
import multer from 'multer';
import { UploadController } from './upload.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { requireRole } from '../../middlewares/rbac.middleware';
import { Role } from '@prisma/client';
import { validate } from './validate.middleware';
import { uploadThumbnailSchema, uploadAvatarSchema, uploadPdfSchema } from './upload.schema';
import { AppError } from '../../utils/app-error';
import { UPLOAD_LIMITS } from '../../config/upload-limits.config';
import { assetFramingGuard } from '../../middlewares/asset-security.middleware';

const router = Router();
const controller = new UploadController();

const fileFilter = (allowedMimes: string[]) => (req: any, file: Express.Multer.File, cb: any) => {
    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new AppError('Invalid file type', 400), false);
    }
};

const uploadImage = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_LIMITS.IMAGE }, // POLICY: 5MB centralized
    fileFilter: fileFilter(['image/jpeg', 'image/jpg', 'image/png', 'image/webp'])
});

const uploadPdf = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: UPLOAD_LIMITS.PDF }, // POLICY: 25MB centralized
    fileFilter: fileFilter([
        'application/pdf', 
        'application/vnd.openxmlformats-officedocument.presentationml.presentation', // pptx
        'application/vnd.ms-powerpoint', // ppt
        'application/msword', // doc
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
        'text/plain' // txt
    ])
});

// Thumbnails
router.post('/courses/:courseId/thumbnail',
    authMiddleware,
    requireRole('ADMIN'),
    validate(uploadThumbnailSchema),
    uploadImage.single('file'),
    controller.uploadThumbnail
);

// Avatar
router.post('/users/me/avatar',
    authMiddleware,
    validate(uploadAvatarSchema),
    uploadImage.single('file'),
    controller.uploadAvatar
);

// Document Rendering Ingest (Phase 10)
router.post('/lessons/:lessonId/document',
    authMiddleware,
    requireRole('ADMIN'),
    validate(uploadPdfSchema),
    uploadPdf.single('file'),
    controller.uploadPdf
);

// Rate Limiter Import
import { publicRateLimiter } from '../../middlewares/rate-limit.middleware';

// Rendered Page Access (Phase 10)
router.get('/lessons/:lessonId/pages/:pageNumber',
    authMiddleware,
    requireRole(Role.STUDENT, 'ADMIN'),
    publicRateLimiter,
    // assetFramingGuard removed: Pages are images, no need for frame-ancestors. 
    // The viewer is an img tag, not an iframe.
    controller.renderPage
);

// Metadata (Phase 10 Viewer)
router.get('/lessons/assets/:assetId/document/metadata',
    authMiddleware,
    requireRole(Role.STUDENT, 'ADMIN'),
    controller.getMetadata
);

// Secure PDF Stream (Phase 10-B)
router.get('/lessons/assets/:assetId/document/stream',
    authMiddleware,
    requireRole(Role.STUDENT, 'ADMIN'),
    // publicRateLimiter, // Optional: might need stricter limiting? Standard is fine.
    controller.securePdf
);

// Video Upload Init
router.post('/video/init',
    authMiddleware,
    requireRole('ADMIN'),
    controller.initVideoUpload
);

// Generic Upload
router.post('/upload',
    authMiddleware,
    uploadImage.single('file'),
    controller.uploadFile
);

export default router;
