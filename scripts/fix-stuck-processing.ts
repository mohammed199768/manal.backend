
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Running Fixed-Stuck-Processing Script...');

  // Config: Threshold (e.g., 5 minutes ago)
  const threshold = new Date(Date.now() - 5 * 60 * 1000); 

  const stuckFiles = await prisma.partFile.findMany({
    where: {
      renderStatus: 'PROCESSING',
      updatedAt: {
        lt: threshold
      }
    }
  });

  console.log(`Found ${stuckFiles.length} stuck files.`);

  for (const file of stuckFiles) {
    console.log(`Resetting file ${file.id} (${file.title}) to FAILED...`);
    await prisma.partFile.update({
      where: { id: file.id },
      data: { renderStatus: 'FAILED' }
    });
  }

  console.log('Cleanup complete.');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
