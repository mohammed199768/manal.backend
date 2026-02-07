
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    console.log('Starting Phase 7P: Progress Migration...');
    
    // ==========================================
    // 1. Migrate LessonProgress -> PartProgress
    // ==========================================
    const allProgress = await prisma.lessonProgress.findMany({
        include: {
            lesson: {
                include: {
                    assets: true
                }
            }
        }
    });

    console.log(`Found ${allProgress.length} legacy progress records.`);

    const stats = {
        total: allProgress.length,
        migrated: 0,
        unmigrated: 0,
        videoMatches: 0,
        pdfMatches: 0,
        errors: 0
    };

    const unmigratedLog: any[] = [];

    for (const lp of allProgress) {
        try {
            const lesson = lp.lesson;
            if (!lesson) {
                console.warn(`[SKIP] Progress ${lp.id} has no attached lesson.`);
                stats.unmigrated++;
                continue;
            }

            let partId: string | null = null;
            let matchType = '';

            // Strategy 1: Video Match via bunnyVideoId
            const videoAsset = lesson.assets.find(a => a.type === 'VIDEO' && a.bunnyVideoId);
            if (videoAsset) {
                const partLesson = await prisma.partLesson.findFirst({
                    where: { video: videoAsset.bunnyVideoId! },
                    select: { partId: true }
                });
                if (partLesson) {
                    partId = partLesson.partId;
                    matchType = 'VIDEO';
                    stats.videoMatches++;
                }
            }

            // Strategy 2: PDF Match via storageKey
            if (!partId) {
                const pdfAsset = lesson.assets.find(a => a.type === 'PDF' && a.storageKey);
                if (pdfAsset) {
                    const partFile = await prisma.partFile.findFirst({
                        where: { storageKey: pdfAsset.storageKey! },
                        select: { partId: true }
                    });
                    if (partFile) {
                        partId = partFile.partId;
                        matchType = 'PDF';
                        stats.pdfMatches++;
                    }
                }
            }

            if (partId) {
                await prisma.partProgress.upsert({
                    where: { userId_partId: { userId: lp.userId, partId: partId } },
                    update: {}, // Already exists
                    create: {
                        userId: lp.userId,
                        partId: partId,
                        lastPositionSeconds: lp.lastPositionSeconds,
                        isVideoCompleted: lp.isVideoCompleted,
                        completedAt: lp.completedAt,
                        updatedAt: lp.updatedAt
                    }
                });
                stats.migrated++;
            } else {
                stats.unmigrated++;
                unmigratedLog.push({
                    progressId: lp.id,
                    lessonId: lesson.id,
                    lessonTitle: lesson.title,
                    userId: lp.userId,
                    reason: 'No matching PartLesson or PartFile found'
                });
            }

        } catch (e) {
            console.error(`Error migrating progress ${lp.id}:`, e);
            stats.errors++;
        }
    }

    // ==========================================
    // 2. Migrate CourseProgress (Resume Pointer)
    // ==========================================
    console.log('Starting CourseProgress Migration...');
    const allCourseProgress = await prisma.courseProgress.findMany({
        where: { lastLessonId: { not: null } }
    });
    
    let cpMigrated = 0;
    
    for (const cp of allCourseProgress) {
        try {
             if (!cp.lastLessonId) continue;
             
             const lesson = await prisma.lesson.findUnique({
                 where: { id: cp.lastLessonId },
                 include: { assets: true }
             });
             
             if (!lesson) continue;
             
             let paramsPartId: string | null = null;
             
             // Try Video
             const videoAsset = lesson.assets.find(a => a.type === 'VIDEO' && a.bunnyVideoId);
             if (videoAsset) {
                 const pl = await prisma.partLesson.findFirst({
                     where: { video: videoAsset.bunnyVideoId! },
                     select: { partId: true }
                 });
                 if (pl) paramsPartId = pl.partId;
             }
             
             // Try PDF
             if (!paramsPartId) {
                 const pdfAsset = lesson.assets.find(a => a.type === 'PDF' && a.storageKey);
                 if (pdfAsset) {
                     const pf = await prisma.partFile.findFirst({
                         where: { storageKey: pdfAsset.storageKey! },
                         select: { partId: true }
                     });
                     if (pf) paramsPartId = pf.partId;
                 }
             }
             
             if (paramsPartId) {
                 await prisma.courseProgress.update({
                     where: { id: cp.id },
                     data: { lastPartId: paramsPartId }
                 });
                 cpMigrated++;
             }
             
        } catch (e) {
            console.error(`Error migrating CourseProgress ${cp.id}:`, e);
            stats.errors++;
        }
    }
    
    console.log('--------------------------------------------------');
    console.log('Migration Complete.');
    console.log(JSON.stringify(stats, null, 2));
    console.log(`CourseProgress Migrated: ${cpMigrated} / ${allCourseProgress.length}`);

    if (unmigratedLog.length > 0) {
        console.log('--- Unmigrated Sample (First 5) ---');
        console.log(JSON.stringify(unmigratedLog.slice(0, 5), null, 2));
    }
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
