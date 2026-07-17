<?php
require_once '../config/config.php';
require_admin();

$request_id = intval($_GET['id'] ?? 0);

if (!$request_id) {
    $_SESSION['error_message'] = 'Invalid request ID.';
    header('Location: requests.php');
    exit();
}

try {
    // Get request details with user information
    $stmt = $pdo->prepare("
        SELECT lr.*, u.first_name, u.last_name, u.email, u.phone, u.address,
               lp.price_per_kg, lp.description as service_description
        FROM laundry_requests lr 
        JOIN users u ON lr.user_id = u.id
        LEFT JOIN laundry_pricing lp ON lr.laundry_type = lp.service_type 
        WHERE lr.id = ?
    ");
    $stmt->execute([$request_id]);
    $request = $stmt->fetch();
    
    if (!$request) {
        $_SESSION['error_message'] = 'Request not found.';
        header('Location: requests.php');
        exit();
    }
    
    // Get status history
    $stmt = $pdo->prepare("
        SELECT rsh.*, u.first_name, u.last_name, u.user_type
        FROM request_status_history rsh
        LEFT JOIN users u ON rsh.changed_by = u.id
        WHERE rsh.request_id = ?
        ORDER BY rsh.created_at ASC
    ");
    $stmt->execute([$request_id]);
    $status_history = $stmt->fetchAll();
    
} catch (PDOException $e) {
    error_log("Admin request details error: " . $e->getMessage());
    $_SESSION['error_message'] = 'Error loading request details.';
    header('Location: requests.php');
    exit();
}

$page_title = 'Request Details - ' . $request['request_number'];

// Define status progression
$status_steps = [
    'pending' => ['label' => 'Pending', 'icon' => 'clock', 'description' => 'Request submitted and waiting for confirmation'],
    'accepted' => ['label' => 'Accepted', 'icon' => 'check-circle', 'description' => 'Request accepted and scheduled for pickup'],
    'picked_up' => ['label' => 'Picked Up', 'icon' => 'truck', 'description' => 'Items collected from pickup location'],
    'in_process' => ['label' => 'In Process', 'icon' => 'gear', 'description' => 'Items being cleaned and processed'],
    'ready' => ['label' => 'Ready', 'icon' => 'check2-circle', 'description' => 'Items cleaned and ready for delivery'],
    'delivered' => ['label' => 'Delivered', 'icon' => 'house-check', 'description' => 'Items delivered successfully']
];

$current_status = $request['status'];
$current_step_index = array_search($current_status, array_keys($status_steps));

include '../includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <div>
        <h2>
            <i class="bi bi-file-text me-2"></i>Request Details
        </h2>
        <p class="text-muted mb-0">Request #<?php echo htmlspecialchars($request['request_number']); ?></p>
    </div>
    <div>
        <a href="requests.php" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-2"></i>Back to Requests
        </a>
        <?php if ($request['status'] !== 'delivered' && $request['status'] !== 'cancelled'): ?>
            <button type="button" class="btn btn-primary ms-2" 
                    data-bs-toggle="modal" 
                    data-bs-target="#statusModal"
                    data-request-id="<?php echo $request['id']; ?>"
                    data-request-number="<?php echo htmlspecialchars($request['request_number']); ?>"
                    data-current-status="<?php echo $request['status']; ?>">
                <i class="bi bi-arrow-up-circle me-2"></i>Update Status
            </button>
        <?php endif; ?>
    </div>
</div>

<div class="row g-4">
    <!-- Request Information -->
    <div class="col-lg-8">
        <!-- Customer Information -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-person me-2"></i>Customer Information
                </h5>
            </div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-md-6">
                        <h6 class="text-muted">Name</h6>
                        <p class="mb-3">
                            <a href="user-details.php?id=<?php echo $request['user_id']; ?>" class="text-decoration-none">
                                <?php echo htmlspecialchars($request['first_name'] . ' ' . $request['last_name']); ?>
                            </a>
                        </p>
                        
                        <h6 class="text-muted">Email</h6>
                        <p class="mb-3">
                            <a href="mailto:<?php echo htmlspecialchars($request['email']); ?>" class="text-decoration-none">
                                <?php echo htmlspecialchars($request['email']); ?>
                            </a>
                        </p>
                    </div>
                    <div class="col-md-6">
                        <h6 class="text-muted">Phone</h6>
                        <p class="mb-3">
                            <a href="tel:<?php echo htmlspecialchars($request['phone']); ?>" class="text-decoration-none">
                                <?php echo htmlspecialchars($request['phone']); ?>
                            </a>
                        </p>
                        
                        <h6 class="text-muted">Customer Address</h6>
                        <p class="mb-3"><?php echo nl2br(htmlspecialchars($request['address'])); ?></p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Status Timeline -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-clock-history me-2"></i>Request Status
                </h5>
            </div>
            <div class="card-body">
                <div class="status-timeline">
                    <?php foreach ($status_steps as $step_key => $step_info): ?>
                        <?php 
                        $step_index = array_search($step_key, array_keys($status_steps));
                        $is_completed = $step_index <= $current_step_index;
                        $is_current = $step_key === $current_status;
                        $is_cancelled = $request['status'] === 'cancelled';
                        ?>
                        <div class="status-step <?php echo $is_completed && !$is_cancelled ? 'completed' : ''; ?> <?php echo $is_current && !$is_cancelled ? 'active' : ''; ?>">
                            <div class="d-flex align-items-center">
                                <div class="me-3">
                                    <i class="bi bi-<?php echo $step_info['icon']; ?> fs-5"></i>
                                </div>
                                <div class="flex-grow-1">
                                    <h6 class="mb-1 <?php echo $is_current ? 'text-primary' : ''; ?>">
                                        <?php echo $step_info['label']; ?>
                                        <?php if ($is_current && !$is_cancelled): ?>
                                            <span class="badge bg-primary ms-2">Current</span>
                                        <?php endif; ?>
                                    </h6>
                                    <p class="text-muted mb-0 small"><?php echo $step_info['description']; ?></p>
                                </div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                    
                    <?php if ($request['status'] === 'cancelled'): ?>
                        <div class="status-step active">
                            <div class="d-flex align-items-center">
                                <div class="me-3">
                                    <i class="bi bi-x-circle fs-5 text-danger"></i>
                                </div>
                                <div class="flex-grow-1">
                                    <h6 class="mb-1 text-danger">
                                        Cancelled
                                        <span class="badge bg-danger ms-2">Current</span>
                                    </h6>
                                    <p class="text-muted mb-0 small">Request has been cancelled</p>
                                </div>
                            </div>
                        </div>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        
        <!-- Request Details -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-info-circle me-2"></i>Request Information
                </h5>
            </div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-md-6">
                        <h6 class="text-muted">Service Type</h6>
                        <p class="mb-3"><?php echo htmlspecialchars($request['laundry_type']); ?></p>
                        
                        <h6 class="text-muted">Weight</h6>
                        <p class="mb-3"><?php echo $request['weight_kg']; ?> kg</p>
                        
                        <h6 class="text-muted">Pickup Date & Time</h6>
                        <p class="mb-3">
                            <?php echo format_date($request['pickup_date']); ?> at 
                            <?php echo date('g:i A', strtotime($request['pickup_time'])); ?>
                        </p>
                    </div>
                    <div class="col-md-6">
                        <h6 class="text-muted">Total Amount</h6>
                        <p class="mb-3 fs-5 text-success fw-bold"><?php echo format_currency($request['total_amount']); ?></p>
                        
                        <h6 class="text-muted">Payment Status</h6>
                        <p class="mb-3">
                            <span class="badge <?php echo get_status_badge_class($request['payment_status']); ?>">
                                <?php echo ucfirst($request['payment_status']); ?>
                            </span>
                        </p>
                        
                        <h6 class="text-muted">Request Date</h6>
                        <p class="mb-3"><?php echo format_datetime($request['created_at']); ?></p>
                    </div>
                </div>
                
                <?php if (!empty($request['delivery_date'])): ?>
                    <div class="row g-4">
                        <div class="col-md-6">
                            <h6 class="text-muted">Delivery Date & Time</h6>
                            <p class="mb-0">
                                <?php echo format_date($request['delivery_date']); ?>
                                <?php if (!empty($request['delivery_time'])): ?>
                                    at <?php echo date('g:i A', strtotime($request['delivery_time'])); ?>
                                <?php endif; ?>
                            </p>
                        </div>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        
        <!-- Addresses -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-geo-alt me-2"></i>Service Addresses
                </h5>
            </div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-md-6">
                        <h6 class="text-muted">
                            <i class="bi bi-truck me-1"></i>Pickup Address
                        </h6>
                        <p class="mb-0"><?php echo nl2br(htmlspecialchars($request['pickup_address'])); ?></p>
                    </div>
                    <div class="col-md-6">
                        <h6 class="text-muted">
                            <i class="bi bi-house me-1"></i>Delivery Address
                        </h6>
                        <p class="mb-0"><?php echo nl2br(htmlspecialchars($request['delivery_address'])); ?></p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Special Instructions -->
        <?php if (!empty($request['special_instructions'])): ?>
            <div class="card mb-4">
                <div class="card-header">
                    <h5 class="mb-0">
                        <i class="bi bi-chat-text me-2"></i>Special Instructions
                    </h5>
                </div>
                <div class="card-body">
                    <p class="mb-0"><?php echo nl2br(htmlspecialchars($request['special_instructions'])); ?></p>
                </div>
            </div>
        <?php endif; ?>
        
        <!-- Admin Notes -->
        <?php if (!empty($request['admin_notes'])): ?>
            <div class="card mb-4">
                <div class="card-header">
                    <h5 class="mb-0">
                        <i class="bi bi-sticky me-2"></i>Admin Notes
                    </h5>
                </div>
                <div class="card-body">
                    <p class="mb-0"><?php echo nl2br(htmlspecialchars($request['admin_notes'])); ?></p>
                </div>
            </div>
        <?php endif; ?>
    </div>
    
    <!-- Sidebar -->
    <div class="col-lg-4">
        <!-- Quick Actions -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-lightning me-2"></i>Quick Actions
                </h5>
            </div>
            <div class="card-body">
                <div class="d-grid gap-2">
                    <button type="button" class="btn btn-outline-primary" onclick="printElement('request-details')">
                        <i class="bi bi-printer me-2"></i>Print Details
                    </button>
                    <a href="user-details.php?id=<?php echo $request['user_id']; ?>" class="btn btn-outline-info">
                        <i class="bi bi-person me-2"></i>View Customer
                    </a>
                    <a href="requests.php?user_id=<?php echo $request['user_id']; ?>" class="btn btn-outline-secondary">
                        <i class="bi bi-list me-2"></i>Customer's Requests
                    </a>
                </div>
            </div>
        </div>
        
        <!-- Status History -->
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-clock-history me-2"></i>Status History
                </h5>
            </div>
            <div class="card-body">
                <?php if (empty($status_history)): ?>
                    <p class="text-muted mb-0">No status updates yet.</p>
                <?php else: ?>
                    <div class="timeline">
                        <?php foreach (array_reverse($status_history) as $history): ?>
                            <div class="timeline-item mb-3">
                                <div class="d-flex">
                                    <div class="flex-shrink-0">
                                        <div class="timeline-marker bg-primary"></div>
                                    </div>
                                    <div class="flex-grow-1 ms-3">
                                        <h6 class="mb-1">
                                            <?php echo ucfirst(str_replace('_', ' ', $history['status'])); ?>
                                        </h6>
                                        <p class="text-muted mb-1 small">
                                            <?php echo format_datetime($history['created_at']); ?>
                                        </p>
                                        <?php if (!empty($history['notes'])): ?>
                                            <p class="mb-1 small"><?php echo htmlspecialchars($history['notes']); ?></p>
                                        <?php endif; ?>
                                        <small class="text-muted">
                                            by <?php echo htmlspecialchars($history['first_name'] . ' ' . $history['last_name']); ?>
                                            (<?php echo ucfirst($history['user_type']); ?>)
                                        </small>
                                    </div>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<!-- Status Update Modal -->
<div class="modal fade" id="statusModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title">Update Request Status</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form method="POST" action="requests.php">
                <div class="modal-body">
                    <input type="hidden" name="action" value="update_status">
                    <input type="hidden" name="request_id" id="modal_request_id">
                    
                    <div class="mb-3">
                        <label class="form-label">Request Number</label>
                        <input type="text" class="form-control" id="modal_request_number" readonly>
                    </div>
                    
                    <div class="mb-3">
                        <label for="new_status" class="form-label">New Status</label>
                        <select class="form-select" name="new_status" id="new_status" required>
                            <option value="">Select new status</option>
                            <option value="accepted">Accepted</option>
                            <option value="picked_up">Picked Up</option>
                            <option value="in_process">In Process</option>
                            <option value="ready">Ready</option>
                            <option value="delivered">Delivered</option>
                            <option value="cancelled">Cancelled</option>
                        </select>
                    </div>
                    
                    <div class="mb-3">
                        <label for="admin_notes" class="form-label">Admin Notes (Optional)</label>
                        <textarea class="form-control" name="admin_notes" id="admin_notes" rows="3" 
                                  placeholder="Add any notes about this status update..."></textarea>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary">Update Status</button>
                </div>
            </form>
        </div>
    </div>
</div>

<!-- Hidden content for printing -->
<div id="request-details" style="display: none;">
    <div class="text-center mb-4">
        <h2><?php echo APP_NAME; ?></h2>
        <h4>Laundry Request Details</h4>
        <p>Request #<?php echo htmlspecialchars($request['request_number']); ?></p>
    </div>
    
    <table class="table table-bordered">
        <tr>
            <th>Customer:</th>
            <td><?php echo htmlspecialchars($request['first_name'] . ' ' . $request['last_name']); ?></td>
        </tr>
        <tr>
            <th>Email:</th>
            <td><?php echo htmlspecialchars($request['email']); ?></td>
        </tr>
        <tr>
            <th>Phone:</th>
            <td><?php echo htmlspecialchars($request['phone']); ?></td>
        </tr>
        <tr>
            <th>Service Type:</th>
            <td><?php echo htmlspecialchars($request['laundry_type']); ?></td>
        </tr>
        <tr>
            <th>Weight:</th>
            <td><?php echo $request['weight_kg']; ?> kg</td>
        </tr>
        <tr>
            <th>Total Amount:</th>
            <td><?php echo format_currency($request['total_amount']); ?></td>
        </tr>
        <tr>
            <th>Status:</th>
            <td><?php echo ucfirst(str_replace('_', ' ', $request['status'])); ?></td>
        </tr>
        <tr>
            <th>Pickup Date:</th>
            <td><?php echo format_date($request['pickup_date']); ?> at <?php echo date('g:i A', strtotime($request['pickup_time'])); ?></td>
        </tr>
        <tr>
            <th>Pickup Address:</th>
            <td><?php echo nl2br(htmlspecialchars($request['pickup_address'])); ?></td>
        </tr>
        <tr>
            <th>Delivery Address:</th>
            <td><?php echo nl2br(htmlspecialchars($request['delivery_address'])); ?></td>
        </tr>
        <?php if (!empty($request['special_instructions'])): ?>
        <tr>
            <th>Special Instructions:</th>
            <td><?php echo nl2br(htmlspecialchars($request['special_instructions'])); ?></td>
        </tr>
        <?php endif; ?>
    </table>
</div>

<?php include '../includes/footer.php'; ?>

<script>
// Handle status modal
document.addEventListener('DOMContentLoaded', function() {
    const statusModal = document.getElementById('statusModal');
    if (statusModal) {
        statusModal.addEventListener('show.bs.modal', function(event) {
            const button = event.relatedTarget;
            const requestId = button.getAttribute('data-request-id');
            const requestNumber = button.getAttribute('data-request-number');
            const currentStatus = button.getAttribute('data-current-status');
            
            document.getElementById('modal_request_id').value = requestId;
            document.getElementById('modal_request_number').value = requestNumber;
            
            // Reset form
            document.getElementById('new_status').value = '';
            document.getElementById('admin_notes').value = '';
        });
    }
});
</script>

<style>
.timeline-marker {
    width: 12px;
    height: 12px;
    border-radius: 50%;
    margin-top: 4px;
}
</style>

