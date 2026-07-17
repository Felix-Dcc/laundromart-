<?php
require_once '../config/config.php';
require_login();

$page_title = 'Dashboard';

// Get user statistics
try {
    // Total requests
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE user_id = ?");
    $stmt->execute([$_SESSION['user_id']]);
    $total_requests = $stmt->fetchColumn();
    
    // Pending requests
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE user_id = ? AND status = 'pending'");
    $stmt->execute([$_SESSION['user_id']]);
    $pending_requests = $stmt->fetchColumn();
    
    // In process requests
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE user_id = ? AND status IN ('accepted', 'picked_up', 'in_process')");
    $stmt->execute([$_SESSION['user_id']]);
    $in_process_requests = $stmt->fetchColumn();
    
    // Completed requests
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE user_id = ? AND status = 'delivered'");
    $stmt->execute([$_SESSION['user_id']]);
    $completed_requests = $stmt->fetchColumn();
    
    // Total amount spent
    $stmt = $pdo->prepare("SELECT SUM(total_amount) FROM laundry_requests WHERE user_id = ? AND payment_status = 'paid'");
    $stmt->execute([$_SESSION['user_id']]);
    $total_spent = $stmt->fetchColumn() ?: 0;
    
    // Recent requests
    $stmt = $pdo->prepare("
        SELECT lr.*, lp.service_type, lp.price_per_kg 
        FROM laundry_requests lr 
        LEFT JOIN laundry_pricing lp ON lr.laundry_type = lp.service_type 
        WHERE lr.user_id = ? 
        ORDER BY lr.created_at DESC 
        LIMIT 5
    ");
    $stmt->execute([$_SESSION['user_id']]);
    $recent_requests = $stmt->fetchAll();
    
    // Recent notifications
    $stmt = $pdo->prepare("
        SELECT * FROM notifications 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 5
    ");
    $stmt->execute([$_SESSION['user_id']]);
    $recent_notifications = $stmt->fetchAll();
    
} catch (PDOException $e) {
    error_log("Dashboard data error: " . $e->getMessage());
    $total_requests = $pending_requests = $in_process_requests = $completed_requests = 0;
    $total_spent = 0;
    $recent_requests = $recent_notifications = [];
}

include '../includes/header.php';
?>

<div class="dashboard-header text-center">
    <div class="container">
        <h1 class="welcome-text">
            Welcome back, <span class="welcome-name"><?php echo htmlspecialchars($_SESSION['first_name']); ?></span>!
        </h1>
        <p class="lead mb-0">Manage your laundry requests and track your orders</p>
    </div>
</div>

<!-- Statistics Cards -->
<div class="row g-4 mb-5">
    <div class="col-md-6 col-lg-3">
        <div class="stats-card">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="stats-number"><?php echo $total_requests; ?></div>
                    <div class="stats-label">Total Requests</div>
                </div>
                <div class="stats-icon">
                    <i class="bi bi-list-ul"></i>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-6 col-lg-3">
        <div class="stats-card warning">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="stats-number"><?php echo $pending_requests; ?></div>
                    <div class="stats-label">Pending</div>
                </div>
                <div class="stats-icon">
                    <i class="bi bi-clock"></i>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-6 col-lg-3">
        <div class="stats-card info">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="stats-number"><?php echo $in_process_requests; ?></div>
                    <div class="stats-label">In Process</div>
                </div>
                <div class="stats-icon">
                    <i class="bi bi-gear"></i>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-6 col-lg-3">
        <div class="stats-card success">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="stats-number"><?php echo format_currency($total_spent); ?></div>
                    <div class="stats-label">Total Spent</div>
                </div>
                <div class="stats-icon">
                    <i class="bi bi-currency-dollar"></i>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Quick Actions -->
<div class="row g-4 mb-5">
    <div class="col-lg-8">
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-lightning me-2"></i>Quick Actions
                </h5>
            </div>
            <div class="card-body">
                <div class="row g-3">
                    <div class="col-md-6">
                        <a href="new-request.php" class="btn btn-primary btn-lg w-100">
                            <i class="bi bi-plus-circle me-2"></i>New Laundry Request
                        </a>
                    </div>
                    <div class="col-md-6">
                        <a href="requests.php" class="btn btn-outline-primary btn-lg w-100">
                            <i class="bi bi-list-check me-2"></i>View All Requests
                        </a>
                    </div>
                    <div class="col-md-6">
                        <a href="profile.php" class="btn btn-outline-secondary btn-lg w-100">
                            <i class="bi bi-person me-2"></i>Update Profile
                        </a>
                    </div>
                    <div class="col-md-6">
                        <a href="../notifications.php" class="btn btn-outline-info btn-lg w-100">
                            <i class="bi bi-bell me-2"></i>View Notifications
                            <?php if (get_unread_notifications_count($_SESSION['user_id']) > 0): ?>
                                <span class="badge bg-danger ms-2"><?php echo get_unread_notifications_count($_SESSION['user_id']); ?></span>
                            <?php endif; ?>
                        </a>
                    </div>
                </div>
            </div>
        </div>
    </div>
    <div class="col-lg-4">
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-info-circle me-2"></i>Service Info
                </h5>
            </div>
            <div class="card-body">
                <div class="mb-3">
                    <h6 class="text-muted">Pickup Times</h6>
                    <p class="mb-0">9:00 AM - 6:00 PM</p>
                </div>
                <div class="mb-3">
                    <h6 class="text-muted">Delivery Times</h6>
                    <p class="mb-0">9:00 AM - 6:00 PM</p>
                </div>
                <div class="mb-3">
                    <h6 class="text-muted">Express Service</h6>
                    <p class="mb-0">Same day delivery available</p>
                </div>
                <div>
                    <h6 class="text-muted">Support</h6>
                    <p class="mb-0">
                        <i class="bi bi-telephone me-1"></i>+1 (555) 123-4567<br>
                        <i class="bi bi-envelope me-1"></i><?php echo get_setting('site_email', 'info@lms.com'); ?>
                    </p>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Recent Requests -->
<div class="row g-4">
    <div class="col-lg-8">
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">
                    <i class="bi bi-clock-history me-2"></i>Recent Requests
                </h5>
                <a href="requests.php" class="btn btn-sm btn-outline-primary">View All</a>
            </div>
            <div class="card-body">
                <?php if (empty($recent_requests)): ?>
                    <div class="text-center py-4">
                        <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
                        <h6 class="text-muted mt-3">No requests yet</h6>
                        <p class="text-muted">Create your first laundry request to get started</p>
                        <a href="new-request.php" class="btn btn-primary">
                            <i class="bi bi-plus-circle me-2"></i>Create Request
                        </a>
                    </div>
                <?php else: ?>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Request #</th>
                                    <th>Service</th>
                                    <th>Status</th>
                                    <th>Amount</th>
                                    <th>Date</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($recent_requests as $request): ?>
                                    <tr>
                                        <td>
                                            <a href="request-details.php?id=<?php echo $request['id']; ?>" class="text-decoration-none">
                                                <?php echo htmlspecialchars($request['request_number']); ?>
                                            </a>
                                        </td>
                                        <td><?php echo htmlspecialchars($request['laundry_type']); ?></td>
                                        <td>
                                            <span class="badge <?php echo get_status_badge_class($request['status']); ?>">
                                                <?php echo ucfirst($request['status']); ?>
                                            </span>
                                        </td>
                                        <td><?php echo format_currency($request['total_amount']); ?></td>
                                        <td><?php echo format_date($request['created_at']); ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <div class="col-lg-4">
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">
                    <i class="bi bi-bell me-2"></i>Recent Notifications
                </h5>
                <a href="../notifications.php" class="btn btn-sm btn-outline-primary">View All</a>
            </div>
            <div class="card-body">
                <?php if (empty($recent_notifications)): ?>
                    <div class="text-center py-3">
                        <i class="bi bi-bell-slash text-muted" style="font-size: 2rem;"></i>
                        <p class="text-muted mt-2 mb-0">No notifications</p>
                    </div>
                <?php else: ?>
                    <div class="list-group list-group-flush">
                        <?php foreach ($recent_notifications as $notification): ?>
                            <div class="list-group-item border-0 px-0 <?php echo $notification['is_read'] ? '' : 'bg-light'; ?>">
                                <div class="d-flex w-100 justify-content-between">
                                    <h6 class="mb-1"><?php echo htmlspecialchars($notification['title']); ?></h6>
                                    <small class="text-muted"><?php echo format_date($notification['created_at'], 'M d'); ?></small>
                                </div>
                                <p class="mb-1 small text-muted"><?php echo htmlspecialchars($notification['message']); ?></p>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<?php include '../includes/footer.php'; ?>

