import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const sampleProducts = [
  {
    id: 1,
    name: 'Mechanical Keyboard',
    description: 'Hot-swappable tactile mechanical keyboard',
    price: 12999,
    stock: 50,
  },
  {
    id: 2,
    name: 'Wireless Mouse',
    description: 'Ergonomic lightweight optical mouse',
    price: 7999,
    stock: 120,
  },
  {
    id: 3,
    name: '27-inch 4K Monitor',
    description: 'IPS panel with 144Hz refresh rate',
    price: 34999,
    stock: 15,
  },
  {
    id: 4,
    name: 'USB-C Dock',
    description: 'Multi-port dock with HDMI, Ethernet, and USB-C PD',
    price: 8999,
    stock: 35,
  },
  {
    id: 5,
    name: 'Noise Cancelling Headphones',
    description: 'Over-ear wireless headphones with active noise cancellation',
    price: 19999,
    stock: 25,
  },
];

async function main() {
  console.log('Starting product seed...');

  for (const product of sampleProducts) {
    await prisma.product.upsert({
      where: { id: product.id },
      update: product,
      create: product,
    });
  }

  await prisma.$queryRaw`
    SELECT setval(pg_get_serial_sequence('products', 'id'), (SELECT MAX(id) FROM products), true)
  `;

  console.log(`Seeded ${sampleProducts.length} sample products.`);
}

main()
  .catch((e) => {
    console.error('Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
