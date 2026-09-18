import "dotenv/config";

import { prisma } from "@/lib/core/db";

async function main() {
  await prisma.task.createMany({
    data: [{ title: "Configurar el proyecto" }, { title: "Construir la primera feature" }],
    skipDuplicates: true,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
