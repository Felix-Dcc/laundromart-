const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addColumn() {
  try {
    console.log('Adding assignedRiderId column...\n');

    await prisma.$executeRawUnsafe(`
      ALTER TABLE laundry_requests 
      ADD COLUMN IF NOT EXISTS assigned_rider_id INTEGER 
      REFERENCES users(id) ON DELETE SET NULL;
    `);

    await prisma.$executeRawUnsafe(`
      CREATE INDEX IF NOT EXISTS idx_laundry_requests_assigned_rider_id 
      ON laundry_requests(assigned_rider_id);
    `);

    console.log('✅ Column added successfully!');
  } catch (error) {
    if (error.message.includes('already exists')) {
      console.log('⚠ Column already exists');
    } else {
      console.error('❌ Error:', error.message);
      throw error;
    }
  } finally {
    await prisma.$disconnect();
  }
}

addColumn();
