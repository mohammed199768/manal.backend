import prisma from '../../config/prisma';
import { AppError } from '../../utils/app-error';
import { EnrollmentStatus } from '@prisma/client';
import { signBunnyStreamUrl } from '../../utils/bunny-stream-token';

export class StudentContentService {
    async getCourseContent(userId: string, courseId: string) {
        // Fetch course with BOTH old and new structures
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: {
                // Old Structure
                // Old Structure REMOVED (Phase 7A)
                // sections: { ... }
                // New Structure (Phase 6)
                lectures: {
                    orderBy: { order: 'asc' },
                    include: {
                        parts: {
                            orderBy: { order: 'asc' },
                            include: {
                                lessons: { orderBy: { order: 'asc' } }, // PartLesson (Video)
                                files: { orderBy: { order: 'asc' } },   // PartFile (PDF)
                            }
                        }
                    }
                }
            },
        });

        if (!course) {
            throw new AppError('Course not found', 404);
        }

        const [user, enrollment] = await Promise.all([
            prisma.user.findUnique({ where: { id: userId } }),
            prisma.enrollment.findUnique({
                where: { userId_courseId: { userId, courseId } },
            })
        ]);

        // FETCH LOCKS (Surgical)
        const locks = enrollment ? await prisma.enrollmentPartLock.findMany({
            where: { enrollmentId: enrollment.id, isLocked: true }
        }) : [];
        const lockedPartIds = new Set(locks.map(l => l.partId));

        const isInstructor = course.instructorId === userId;
        const isAdmin = user?.role === 'ADMIN' as any;

        // Enforce isPublished for non-instructor/admin
        if (!course.isPublished && !isInstructor && !isAdmin) {
            throw new AppError('Course not found', 404);
        }

        const allowPendingPlayback = process.env.ALLOW_PENDING_PLAYBACK === 'true';
        const isDevPending = allowPendingPlayback && enrollment?.status === EnrollmentStatus.PENDING;

        const isEnrolled = enrollment?.status === EnrollmentStatus.ACTIVE || course.isFree || isInstructor || isAdmin || isDevPending;

        // ---------------------------------------------------------
        // DUAL-PATH DECISION LOGIC (Phase 6C)
        // ---------------------------------------------------------
        let sectionsDTO: any[] = [];

        if (course.lectures && course.lectures.length > 0) {
            // PATH A: New Structure (Lecture -> Part -> PartLesson/PartFile)
            // Map to Old Structure Shape (Backward Compatibility)
            sectionsDTO = course.lectures.map(lecture => ({
                id: lecture.id,
                title: lecture.title,
                lessons: lecture.parts.map(part => {
                    const isPartLocked = lockedPartIds.has(part.id) && !isInstructor && !isAdmin;

                    // Combine PartLessons (Video) and PartFiles (PDF) into a single Asset array
                    // Normalize into "AssetDTO"
                    const videoAssets = part.lessons.map(pl => ({
                        id: pl.id, 
                        title: pl.title, 
                        type: 'VIDEO', 
                        isPreview: false, // Default for now, as not in PartLesson schema yet? Check.
                        order: pl.order
                    }));


                    const fileAssets = part.files.map(pf => ({
                        id: pf.id,
                        title: pf.displayName || pf.title, // Phase 10-IMPROVEMENT: Custom Display Name
                        type: 'PDF',
                        isPreview: false, // Default
                        order: pf.order
                    }));

                    // Sort combined assets by order (Interleaved)
                    const assets = [...videoAssets, ...fileAssets].sort((a, b) => a.order - b.order);

                    const lessonsAssets = assets.map(asset => ({
                        ...asset,
                        // LOCKED if not enrolled OR if explicitly locked for this student
                        isLocked: (!isEnrolled && !asset.isPreview) || isPartLocked,
                    }));

                    // Metadata Leak Prevention
                    const filteredAssets = (isEnrolled || course.isFree)
                        ? lessonsAssets
                        : lessonsAssets.filter(a => a.isPreview);

                    return {
                        id: part.id,
                        title: part.title,
                        // UX: If part is locked, show it as locked content
                        hasLockedContent: (!isEnrolled && assets.some(a => !a.isPreview)) || isPartLocked,
                        isLockedForStudent: isPartLocked, // Explicit Flag for UI
                        assets: filteredAssets,
                    };
                })
            }));

        } else {
            // PATH B: Legacy Fallback REMOVED (Phase 7A)
            console.warn(`[Phase 7A] No lectures found for course ${courseId}. Legacy fallback disabled.`);
            sectionsDTO = [];
        }

        return {
            id: course.id,
            title: course.title,
            content: sectionsDTO,
        };
    }

    async getAssetPlayback(userId: string, assetId: string) {
        // Polymorphic Lookup: Try New Tables first, then Old.
        // Needs to resolve entire chain to Course for Gating check.
        
        // 1. Try PartLesson (Video)
        const partLesson = await prisma.partLesson.findUnique({
            where: { id: assetId },
            include: { part: { include: { lecture: { include: { course: true } } } } }
        });

        if (partLesson) {
            return this.verifyAndGeneratePlayback(userId, partLesson, partLesson.part.lecture.course, 'VIDEO', partLesson.video, false, partLesson.partId);
        }

        // 2. Try PartFile (PDF)
        const partFile = await prisma.partFile.findUnique({
            where: { id: assetId },
            include: { part: { include: { lecture: { include: { course: true } } } } }
        });

        if (partFile) {
            // Note: Token generation for PDF isn't stream-based, just return type metadata or similar.
            // But legacy getAssetPlayback actually did token gen if video.
            return this.verifyAndGeneratePlayback(userId, partFile, partFile.part.lecture.course, 'PDF', undefined, false, partFile.partId);
        }

        // 3. Fallback: Legacy LessonAsset REMOVED (Phase 7A)
        throw new AppError('Asset not found', 404);
    }

    // Consolidated Gating + Token Logic
    private async verifyAndGeneratePlayback(
        userId: string, 
        assetEntity: any, 
        course: any, 
        type: string,
        bunnyVideoId?: string, 
        isPreview: boolean = false,
        partId?: string
    ) {
        const enrollment = await prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId: course.id } },
        });

        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppError('User not found', 404);

        const isInstructor = course.instructorId === userId;
        const isAdmin = user?.role === 'ADMIN' as any;

        if (!course.isPublished && !isInstructor && !isAdmin) {
            throw new AppError('Course not found', 404);
        }

        const allowPendingPlayback = process.env.ALLOW_PENDING_PLAYBACK === 'true';
        const isDevPending = allowPendingPlayback && enrollment?.status === EnrollmentStatus.PENDING;

        const isEnrolled = enrollment?.status === EnrollmentStatus.ACTIVE || course.isFree || isInstructor || isAdmin || isDevPending;

        // LOCK CHECK
        if (partId && enrollment && !isInstructor && !isAdmin) {
            const lock = await prisma.enrollmentPartLock.findUnique({
                where: { enrollmentId_partId: { enrollmentId: enrollment.id, partId } }
            });
            if (lock && lock.isLocked) {
                 throw new AppError('This content is currently locked by the administrator.', 403);
            }
        }

        const hasAccess =
            isPreview ||
            isEnrolled;

        if (!hasAccess) {
             console.warn(`[Playback Access Denied] User: ${userId}, Asset: ${assetEntity.id}, Role: ${user.role}`);
             throw new AppError('Access denied: Active enrollment required', 403);
        }

        // Normalize info for token generation
        const assetInfo = {
            id: assetEntity.id,
            type: type,
            bunnyVideoId: bunnyVideoId
        };

        return this.generatePlaybackInfo(user, assetInfo);
    }


    async getAssetRefresh(userId: string, assetId: string) {
        // Same polymorphic lookup logic
        let assetData: { entity: any, course: any, type: string, videoId?: string, isPreview: boolean } | null = null;

        // 1. PartLesson
        const partLesson = await prisma.partLesson.findUnique({
            where: { id: assetId },
            include: { part: { include: { lecture: { include: { course: true } } } } }
        });
        if (partLesson) assetData = { entity: partLesson, course: partLesson.part.lecture.course, type: 'VIDEO', videoId: partLesson.video, isPreview: false };

        // 2. PartFile
        if (!assetData) {
            const partFile = await prisma.partFile.findUnique({
                where: { id: assetId },
                include: { part: { include: { lecture: { include: { course: true } } } } }
            });
            if (partFile) assetData = { entity: partFile, course: partFile.part.lecture.course, type: 'PDF', isPreview: false };
        }

        // 3. Legacy REMOVED (Phase 7A)

        if (!assetData) throw new AppError('Asset not found', 404);

        // Code Reuse can be improved, but copying Gating for safety (Contract #5 strictness)
        const { course, isPreview } = assetData;
        const enrollment = await prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId: course.id } },
        });
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (!user) throw new AppError('User not found', 404);
        
        const isInstructor = course.instructorId === userId;
        const isAdmin = user?.role === 'ADMIN' as any;

        if (!course.isPublished && !isInstructor && !isAdmin) throw new AppError('Course not found', 404);

        const allowPendingPlayback = process.env.ALLOW_PENDING_PLAYBACK === 'true';
        const isDevPending = allowPendingPlayback && enrollment?.status === EnrollmentStatus.PENDING;

         const hasAccess =
            isPreview ||
            course.isFree ||
            enrollment?.status === EnrollmentStatus.ACTIVE ||
            isInstructor ||
            isDevPending;

        if (!hasAccess) throw new AppError('Access denied', 403);

        const assetInfo = {
            id: assetId,
            type: assetData.type,
            bunnyVideoId: assetData.videoId
        };
        
        const playback = await this.generatePlaybackInfo(user, assetInfo);
        return {
            embedUrl: playback.embedUrl,
            token: playback.token,
            expires: playback.expires
        };
    }

    private async generatePlaybackInfo(user: any, asset: any) {
        let embedUrl: string | null = null;
        let tokenData: { token: string; expires: number } | null = null;

        if (asset.type === 'VIDEO' && asset.bunnyVideoId) {
            const securityKey = process.env.BUNNY_STREAM_TOKEN_KEY;
            const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID;
            const ttl = Number(process.env.BUNNY_TOKEN_TTL_SECONDS ?? 300);

            if (securityKey && libraryId) {
                const result = signBunnyStreamUrl({
                    videoId: asset.bunnyVideoId,
                    securityKey,
                    libraryId,
                    expiresInSeconds: ttl
                });
                embedUrl = result.embedUrl;
                tokenData = { token: result.token, expires: result.expires };
            } else {
                console.warn('Bunny Stream not configured, skipping token generation');
            }
        }

        return {
            type: asset.type,
            embedUrl,
            token: tokenData?.token,
            expires: tokenData?.expires,
            watermark: {
                userId: user.id,
                emailMasked: this.maskEmail(user.email),
                email: this.maskEmail(user.email), // Compatible key but masked
            }
        };
    }

    private maskEmail(email: string): string {
        const [user, domain] = email.split('@');
        if (!user || !domain) return '***@***.***';
        return `${user[0]}***@${domain}`;
    }
}
