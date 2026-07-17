const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkDB() {
  try {
    console.log('=== DATABASE STATE CHECK ===\n');

    // Check recent orders
    const orders = await prisma.laundryRequest.findMany({
      select: {
        id: true,
        requestNumber: true,
        pickupStatus: true,
        assignedRiderId: true,
        pickupLatitude: true,
        pickupLongitude: true,
        status: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    console.log('Recent Orders:');
    console.log(JSON.stringify(orders, null, 2));
    console.log('\n');

    // Count by pickupStatus
    const statusCounts = await prisma.laundryRequest.groupBy({
      by: ['pickupStatus'],
      _count: { id: true },
    });

    console.log('Orders by pickupStatus:');
    console.log(JSON.stringify(statusCounts, null, 2));
    console.log('\n');

    // Check waiting_for_rider orders
    const waitingOrders = await prisma.laundryRequest.findMany({
      where: {
        pickupStatus: 'waiting_for_rider',
        assignedRiderId: null,
      },
      select: {
        id: true,
        requestNumber: true,
        pickupStatus: true,
        assignedRiderId: true,
        pickupLatitude: true,
        pickupLongitude: true,
        status: true,
      },
    });

    console.log('Orders waiting_for_rider (assignedRiderId = null):');
    console.log(JSON.stringify(waitingOrders, null, 2));
    console.log('\n');

    // Check riders
    const riders = await prisma.user.findMany({
      where: { userType: 'rider' },
      select: {
        id: true,
        email: true,
        riderStatus: true,
        latitude: true,
        longitude: true,
      },
    });

    console.log('Riders:');
    console.log(JSON.stringify(riders, null, 2));
    console.log('\n');

  } catch (error) {
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
  } finally {
    await prisma.$disconnect();
  }
}

checkDB();
