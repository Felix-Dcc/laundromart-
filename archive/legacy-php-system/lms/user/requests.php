<?php
require_once '../config/config.php';
require_login();

$page_title = 'My Requests';

// Pagination settings
$page = max(1, intval($_GET['page'] ?? 1));
$limit = RECORDS_PER_PAGE;
$offset = ($page - 1) * $limit;

// Filter settings
$status_filter = sanitize_input($_GET['status'] ?? '');
$search_query = sanitize_input($_GET['search'] ?? '');

// Build WHERE clause
$where_conditions = ['user_id = ?'];
$params = [$_SESSION['user_id']];

if (!empty($status_filter)) {
    $where_conditions[] = 'status = ?';
    $params[] = $status_filter;
}

if (!empty($search_query)) {
    $where_conditions[] = '(request_number LIKE ? OR laundry_type LIKE ? OR pickup_address LIKE ?)';
    $search_param = "%{$search_query}%";
    $params[] = $search_param;
    $params[] = $search_param;
    $params[] = $search_param;
}

$where_clause = 'WHERE ' . implode(' AND ', $where_conditions);

try {
    // Get total count
    $count_sql = "SELECT COUNT(*) FROM laundry_requests {$where_clause}";
    $stmt = $pdo->prepare($count_sql);
    $stmt->execute($params);
    $total_records = $stmt->fetchColumn();
    
    // Get requests
    $sql = "
        SELECT lr.*, lp.price_per_kg 
        FROM laundry_requests lr 
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
    
} catch (PDOException $e) {
    error_log("Requests fetch error: " . $e->getMessage());
    $requests = [];
    $total_records = 0;
    $total_pages = 0;
}

include '../includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h2>
        <i class="bi bi-list-ul me-2"></i>My Laundry Requests
    </h2>
    <a href="new-request.php" class="btn btn-primary">
        <i class="bi bi-plus-circle me-2"></i>New Request
    </a>
</div>

<!-- Filters and Search -->
<div class="card mb-4">
    <div class="card-body">
        <form method="GET" class="row g-3">
            <div class="col-md-4">
                <label for="search" class="form-label">Search</label>
                <div class="input-group">
                    <span class="input-group-text"><i class="bi bi-search"></i></span>
                    <input type="text" class="form-control" id="search" name="search" 
                           value="<?php echo htmlspecialchars($search_query); ?>" 
                           placeholder="Request number, service, address...">
                </div>
            </div>
            <div class="col-md-3">
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
            <div class="col-md-3 d-flex align-items-end">
                <button type="submit" class="btn btn-primary me-2">
                    <i class="bi bi-funnel me-1"></i>Filter
                </button>
                <a href="requests.php" class="btn btn-outline-secondary">
                    <i class="bi bi-x-circle me-1"></i>Clear
                </a>
            </div>
            <div class="col-md-2 d-flex align-items-end">
                <button type="button" class="btn btn-outline-success" onclick="exportTableToCSV('requestsTable', 'my-requests.csv')">
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
    <?php if (!empty($search_query) || !empty($status_filter)): ?>
        <small class="text-muted">
            Filtered by: 
            <?php if (!empty($search_query)): ?>
                Search: "<?php echo htmlspecialchars($search_query); ?>"
            <?php endif; ?>
            <?php if (!empty($status_filter)): ?>
                Status: <?php echo ucfirst($status_filter); ?>
            <?php endif; ?>
        </small>
    <?php endif; ?>
</div>

<!-- Requests Table -->
<div class="card">
    <div class="card-body">
        <?php if (empty($requests)): ?>
            <div class="text-center py-5">
                <i class="bi bi-inbox text-muted" style="font-size: 4rem;"></i>
                <h4 class="text-muted mt-3">No requests found</h4>
                <?php if (!empty($search_query) || !empty($status_filter)): ?>
                    <p class="text-muted">Try adjusting your search criteria or filters</p>
                    <a href="requests.php" class="btn btn-outline-primary">Clear Filters</a>
                <?php else: ?>
                    <p class="text-muted">You haven't made any laundry requests yet</p>
                    <a href="new-request.php" class="btn btn-primary">
                        <i class="bi bi-plus-circle me-2"></i>Create Your First Request
                    </a>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <div class="table-responsive">
                <table class="table table-hover" id="requestsTable">
                    <thead>
                        <tr>
                            <th>Request #</th>
                            <th>Service Type</th>
                            <th>Weight</th>
                            <th>Pickup Date</th>
                            <th>Status</th>
                            <th>Amount</th>
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
                                <td><?php echo htmlspecialchars($request['laundry_type']); ?></td>
                                <td><?php echo $request['weight_kg']; ?> kg</td>
                                <td>
                                    <?php echo format_date($request['pickup_date']); ?>
                                    <br>
                                    <small class="text-muted"><?php echo date('g:i A', strtotime($request['pickup_time'])); ?></small>
                                </td>
                                <td>
                                    <span class="badge <?php echo get_status_badge_class($request['status']); ?>">
                                        <?php echo ucfirst(str_replace('_', ' ', $request['status'])); ?>
                                    </span>
                                </td>
                                <td>
                                    <?php echo format_currency($request['total_amount']); ?>
                                    <?php if ($request['payment_status'] === 'paid'): ?>
                                        <br><small class="text-success"><i class="bi bi-check-circle"></i> Paid</small>
                                    <?php elseif ($request['payment_status'] === 'pending'): ?>
                                        <br><small class="text-warning"><i class="bi bi-clock"></i> Pending</small>
                                    <?php endif; ?>
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
                                        <?php if ($request['status'] === 'pending'): ?>
                                            <button type="button" class="btn btn-outline-danger" 
                                                    onclick="confirmAction('Are you sure you want to cancel this request?', function() { 
                                                        window.location.href = 'cancel-request.php?id=<?php echo $request['id']; ?>'; 
                                                    })" title="Cancel Request">
                                                <i class="bi bi-x-circle"></i>
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
                                <a class="page-link" href="?page=<?php echo $page - 1; ?>&status=<?php echo urlencode($status_filter); ?>&search=<?php echo urlencode($search_query); ?>">
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
                                <a class="page-link" href="?page=<?php echo $i; ?>&status=<?php echo urlencode($status_filter); ?>&search=<?php echo urlencode($search_query); ?>">
                                    <?php echo $i; ?>
                                </a>
                            </li>
                        <?php endfor; ?>
                        
                        <?php if ($page < $total_pages): ?>
                            <li class="page-item">
                                <a class="page-link" href="?page=<?php echo $page + 1; ?>&status=<?php echo urlencode($status_filter); ?>&search=<?php echo urlencode($search_query); ?>">
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

<?php include '../includes/footer.php'; ?>

