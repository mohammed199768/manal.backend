
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
    console.log('--- Phase 7C Preflight ---');

    // 0.2 Data Existence
    console.log('[0.2] Verifying New Tree Data...');
    const stats = {
        lectures: await prisma.lecture.count(),
        parts: await prisma.part.count(),
        partLessons: await prisma.partLesson.count(),
        partFiles: await prisma.partFile.count(),
        partProgress: await prisma.partProgress.count(),
        // Legacy
        sections: await prisma.section.count(),
        lessons: await prisma.lesson.count(),
        lessonProgress: await prisma.lessonProgress.count(),
    };
    console.table(stats);

    if (stats.parts === 0) {
        console.error('ERROR: No Parts found. New Tree is empty.');
        // Check if legacy has data
        if (stats.sections > 0) {
             console.log('Legacy Sections found. Need to run Content Migration (Phase 6).');
        } else {
             console.log('Legacy Sections ALSO empty. Database might be empty.');
        }
    }
    if (stats.partProgress === 0) {
        console.warn('WARNING: PartProgress is empty. Did 7P run?');
        // Not throwing because maybe it's a fresh DB, but warning is needed.
        // User claims 7P success, so this should be > 0 if there are users.
    }

    // 0.3 Backup (JSON Dump)
    console.log('[0.3] Executing JSON Backup of Legacy Tables...');
    const backupDir = path.join(__dirname, '../../backups');
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    // Backup Legacy
    const sections = await prisma.section.findMany();
    const lessons = await prisma.lesson.findMany({ include: { assets: true } });
    const lessonProgress = await prisma.lessonProgress.findMany();

    fs.writeFileSync(path.join(backupDir, `sections_${timestamp}.json`), JSON.stringify(sections, null, 2));
    fs.writeFileSync(path.join(backupDir, `lessons_${timestamp}.json`), JSON.stringify(lessons, null, 2));
    fs.writeFileSync(path.join(backupDir, `lesson_progress_${timestamp}.json`), JSON.stringify(lessonProgress, null, 2));

    console.log(`Backup saved to ${backupDir} (Timestamp: ${timestamp})`);
    console.log(`Included: ${sections.length} Sections, ${lessons.length} Lessons, ${lessonProgress.length} Progress records.`);
}

main()
    .catch(e => {
        console.error(e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
