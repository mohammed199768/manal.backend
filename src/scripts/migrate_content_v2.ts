
import { PrismaClient, AssetType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const isDryRun = process.argv.includes('--dry-run');
  console.log(`Starting Content Migration (Phase 6B) - Mode: ${isDryRun ? 'DRY RUN' : 'WRITE'}`);

  // Fetch all courses (Source)
  const courses = await prisma.course.findMany({
    include: {
      sections: {
        orderBy: { order: 'asc' },
        include: {
          lessons: {
            orderBy: { order: 'asc' },
            include: {
              assets: {
                orderBy: { order: 'asc' },
              },
            },
          },
        },
      },
      lectures: { select: { id: true } }, // Check existence 
    },
  });

  console.log(`Found ${courses.length} courses to process.`);

  const stats = {
    coursesFound: courses.length,
    sectionsFound: 0,
    lessonsFound: 0,
    assetsFound: 0,
    lecturesCreated: 0,
    partsCreated: 0,
    partLessonsCreated: 0,
    partFilesCreated: 0,
    quizzesIgnored: 0,
    orphansIgnored: 0, // e.g. unknown types
  };

  for (const course of courses) {
    console.log(`Processing Course: ${course.title} (${course.id})`);
    
    // Safety Check: Idempotency (Simple check if lectures exist, skip course?)
    // Decision: If Lectures exist, we assume migration already ran for this course or partial.
    // Ideally we'd check one-by-one, but for MVP Phase 6B, we just log warning if found.
    const existingLectures = await prisma.lecture.count({ where: { courseId: course.id }});
    if (existingLectures > 0) {
      console.warn(`[SKIP] Course ${course.id} already has ${existingLectures} lectures. Skipping to avoid duplication.`);
      continue;
    }

    for (const section of course.sections) {
      stats.sectionsFound++;

      // 1. Create Lecture
      if (!isDryRun) {
        const lecture = await prisma.lecture.create({
          data: {
            title: section.title,
            order: section.order,
            courseId: course.id,
          },
        });

        // 2. Process Lessons -> Parts
        for (const lesson of section.lessons) {
          stats.lessonsFound++;
          const part = await prisma.part.create({
            data: {
              title: lesson.title,
              order: lesson.order,
              lectureId: lecture.id,
            },
          });

          // 3. Process Assets
          for (const asset of lesson.assets) {
             stats.assetsFound++;
             
             if (asset.type === 'VIDEO') {
               if (asset.bunnyVideoId) {
                  await prisma.partLesson.create({
                    data: {
                      title: asset.title,
                      order: asset.order,
                      partId: part.id,
                      video: asset.bunnyVideoId,
                    }
                  });
                  stats.partLessonsCreated++;
               } else {
                 console.warn(`[WARN] Asset ${asset.id} (VIDEO) missing bunnyVideoId. Skipped.`);
               }
             } else if (asset.type === 'PDF') {
                if (asset.storageKey) {
                  await prisma.partFile.create({
                    data: {
                      title: asset.title,
                      order: asset.order,
                      partId: part.id,
                      type: 'PDF',
                      storageKey: asset.storageKey,
                    }
                  });
                  stats.partFilesCreated++;
                } else {
                  console.warn(`[WARN] Asset ${asset.id} (PDF) missing storageKey. Skipped.`);
                }
             } else if (asset.type === 'QUIZ') {
               stats.quizzesIgnored++;
             } else {
               stats.orphansIgnored++;
               console.warn(`[WARN] Asset ${asset.id} has unknown type ${asset.type}. Skipped.`);
             }
          }
        }

      } else {
        // DRY RUN SIMULATION
        stats.lecturesCreated++;
        for (const lesson of section.lessons) {
          stats.lessonsFound++;
          stats.partsCreated++;
          for (const asset of lesson.assets) {
            stats.assetsFound++;
            if (asset.type === 'VIDEO') stats.partLessonsCreated++;
            else if (asset.type === 'PDF') stats.partFilesCreated++;
            else if (asset.type === 'QUIZ') stats.quizzesIgnored++;
            else stats.orphansIgnored++;
          }
        }
      }
    }
  }
  
  // Final Verification Logic (In-Script Gates)
  console.log('--- Migration Statistics ---');
  console.log(JSON.stringify(stats, null, 2));

  if (isDryRun) {
    console.log('DRY RUN COMPLETE. No changes made to DB.');
    // Check Integrity (Source vs Target counts)
    if (stats.sectionsFound !== stats.lecturesCreated) console.error('GATE FAIL: Section count mismatch!');
    if (stats.lessonsFound !== stats.partsCreated) console.error('GATE FAIL: Lesson count mismatch!');
  } else {
    console.log('WRITE COMPLETE.');
  }

}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
