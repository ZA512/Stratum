import { PrismaClient } from '@prisma/client';
import { buildPrismaClientOptions } from '../src/prisma/prisma.utils';

const prisma = new PrismaClient(buildPrismaClientOptions());

async function main() {
  const user = await prisma.user.findUnique({
    where: { id: 'cmgxsaxj90000jb8ke5wf0c15' },
    select: { email: true, displayName: true }
  });
  
  console.log('Board owner:', user?.email, `(${user?.displayName})`);
}

main()
  .finally(() => prisma.$disconnect());
