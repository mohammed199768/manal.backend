
import { StudentContentService } from '../modules/courses/student-content.service';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const service = new StudentContentService();

async function main() {
  console.log('--- Phase 6C Verification: Read Path Switch ---');

  // 1. Find a Course
  const course = await prisma.course.findFirst({
      include: { lectures: true, sections: true }
  });

  if (!course) {
      console.warn('No courses found. Skipping verification.');
      return;
  }

  // 2. Find a User (Instructor or Student)
  const user = await prisma.user.findFirst();
  if (!user) {
      console.warn('No users found. Skipping verification.');
      return;
  }

  console.log(`Testing with Course: ${course.id} (${course.title})`);
  console.log(`- Lectures (New): ${course.lectures.length}`);
  console.log(`- Sections (Old): ${course.sections.length}`);

  // 3. Call getCourseContent
  try {
      const content = await service.getCourseContent(user.id, course.id);
      console.log('getCourseContent Result:');
      console.log(`- ID: ${content.id}`);
      console.log(`- Content Items (Sections/Lectures): ${content.content.length}`);
      
      if (content.content.length > 0) {
          const firstItem = content.content[0];
          console.log(`- First Item Title: ${firstItem.title}`);
          console.log(`- First Item Lessons: ${firstItem.lessons.length}`);
      }

      // Assertion: If lectures exist, content length should match lectures length
      if (course.lectures.length > 0) {
          if (content.content.length === course.lectures.length) {
                console.log('PASS: Returned content matches Lecture count (New Path Active).');
          } else {
                console.error('FAIL: Content count mismatch with Lectures.');
          }
      } else {
          if (content.content.length === course.sections.length) {
                console.log('PASS: Returned content matches Section count (Fallback Active).');
          } else {
                console.error('FAIL: Content count mismatch with Sections.');
          }
      }

  } catch (error) {
      console.error('Error calling getCourseContent:', error);
  }

  console.log('--- Verification Complete ---');
}

main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
