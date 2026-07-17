<?php
require_once '../config/config.php';
require_admin();

$page_title = 'Manage Requests';

// Pagination settings
$page = max(1, intval($_GET['page'] ?? 1));
$limit = RECORDS_PER_PAGE;
$offset = ($page - 1) * $limit;

// Filter settings
$status_filter = sanitize_input($_GET['status'] ?? '');
$user_id_filter = intval($_GET['user_id'] ?? 0);
$search_query = sanitize_input($_GET['search'] ?? '');
$date_from = sanitize_input($_GET['date_from'] ?? '');
$date_to = sanitize_input($_GET['date_to'] ?? '');

// Build WHERE clause
$where_conditions = [];
$params = [];

if (!empty($status_filter)) {
    $where_conditions[] = 'lr.status = ?';
    $params[] = $status_filter;
}

if ($user_id_filter > 0) {
    $where_conditions[] = 'lr.user_id = ?';
    $params[] = $user_id_filter;
}

if (!empty($search_query)) {
    $where_conditions[] = '(lr.request_number LIKE ? OR lr.laundry_type LIKE ? OR u.first_name LIKE ? OR u.last_name LIKE ? OR u.email LIKE ?)';
    $search_param = "%{$search_query}%";
    $params[] = $search_param;
    $params[] = $search_param;
    $params[] = $search_param;
    $params[] = $search_param;
    $params[] = $search_param;
}

if (!empty($date_from)) {
    $where_conditions[] = 'DATE(lr.created_at) >= ?';
    $params[] = $date_from;
}

if (!empty($date_to)) {
    $where_conditions[] = 'DATE(lr.created_at) <= ?';
    $params[] = $date_to;
}

$where_clause = !empty($where_conditions) ? 'WHERE ' . implode(' AND ', $where_conditions) : '';

// Handle status updates
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $request_id = intval($_POST['request_id'] ?? 0);
    
    if ($action === 'update_status' && $request_id > 0) {
        $new_status = sanitize_input($_POST['new_status'] ?? '');
        $admin_notes = sanitize_input($_POST['admin_notes'] ?? '');
        
        if (!empty($new_status)) {
            try {
                // Update request status
                $stmt = $pdo->prepare("UPDATE laundry_requests SET status = ?, admin_notes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
                
                if ($stmt->execute([$new_status, $admin_notes, $request_id])) {
                    // Add status history
                    $stmt = $pdo->prepare("
                        INSERT INTO request_status_history (request_id, status, notes, changed_by) 
                        VALUES (?, ?, ?, ?)
                    ");
                    $stmt->execute([$request_id, $new_status, $admin_notes, $_SESSION['user_id']]);
                    
                    // Get request details for notification
                    $stmt = $pdo->prepare("SELECT lr.*, u.first_name FROM laundry_requests lr JOIN users u ON lr.user_id = u.id WHERE lr.id = ?");
                    $stmt->execute([$request_id]);
                    $request = $stmt->fetch();
                    
                    if ($request) {
                        // Send notification to user
                        $status_messages = [
                            'accepted' => 'Your laundry request has been accepted and scheduled for pickup.',
                            'picked_up' => 'Your laundry has been picked up and is being processed.',
                            'in_process' => 'Your laundry is currently being cleaned.',
                            'ready' => 'Your laundry is ready for delivery.',
                            'delivered' => 'Your laundry has been delivered successfully.',
                            'cancelled' => 'Your laundry request has been cancelled.'
                        ];
                        
                        $message = $status_messages[$new_status] ?? "Your request status has been updated to {$new_status}.";
                        send_notification($request['user_id'], 'Request Status Updated', $message, 'info');
                    }
                    
                    $_SESSION['success_message'] = 'Request status updated successfully.';
                } else {
                    $_SESSION['error_message'] = 'Failed to update request status.';
                }
            } catch (PDOException $e) {
                error_log("Status update error: " . $e->getMessage());
                $_SESSION['error_message'] = 'Failed to update request status.';
            }
        }
        
        header('Location: requests.php?' . http_build_query($_GET));
        exit();
    }
}

try {
    // Get total count
    $count_sql = "
        SELECT COUNT(*) 
        FROM laundry_requests lr 
        JOIN users u ON lr.user_id = u.id 
        {$where_clause}
    ";
    $stmt = $pdo->prepare($count_sql);
    $stmt->execute($params);
    $total_records = $stmt->fetchColumn();
    
    // Get requests
    $sql = "
        SELECT lr.*, u.first_name, u.last_name, u.email, u.phone,
               lp.price_per_kg
        FROM laundry_requests lr 
        JOIN users u ON lr.user_id = u.id 
        LEFT JOIN laundry_pricing lp ON lr.laundry_type = lp.service_type 
        {$where_clause}
        ORDER BY lr.created_at DESC 
        LIMIT {$limit} OFFSET {$offset}
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $requests = $stmt->fetchAll();
    
    // Calculate pagination
    $total_pages = ceil($total_records / $limit);
    
    // Get summary statistics
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE status = 'pending'");
    $stmt->execute();
    $pending_count = $stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE status IN ('accepted', 'picked_up', 'in_process')");
    $stmt->execute();
    $in_process_count = $stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE status = 'delivered'");
    $stmt->execute();
    $completed_count = $stmt->fetchColumn();
    
} catch (PDOException $e) {
    error_log("Requests fetch error: " . $e->getMessage());
    $requests = [];
    $total_records = 0;
    $total_pages = 0;
    $pending_count = $in_process_count = $completed_count = 0;
}

include '../includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h2>
        <i class="bi bi-list-check me-2"></i>Manage Requests
    </h2>
    <a href="dashboard.php" class="btn btn-outline-secondary">
        <i class="bi bi-arrow-left me-2"></i>Back to Dashboard
    </a>
</div>

<!-- Summary Cards -->
<div class="row g-4 mb-4">
    <div class="col-md-4">
        <div class="card text-center">
            <div class="card-body">
                <h3 class="text-warning"><?php echo $pending_count; ?></h3>
                <p class="text-muted mb-0">Pending</p>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card text-center">
            <div class="card-body">
                <h3 class="text-info"><?php echo $in_process_count; ?></h3>
                <p class="text-muted mb-0">In Process</p>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card text-center">
            <div class="card-body">
                <h3 class="text-success"><?php echo $completed_count; ?></h3>
                <p class="text-muted mb-0">Completed</p>
            </div>
        </div>
    </div>
</div>

<!-- Filters and Search -->
<div class="card mb-4">
    <div class="card-body">
        <form method="GET" class="row g-3">
            <div class="col-md-3">
                <label for="search" class="form-label">Search</label>
                <div class="input-group">
                    <span class="input-group-text"><i class="bi bi-search"></i></span>
                    <input type="text" class="form-control" id="search" name="search" 
                           value="<?php echo htmlspecialchars($search_query); ?>" 
                           placeholder="Request #, customer, service...">
                </div>
            </div>
            <div class="col-md-2">
                <label for="status" class="form-label">Status</label>
                <select class="form-select" id="status" name="status">
                    <option value="">All Status</option>
                    <option value="pending" <?php echo $status_filter === 'pending' ? 'selected' : ''; ?>>Pending</option>
                    <option value="accepted" <?php echo $status_filter === 'accepted' ? 'selected' : ''; ?>>Accepted</option>
                    <option value="picked_up" <?php echo $status_filter === 'picked_up' ? 'selected' : ''; ?>>Picked Up</option>
                    <option value="in_process" <?php echo $status_filter === 'in_process' ? 'selected' : ''; ?>>In Process</option>
                    <option value="ready" <?php echo $status_filter === 'ready' ? 'selected' : ''; ?>>Ready</option>
                    <option value="delivered" <?php echo $status_filter === 'delivered' ? 'selected' : ''; ?>>Delivered</option>
                    <option value="cancelled" <?php echo $status_filter === 'cancelled' ? 'selected' : ''; ?>>Cancelled</option>
                </select>
            </div>
            <div class="col-md-2">
                <label for="date_from" class="form-label">From Date</label>
                <input type="date" class="form-control" id="date_from" name="date_from" 
                       value="<?php echo htmlspecialchars($date_from); ?>">
            </div>
            <div class="col-md-2">
                <label for="date_to" class="form-label">To Date</label>
                <input type="date" class="form-control" id="date_to" name="date_to" 
                       value="<?php echo htmlspecialchars($date_to); ?>">
            </div>
            <div class="col-md-3 d-flex align-items-end">
                <button type="submit" class="btn btn-primary me-2">
                    <i class="bi bi-funnel me-1"></i>Filter
                </button>
                <a href="requests.php" class="btn btn-outline-secondary me-2">
                    <i class="bi bi-x-circle me-1"></i>Clear
                </a>
                <button type="button" class="btn btn-outline-success" onclick="exportTableToCSV('requestsTable', 'requests.csv')">
                    <i class="bi bi-download me-1"></i>Export
                </button>
            </div>
        </form>
    </div>
</div>

<!-- Results Summary -->
<div class="d-flex justify-content-between align-items-center mb-3">
    <p class="text-muted mb-0">
        Showing <?php echo min($offset + 1, $total_records); ?> to <?php echo min($offset + $limit, $total_records); ?> 
        of <?php echo $total_records; ?> requests
    </p>
</div>

<!-- Requests Table -->
<div class="card">
    <div class="card-body">
        <?php if (empty($requests)): ?>
            <div class="text-center py-5">
                <i class="bi bi-inbox text-muted" style="font-size: 4rem;"></i>
                <h4 class="text-muted mt-3">No requests found</h4>
                <?php if (!empty($search_query) || !empty($status_filter) || !empty($date_from) || !empty($date_to)): ?>
                    <p class="text-muted">Try adjusting your search criteria or filters</p>
                    <a href="requests.php" class="btn btn-outline-primary">Clear Filters</a>
                <?php else: ?>
                    <p class="text-muted">No laundry requests have been submitted yet</p>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <div class="table-responsive">
                <table class="table table-hover" id="requestsTable">
                    <thead>
                        <tr>
                            <th>Request #</th>
                            <th>Customer</th>
                            <th>Service</th>
                            <th>Weight</th>
                            <th>Amount</th>
                            <th>Status</th>
                            <th>Pickup Date</th>
                            <th>Created</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($requests as $request): ?>
                            <tr>
                                <td>
                                    <a href="request-details.php?id=<?php echo $request['id']; ?>" 
                                       class="text-decoration-none fw-bold">
                                        <?php echo htmlspecialchars($request['request_number']); ?>
                                    </a>
                                </td>
                                <td>
                                    <div>
                                        <strong><?php echo htmlspecialchars($request['first_name'] . ' ' . $request['last_name']); ?></strong>
                                        <br>
                                        <small class="text-muted">
                                            <i class="bi bi-envelope me-1"></i><?php echo htmlspecialchars($request['email']); ?>
                                        </small>
                                        <br>
                                        <small class="text-muted">
                                            <i class="bi bi-telephone me-1"></i><?php echo htmlspecialchars($request['phone']); ?>
                                        </small>
                                    </div>
                                </td>
                                <td><?php echo htmlspecialchars($request['laundry_type']); ?></td>
                                <td><?php echo $request['weight_kg']; ?> kg</td>
                                <td>
                                    <?php echo format_currency($request['total_amount']); ?>
                                    <br>
                                    <small class="badge <?php echo get_status_badge_class($request['payment_status']); ?>">
                                        <?php echo ucfirst($request['payment_status']); ?>
                                    </small>
                                </td>
                                <td>
                                    <span class="badge <?php echo get_status_badge_class($request['status']); ?>">
                                        <?php echo ucfirst(str_replace('_', ' ', $request['status'])); ?>
                                    </span>
                                </td>
                                <td>
                                    <?php echo format_date($request['pickup_date']); ?>
                                    <br>
                                    <small class="text-muted"><?php echo date('g:i A', strtotime($request['pickup_time'])); ?></small>
                                </td>
                                <td>
                                    <?php echo format_date($request['created_at']); ?>
                                    <br>
                                    <small class="text-muted"><?php echo date('g:i A', strtotime($request['created_at'])); ?></small>
                                </td>
                                <td>
                                    <div class="btn-group btn-group-sm">
                                        <a href="request-details.php?id=<?php echo $request['id']; ?>" 
                                           class="btn btn-outline-primary" title="View Details">
                                            <i class="bi bi-eye"></i>
                                        </a>
                                        <?php if ($request['status'] !== 'delivered' && $request['status'] !== 'cancelled'): ?>
                                            <button type="button" class="btn btn-outline-success" 
                                                    data-bs-toggle="modal" 
                                                    data-bs-target="#statusModal"
                                                    data-request-id="<?php echo $request['id']; ?>"
                                                    data-request-number="<?php echo htmlspecialchars($request['request_number']); ?>"
                                                    data-current-status="<?php echo $request['status']; ?>"
                                                    title="Update Status">
                                                <i class="bi bi-arrow-up-circle"></i>
                                            </button>
                                        <?php endif; ?>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            
            <!-- Pagination -->
            <?php if ($total_pages > 1): ?>
                <nav aria-label="Requests pagination" class="mt-4">
                    <ul class="pagination justify-content-center">
                        <?php if ($page > 1): ?>
                            <li class="page-item">
                                <a class="page-link" href="?page=<?php echo $page - 1; ?>&<?php echo http_build_query(array_filter($_GET, function($key) { return $key !== 'page'; }, ARRAY_FILTER_USE_KEY)); ?>">
                                    <i class="bi bi-chevron-left"></i>
                                </a>
                            </li>
                        <?php endif; ?>
                        
                        <?php
                        $start_page = max(1, $page - 2);
                        $end_page = min($total_pages, $page + 2);
                        
                        for ($i = $start_page; $i <= $end_page; $i++):
                        ?>
                            <li class="page-item <?php echo $i === $page ? 'active' : ''; ?>">
                                <a class="page-link" href="?page=<?php echo $i; ?>&<?php echo http_build_query(array_filter($_GET, function($key) { return $key !== 'page'; }, ARRAY_FILTER_USE_KEY)); ?>">
                                    <?php echo $i; ?>
                                </a>
                            </li>
                        <?php endfor; ?>
                        
                        <?php if ($page < $total_pages): ?>
                            <li class="page-item">
                                <a class="page-link" href="?page=<?php echo $page + 1; ?>&<?php echo http_build_query(array_filter($_GET, function($key) { return $key !== 'page'; }, ARRAY_FILTER_USE_KEY)); ?>">
                                    <i class="bi bi-chevron-right"></i>
                                </a>
                            </li>
                        <?php endif; ?>
                    </ul>
                </nav>
            <?php endif; ?>
        <?php endif; ?>
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
            <form method="POST">
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

