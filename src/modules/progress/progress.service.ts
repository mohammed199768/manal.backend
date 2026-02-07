import prisma from '../../config/prisma';
import { AppError } from '../../utils/app-error';

import { EnrollmentStatus } from '@prisma/client';

export class ProgressService {
    // Note: lessonId arg is actually partId in the new structure (Frontend sends Part.id)
    async updateLessonProgress(userId: string, partId: string, lastPositionSeconds: number, isVideoCompleted?: boolean) {
        // 1. Fetch Part (New Structure) instead of Lesson
        const part = await prisma.part.findUnique({
            where: { id: partId },
            include: {
                lecture: {
                    select: { courseId: true }
                },
                lessons: true, // Videos
                files: true    // PDFs etc
            },
        });

        if (!part) {
            throw new AppError('Lesson (Part) not found', 404);
        }

        const courseId = part.lecture.courseId;

        // 2. Validate ACTIVE Enrollment status
        const enrollment = await prisma.enrollment.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });

        if (!enrollment || enrollment.status !== EnrollmentStatus.ACTIVE) {
            throw new AppError('Active enrollment required to track progress', 403);
        }

        // 3. Identify current progress
        const existingProgress = await prisma.partProgress.findUnique({
            where: { userId_partId: { userId, partId } },
        });

        // 4. Determine completion components
        // In new structure, "Part" usually contains 1 Video (PartLesson) or files.
        // If it has a video, video completion is required.
        const hasVideo = part.lessons.length > 0;
        
        // Quizzes are not yet integrated into Part structure in V2 (Phase 6), 
        // so we skip Quiz checks for now.

        const currentIsVideoCompleted = isVideoCompleted ?? (existingProgress as any)?.isVideoCompleted ?? false;

        const shouldBeCompleted = (!hasVideo || currentIsVideoCompleted);

        let completedAt: Date | null | undefined = existingProgress?.completedAt;
        if (shouldBeCompleted && !completedAt) {
            completedAt = new Date();
        }

        // 5. Update/Create Part Progress - Write Bounding (Path C)
        const now = new Date();
        const lastUpdated = existingProgress?.updatedAt ? new Date(existingProgress.updatedAt) : null;
        const deltaSeconds = lastUpdated ? (now.getTime() - lastUpdated.getTime()) / 1000 : Infinity;

        // Condition: Write only if state changed OR enough time passed (telemetry)
        // State changes: 
        // 1. isVideoCompleted changed from false to true (or vice versa? usually false->true)
        // 2. completedAt is newly set
        // 3. processing a new record (existingProgress is null)
        const isNewRecord = !existingProgress;
        const isStateChanged = isVideoCompleted !== undefined && isVideoCompleted !== (existingProgress as any)?.isVideoCompleted;
        const isCompletionEvent = !!(completedAt && !existingProgress?.completedAt);
        
        // If it's just a position update, throttle it to every 10 seconds
        const shouldWritePartProgress = isNewRecord || isStateChanged || isCompletionEvent || deltaSeconds >= 10;

        let progress;
        if (shouldWritePartProgress) {
            progress = await prisma.partProgress.upsert({
                where: { userId_partId: { userId, partId } },
                update: {
                    lastPositionSeconds,
                    isVideoCompleted: currentIsVideoCompleted,
                    ...(completedAt && { completedAt }),
                    updatedAt: now,
                } as any,
                create: {
                    userId,
                    partId,
                    lastPositionSeconds,
                    isVideoCompleted: currentIsVideoCompleted,
                    completedAt: completedAt || null,
                } as any,
            });
        } else {
            // Return existing progress if skipped (to satisfy return type)
            progress = existingProgress;
        }

        // 6. Update Course High-level Progress (Resume position)
        // We now write to lastPartId. lastLessonId is left for legacy/audit.
        // Optimization: Only write if lastPartId actually changes or it's a fresh access
        const existingCourseProgress = await prisma.courseProgress.findUnique({
             where: { userId_courseId: { userId, courseId } } 
        });

        const shouldWriteCourseProgress = !existingCourseProgress || existingCourseProgress.lastPartId !== partId;

        if (shouldWriteCourseProgress) {
            await prisma.courseProgress.upsert({
                where: { userId_courseId: { userId, courseId } },
                update: {
                    lastPartId: partId,
                    updatedAt: now,
                },
                create: {
                    userId,
                    courseId,
                    lastPartId: partId,
                }
            });
        }

        return progress;
    }

    async getCourseProgress(userId: string, courseId: string) {
        // Fetch all lectures and parts for this course to calculate progress
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: {
                lectures: {
                    include: {
                        parts: {
                            include: {
                                partProgresses: {
                                    where: { userId }
                                }
                            }
                        }
                    }
                }
            }
        });

        if (!course) {
            throw new AppError('Course not found', 404);
        }

        let totalLessons = 0;
        let completedLessons = 0;
        const completedLessonIds: string[] = [];

        course.lectures.forEach(l => {
            l.parts.forEach(p => {
                totalLessons++;
                if (p.partProgresses.length > 0 && p.partProgresses[0].completedAt) {
                    completedLessons++;
                    completedLessonIds.push(p.id);
                }
            });
        });

        const percentage = totalLessons > 0
            ? Math.round((completedLessons / totalLessons) * 100)
            : 0;

        const lastProgress = await prisma.courseProgress.findUnique({
            where: { userId_courseId: { userId, courseId } },
        });

        return {
            userId,
            courseId,
            percentage,
            completedLessonIds,
            totalLessons,
            lastPartId: lastProgress?.lastPartId || null,
            updatedAt: lastProgress?.updatedAt || new Date()
        };
    }
}
