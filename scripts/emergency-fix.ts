
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Running Emergency StorageKey Fix...');

  const prefixes = ['44d41da1', '43ff8551', '66faecee']; // IDs mentioned by user
  
  // Find files with these ID prefixes (or just exact if they provided full)
  // Since we can't easily do startsWith on ID in all DBs or if it's uuid, 
  // we might need to fetch all pending/processing and filter in memory, or just try to match if they are truncated.
  // Assuming they are truncated UUIDs.
  
  const allFiles = await prisma.partFile.findMany({
      where: {
          OR: [
              { renderStatus: 'PROCESSING' },
              { renderStatus: 'COMPLETED', storageKey: '' },
              { renderStatus: 'FAILED' }
          ]
      }
  });

  const targets = allFiles.filter(f => prefixes.some(p => f.id.startsWith(p)));
  
  console.log(`Found ${targets.length} target files matching prefixes.`);

  for (const file of targets) {
      const properKey = `/secured/${file.id}.pdf`;
      console.log(`Fixing ${file.id} (${file.title})...`);
      console.log(`  -> Setting storageKey: ${properKey}`);
      console.log(`  -> Setting renderStatus: COMPLETED`);
      
      await prisma.partFile.update({
          where: { id: file.id },
          data: {
              renderStatus: 'COMPLETED',
              storageKey: properKey,
              pageCount: file.pageCount > 0 ? file.pageCount : 1, // Ensure non-zero
              isSecure: true
          }
      });
  }
  
  console.log('Emergency Fix Complete.');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
