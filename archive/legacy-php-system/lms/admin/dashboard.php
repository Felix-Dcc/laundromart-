<?php
require_once '../config/config.php';
require_admin();

$page_title = 'Admin Dashboard';

// Get dashboard statistics
try {
    // Total users
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE user_type = 'user'");
    $stmt->execute();
    $total_users = $stmt->fetchColumn();
    
    // Active users (users with at least one request)
    $stmt = $pdo->prepare("SELECT COUNT(DISTINCT user_id) FROM laundry_requests");
    $stmt->execute();
    $active_users = $stmt->fetchColumn();
    
    // Total requests
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests");
    $stmt->execute();
    $total_requests = $stmt->fetchColumn();
    
    // Pending requests
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE status = 'pending'");
    $stmt->execute();
    $pending_requests = $stmt->fetchColumn();
    
    // In process requests
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE status IN ('accepted', 'picked_up', 'in_process')");
    $stmt->execute();
    $in_process_requests = $stmt->fetchColumn();
    
    // Completed requests
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE status = 'delivered'");
    $stmt->execute();
    $completed_requests = $stmt->fetchColumn();
    
    // Total revenue
    $stmt = $pdo->prepare("SELECT SUM(total_amount) FROM laundry_requests WHERE payment_status = 'paid'");
    $stmt->execute();
    $total_revenue = $stmt->fetchColumn() ?: 0;
    
    // Monthly revenue
    $stmt = $pdo->prepare("
        SELECT SUM(total_amount) FROM laundry_requests 
        WHERE payment_status = 'paid' AND MONTH(created_at) = MONTH(CURRENT_DATE()) AND YEAR(created_at) = YEAR(CURRENT_DATE())
    ");
    $stmt->execute();
    $monthly_revenue = $stmt->fetchColumn() ?: 0;
    
    // Recent requests
    $stmt = $pdo->prepare("
        SELECT lr.*, u.first_name, u.last_name, u.email 
        FROM laundry_requests lr 
        JOIN users u ON lr.user_id = u.id 
        ORDER BY lr.created_at DESC 
        LIMIT 10
    ");
    $stmt->execute();
    $recent_requests = $stmt->fetchAll();
    
    // Recent users
    $stmt = $pdo->prepare("
        SELECT * FROM users 
        WHERE user_type = 'user' 
        ORDER BY created_at DESC 
        LIMIT 5
    ");
    $stmt->execute();
    $recent_users = $stmt->fetchAll();
    
    // Service type statistics
    $stmt = $pdo->prepare("
        SELECT laundry_type, COUNT(*) as count, SUM(total_amount) as revenue 
        FROM laundry_requests 
        GROUP BY laundry_type 
        ORDER BY count DESC
    ");
    $stmt->execute();
    $service_stats = $stmt->fetchAll();
    
    // Monthly request trends (last 6 months)
    $stmt = $pdo->prepare("
        SELECT 
            DATE_FORMAT(created_at, '%Y-%m') as month,
            COUNT(*) as requests,
            SUM(total_amount) as revenue
        FROM laundry_requests 
        WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 6 MONTH)
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY month ASC
    ");
    $stmt->execute();
    $monthly_trends = $stmt->fetchAll();
    
} catch (PDOException $e) {
    error_log("Admin dashboard error: " . $e->getMessage());
    $total_users = $active_users = $total_requests = $pending_requests = 0;
    $in_process_requests = $completed_requests = 0;
    $total_revenue = $monthly_revenue = 0;
    $recent_requests = $recent_users = $service_stats = $monthly_trends = [];
}

include '../includes/header.php';
?>

<div class="dashboard-header text-center mb-4">
    <div class="container">
        <h1 class="welcome-text">
            Admin Dashboard
        </h1>
        <p class="lead mb-0">Manage your laundry business operations</p>
    </div>
</div>

<!-- Statistics Cards -->
<div class="row g-4 mb-5">
    <div class="col-md-6 col-lg-3">
        <div class="stats-card">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="stats-number"><?php echo $total_users; ?></div>
                    <div class="stats-label">Total Users</div>
                </div>
                <div class="stats-icon">
                    <i class="bi bi-people"></i>
                </div>
            </div>
        </div>
    </div>
    <div class="col-md-6 col-lg-3">
        <div class="stats-card warning">
            <div class="d-flex justify-content-between align-items-center">
                <div>
                    <div class="stats-number"><?php echo $pending_requests; ?></div>
                    <div class="stats-label">Pending Requests</div>
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
                    <div class="stats-number"><?php echo format_currency($total_revenue); ?></div>
                    <div class="stats-label">Total Revenue</div>
                </div>
                <div class="stats-icon">
                    <i class="bi bi-currency-dollar"></i>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Secondary Stats -->
<div class="row g-4 mb-5">
    <div class="col-md-3">
        <div class="card text-center">
            <div class="card-body">
                <h3 class="text-primary"><?php echo $total_requests; ?></h3>
                <p class="text-muted mb-0">Total Requests</p>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card text-center">
            <div class="card-body">
                <h3 class="text-success"><?php echo $completed_requests; ?></h3>
                <p class="text-muted mb-0">Completed</p>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card text-center">
            <div class="card-body">
                <h3 class="text-info"><?php echo $active_users; ?></h3>
                <p class="text-muted mb-0">Active Users</p>
            </div>
        </div>
    </div>
    <div class="col-md-3">
        <div class="card text-center">
            <div class="card-body">
                <h3 class="text-warning"><?php echo format_currency($monthly_revenue); ?></h3>
                <p class="text-muted mb-0">This Month</p>
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
                        <a href="requests.php?status=pending" class="btn btn-warning btn-lg w-100">
                            <i class="bi bi-clock me-2"></i>Review Pending Requests
                            <?php if ($pending_requests > 0): ?>
                                <span class="badge bg-light text-dark ms-2"><?php echo $pending_requests; ?></span>
                            <?php endif; ?>
                        </a>
                    </div>
                    <div class="col-md-6">
                        <a href="requests.php" class="btn btn-primary btn-lg w-100">
                            <i class="bi bi-list-check me-2"></i>Manage All Requests
                        </a>
                    </div>
                    <div class="col-md-6">
                        <a href="users.php" class="btn btn-info btn-lg w-100">
                            <i class="bi bi-people me-2"></i>Manage Users
                        </a>
                    </div>
                    <div class="col-md-6">
                        <a href="pricing.php" class="btn btn-success btn-lg w-100">
                            <i class="bi bi-currency-dollar me-2"></i>Update Pricing
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
                    <i class="bi bi-graph-up me-2"></i>Quick Stats
                </h5>
            </div>
            <div class="card-body">
                <div class="mb-3">
                    <div class="d-flex justify-content-between">
                        <span>Completion Rate</span>
                        <span class="fw-bold"><?php echo $total_requests > 0 ? round(($completed_requests / $total_requests) * 100, 1) : 0; ?>%</span>
                    </div>
                    <div class="progress mt-1">
                        <div class="progress-bar bg-success" style="width: <?php echo $total_requests > 0 ? ($completed_requests / $total_requests) * 100 : 0; ?>%"></div>
                    </div>
                </div>
                <div class="mb-3">
                    <div class="d-flex justify-content-between">
                        <span>User Engagement</span>
                        <span class="fw-bold"><?php echo $total_users > 0 ? round(($active_users / $total_users) * 100, 1) : 0; ?>%</span>
                    </div>
                    <div class="progress mt-1">
                        <div class="progress-bar bg-info" style="width: <?php echo $total_users > 0 ? ($active_users / $total_users) * 100 : 0; ?>%"></div>
                    </div>
                </div>
                <div>
                    <div class="d-flex justify-content-between">
                        <span>Avg. Order Value</span>
                        <span class="fw-bold"><?php echo format_currency($completed_requests > 0 ? $total_revenue / $completed_requests : 0); ?></span>
                    </div>
                </div>
            </div>
        </div>
    </div>
</div>

<!-- Recent Activity -->
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
                        <p class="text-muted">Requests will appear here as customers submit them</p>
                    </div>
                <?php else: ?>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Request #</th>
                                    <th>Customer</th>
                                    <th>Service</th>
                                    <th>Status</th>
                                    <th>Amount</th>
                                    <th>Date</th>
                                    <th>Actions</th>
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
                                        <td>
                                            <?php echo htmlspecialchars($request['first_name'] . ' ' . $request['last_name']); ?>
                                            <br>
                                            <small class="text-muted"><?php echo htmlspecialchars($request['email']); ?></small>
                                        </td>
                                        <td><?php echo htmlspecialchars($request['laundry_type']); ?></td>
                                        <td>
                                            <span class="badge <?php echo get_status_badge_class($request['status']); ?>">
                                                <?php echo ucfirst(str_replace('_', ' ', $request['status'])); ?>
                                            </span>
                                        </td>
                                        <td><?php echo format_currency($request['total_amount']); ?></td>
                                        <td><?php echo format_date($request['created_at']); ?></td>
                                        <td>
                                            <a href="request-details.php?id=<?php echo $request['id']; ?>" 
                                               class="btn btn-sm btn-outline-primary" title="View Details">
                                                <i class="bi bi-eye"></i>
                                            </a>
                                        </td>
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
        <!-- Recent Users -->
        <div class="card mb-4">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">
                    <i class="bi bi-person-plus me-2"></i>Recent Users
                </h5>
                <a href="users.php" class="btn btn-sm btn-outline-primary">View All</a>
            </div>
            <div class="card-body">
                <?php if (empty($recent_users)): ?>
                    <p class="text-muted mb-0">No new users</p>
                <?php else: ?>
                    <div class="list-group list-group-flush">
                        <?php foreach ($recent_users as $user): ?>
                            <div class="list-group-item border-0 px-0">
                                <div class="d-flex w-100 justify-content-between">
                                    <h6 class="mb-1"><?php echo htmlspecialchars($user['first_name'] . ' ' . $user['last_name']); ?></h6>
                                    <small class="text-muted"><?php echo format_date($user['created_at'], 'M d'); ?></small>
                                </div>
                                <p class="mb-1 small text-muted"><?php echo htmlspecialchars($user['email']); ?></p>
                                <small class="text-muted">
                                    <span class="badge <?php echo get_status_badge_class($user['status']); ?>">
                                        <?php echo ucfirst($user['status']); ?>
                                    </span>
                                </small>
                            </div>
                        <?php endforeach; ?>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        
        <!-- Service Statistics -->
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-pie-chart me-2"></i>Popular Services
                </h5>
            </div>
            <div class="card-body">
                <?php if (empty($service_stats)): ?>
                    <p class="text-muted mb-0">No service data yet</p>
                <?php else: ?>
                    <?php foreach ($service_stats as $service): ?>
                        <div class="mb-3">
                            <div class="d-flex justify-content-between">
                                <span><?php echo htmlspecialchars($service['laundry_type']); ?></span>
                                <span class="fw-bold"><?php echo $service['count']; ?></span>
                            </div>
                            <div class="progress mt-1">
                                <div class="progress-bar" style="width: <?php echo ($service['count'] / max(array_column($service_stats, 'count'))) * 100; ?>%"></div>
                            </div>
                            <small class="text-muted"><?php echo format_currency($service['revenue']); ?> revenue</small>
                        </div>
                    <?php endforeach; ?>
                <?php endif; ?>
            </div>
        </div>
    </div>
</div>

<?php include '../includes/footer.php'; ?>

