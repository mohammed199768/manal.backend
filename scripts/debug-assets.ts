
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Running Asset Diagnostic...');

  // 1. Find Course "Python 3" if possible, or just recent files
  const course = await prisma.course.findFirst({
      where: { title: { contains: 'Python', mode: 'insensitive' } }
  });

  if (course) {
      console.log(`Found Course: ${course.title} (${course.id})`);
      
      // Get all parts/lessons
      const parts = await prisma.part.findMany({
          where: { lecture: { courseId: course.id } },
          include: { files: true }
      });

      console.log(`Found ${parts.length} lessons.`);

      for (const p of parts) {
          console.log(`Lesson: ${p.title} (${p.id})`);
          for (const f of p.files) {
              console.log(`  - File: ${f.title} (${f.id})`);
              console.log(`    Status: ${f.renderStatus}`);
              console.log(`    StorageKey: '${f.storageKey}'`);
              console.log(`    PageCount: ${f.pageCount}`);
              console.log(`    Secure: ${f.isSecure}`);
              console.log('---');
          }
      }
  } else {
      console.log('Course "Python 3" not found. Listing 10 most recent PartFiles...');
      const files = await prisma.partFile.findMany({
          take: 10,
          orderBy: { createdAt: 'desc' }
      });
      
      for (const f of files) {
          console.log(`  - File: ${f.title} (${f.id})`);
          console.log(`    Status: ${f.renderStatus}`);
          console.log(`    StorageKey: '${f.storageKey}'`);
          console.log(`    PageCount: ${f.pageCount}`);
          console.log('---');
      }
  }

}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
