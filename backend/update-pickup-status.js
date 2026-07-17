const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function updatePickupStatus() {
  try {
    console.log('Updating existing records to new enum values...');

    // Update LaundryRequest records
    const orders = await prisma.laundryRequest.findMany({
      where: {
        pickupStatus: { in: ['pending', 'assigned', 'accepted', 'rejected', 'in_transit'] },
      },
    });

    console.log(`Found ${orders.length} orders to update`);

    for (const order of orders) {
      let newStatus = 'waiting_for_rider';
      
      // Map old statuses to new ones
      if (order.pickupStatus === 'pending' || order.pickupStatus === 'assigned') {
        newStatus = 'waiting_for_rider';
      } else if (order.pickupStatus === 'accepted') {
        newStatus = 'rider_assigned';
      } else if (order.pickupStatus === 'picked_up') {
        newStatus = 'picked_up';
      } else if (order.pickupStatus === 'delivered_to_laundry') {
        newStatus = 'delivered_to_laundry';
      } else if (order.pickupStatus === 'cancelled') {
        newStatus = 'cancelled';
      }

      // Use raw SQL to update since Prisma client might not accept old enum values
      await prisma.$executeRaw`
        UPDATE laundry_requests 
        SET pickup_status = ${newStatus}::text::"PickupStatus"
        WHERE id = ${order.id}
      `;
    }

    // Update RiderAssignment records
    const assignments = await prisma.riderAssignment.findMany({
      where: {
        status: { in: ['pending', 'assigned', 'accepted', 'rejected', 'in_transit'] },
      },
    });

    console.log(`Found ${assignments.length} assignments to update`);

    for (const assignment of assignments) {
      let newStatus = 'rider_assigned';
      
      if (assignment.status === 'assigned' || assignment.status === 'accepted') {
        newStatus = 'rider_assigned';
      } else if (assignment.status === 'picked_up') {
        newStatus = 'picked_up';
      } else if (assignment.status === 'delivered_to_laundry') {
        newStatus = 'delivered_to_laundry';
      } else if (assignment.status === 'cancelled') {
        newStatus = 'cancelled';
      }

      await prisma.$executeRaw`
        UPDATE rider_assignments 
        SET status = ${newStatus}::text::"PickupStatus"
        WHERE id = ${assignment.id}
      `;
    }

    console.log('Update complete!');
  } catch (error) {
    console.error('Error updating records:', error);
  } finally {
    await prisma.$disconnect();
  }
}

updatePickupStatus();
