
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Phase 6B Verification Gates ---');

  // Gate 1: Structural Integrity (Counts)
  const sections = await prisma.section.count();
  const lectures = await prisma.lecture.count();
  console.log(`Gate 1 (Sections vs Lectures): ${sections} vs ${lectures}`);
  if (sections !== lectures) throw new Error('Gate 1 Failed: Count mismatch');

  const lessons = await prisma.lesson.count();
  const parts = await prisma.part.count();
  console.log(`Gate 1 (Lessons vs Parts): ${lessons} vs ${parts}`);
  if (lessons !== parts) throw new Error('Gate 1 Failed: Count mismatch');

  // Gate 2: PDF Integrity
  const pdfAssets = await prisma.lessonAsset.count({ where: { type: 'PDF' }});
  const partFiles = await prisma.partFile.count();
  console.log(`Gate 2 (PDF Assets vs PartFiles): ${pdfAssets} vs ${partFiles}`);
  if (pdfAssets !== partFiles) throw new Error('Gate 2 Failed: Count mismatch');

  // Gate 3: Video Integrity
  const videoAssets = await prisma.lessonAsset.count({ where: { type: 'VIDEO' }});
  const partLessons = await prisma.partLesson.count();
  console.log(`Gate 3 (Video Assets vs PartLessons): ${videoAssets} vs ${partLessons}`);
  // Note: We used partLesson for video, PartFile for PDF.
  if (videoAssets !== partLessons) throw new Error('Gate 3 Failed: Count mismatch');

  // Gate 4: No Gating Regression (Code Check Only - Manual verification required for runtime)
  console.log('Gate 4: Runtime Gating Check required by Admin/Student manual login.');

  console.log('--- ALL AUTOMATED GATES PASSED ---');
}

main()
  .catch(e => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
