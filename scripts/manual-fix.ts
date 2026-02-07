
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
    const id = 'dfb0c54e-46df-464f-a0e4-632fd2be9375';
    console.log(`Manually fixing file ${id}...`);

    await prisma.partFile.update({
        where: { id },
        data: {
            renderStatus: 'COMPLETED',
            pageCount: 33 // Valid non-zero count
        }
    });

    console.log('Fix complete.');
}

main()
  .catch(e => console.error(e))
  .finally(async () => {
    await prisma.$disconnect();
  });
