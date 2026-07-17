<?php
require_once '../config/config.php';
require_admin();

$user_id = intval($_GET['id'] ?? 0);

if (!$user_id) {
    $_SESSION['error_message'] = 'Invalid user ID.';
    header('Location: users.php');
    exit();
}

try {
    // Get user details
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ? AND user_type = 'user'");
    $stmt->execute([$user_id]);
    $user = $stmt->fetch();
    
    if (!$user) {
        $_SESSION['error_message'] = 'User not found.';
        header('Location: users.php');
        exit();
    }
    
    // Get user statistics
    $stmt = $pdo->prepare("
        SELECT 
            COUNT(*) as total_requests,
            SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_spent,
            AVG(total_amount) as avg_order_value,
            MAX(created_at) as last_order_date,
            MIN(created_at) as first_order_date
        FROM laundry_requests 
        WHERE user_id = ?
    ");
    $stmt->execute([$user_id]);
    $stats = $stmt->fetch();
    
    // Get recent requests
    $stmt = $pdo->prepare("
        SELECT * FROM laundry_requests 
        WHERE user_id = ? 
        ORDER BY created_at DESC 
        LIMIT 10
    ");
    $stmt->execute([$user_id]);
    $recent_requests = $stmt->fetchAll();
    
    // Get service preferences
    $stmt = $pdo->prepare("
        SELECT laundry_type, COUNT(*) as count, SUM(total_amount) as total_spent
        FROM laundry_requests 
        WHERE user_id = ?
        GROUP BY laundry_type
        ORDER BY count DESC
    ");
    $stmt->execute([$user_id]);
    $service_preferences = $stmt->fetchAll();
    
} catch (PDOException $e) {
    error_log("User details error: " . $e->getMessage());
    $_SESSION['error_message'] = 'Error loading user details.';
    header('Location: users.php');
    exit();
}

$page_title = 'User Details - ' . $user['first_name'] . ' ' . $user['last_name'];

include '../includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <div>
        <h2>
            <i class="bi bi-person me-2"></i>User Details
        </h2>
        <p class="text-muted mb-0"><?php echo htmlspecialchars($user['first_name'] . ' ' . $user['last_name']); ?></p>
    </div>
    <div>
        <a href="users.php" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-2"></i>Back to Users
        </a>
        <a href="requests.php?user_id=<?php echo $user['id']; ?>" class="btn btn-primary ms-2">
            <i class="bi bi-list me-2"></i>View Requests
        </a>
    </div>
</div>

<div class="row g-4">
    <!-- User Information -->
    <div class="col-lg-8">
        <!-- Basic Information -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-person-circle me-2"></i>Basic Information
                </h5>
            </div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-md-6">
                        <h6 class="text-muted">Full Name</h6>
                        <p class="mb-3"><?php echo htmlspecialchars($user['first_name'] . ' ' . $user['last_name']); ?></p>
                        
                        <h6 class="text-muted">Email Address</h6>
                        <p class="mb-3">
                            <a href="mailto:<?php echo htmlspecialchars($user['email']); ?>" class="text-decoration-none">
                                <?php echo htmlspecialchars($user['email']); ?>
                            </a>
                        </p>
                        
                        <h6 class="text-muted">Phone Number</h6>
                        <p class="mb-3">
                            <a href="tel:<?php echo htmlspecialchars($user['phone']); ?>" class="text-decoration-none">
                                <?php echo htmlspecialchars($user['phone']); ?>
                            </a>
                        </p>
                    </div>
                    <div class="col-md-6">
                        <h6 class="text-muted">Account Status</h6>
                        <p class="mb-3">
                            <span class="badge <?php echo get_status_badge_class($user['status']); ?>">
                                <?php echo ucfirst($user['status']); ?>
                            </span>
                        </p>
                        
                        <h6 class="text-muted">Member Since</h6>
                        <p class="mb-3"><?php echo format_date($user['created_at']); ?></p>
                        
                        <h6 class="text-muted">Last Updated</h6>
                        <p class="mb-3"><?php echo format_datetime($user['updated_at']); ?></p>
                    </div>
                </div>
                
                <div class="row g-4">
                    <div class="col-12">
                        <h6 class="text-muted">Address</h6>
                        <p class="mb-0"><?php echo nl2br(htmlspecialchars($user['address'])); ?></p>
                    </div>
                </div>
            </div>
        </div>
        
        <!-- Order Statistics -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-graph-up me-2"></i>Order Statistics
                </h5>
            </div>
            <div class="card-body">
                <div class="row g-4">
                    <div class="col-md-3">
                        <div class="text-center">
                            <h3 class="text-primary"><?php echo $stats['total_requests'] ?? 0; ?></h3>
                            <p class="text-muted mb-0">Total Orders</p>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-center">
                            <h3 class="text-success"><?php echo format_currency($stats['total_spent'] ?? 0); ?></h3>
                            <p class="text-muted mb-0">Total Spent</p>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-center">
                            <h3 class="text-info"><?php echo format_currency($stats['avg_order_value'] ?? 0); ?></h3>
                            <p class="text-muted mb-0">Avg Order Value</p>
                        </div>
                    </div>
                    <div class="col-md-3">
                        <div class="text-center">
                            <h3 class="text-warning">
                                <?php 
                                if ($stats['first_order_date'] && $stats['last_order_date']) {
                                    $days = (strtotime($stats['last_order_date']) - strtotime($stats['first_order_date'])) / (60 * 60 * 24);
                                    echo max(1, round($days));
                                } else {
                                    echo '0';
                                }
                                ?>
                            </h3>
                            <p class="text-muted mb-0">Days Active</p>
                        </div>
                    </div>
                </div>
                
                <?php if ($stats['first_order_date']): ?>
                    <hr>
                    <div class="row g-4">
                        <div class="col-md-6">
                            <h6 class="text-muted">First Order</h6>
                            <p class="mb-0"><?php echo format_datetime($stats['first_order_date']); ?></p>
                        </div>
                        <div class="col-md-6">
                            <h6 class="text-muted">Last Order</h6>
                            <p class="mb-0"><?php echo format_datetime($stats['last_order_date']); ?></p>
                        </div>
                    </div>
                <?php endif; ?>
            </div>
        </div>
        
        <!-- Service Preferences -->
        <?php if (!empty($service_preferences)): ?>
            <div class="card mb-4">
                <div class="card-header">
                    <h5 class="mb-0">
                        <i class="bi bi-heart me-2"></i>Service Preferences
                    </h5>
                </div>
                <div class="card-body">
                    <?php foreach ($service_preferences as $service): ?>
                        <div class="mb-3">
                            <div class="d-flex justify-content-between align-items-center">
                                <span><?php echo htmlspecialchars($service['laundry_type']); ?></span>
                                <div>
                                    <span class="badge bg-primary me-2"><?php echo $service['count']; ?> orders</span>
                                    <span class="text-success fw-bold"><?php echo format_currency($service['total_spent']); ?></span>
                                </div>
                            </div>
                            <div class="progress mt-1">
                                <div class="progress-bar" style="width: <?php echo ($service['count'] / max(array_column($service_preferences, 'count'))) * 100; ?>%"></div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            </div>
        <?php endif; ?>
        
        <!-- Recent Orders -->
        <div class="card">
            <div class="card-header d-flex justify-content-between align-items-center">
                <h5 class="mb-0">
                    <i class="bi bi-clock-history me-2"></i>Recent Orders
                </h5>
                <a href="requests.php?user_id=<?php echo $user['id']; ?>" class="btn btn-sm btn-outline-primary">View All</a>
            </div>
            <div class="card-body">
                <?php if (empty($recent_requests)): ?>
                    <div class="text-center py-4">
                        <i class="bi bi-inbox text-muted" style="font-size: 3rem;"></i>
                        <h6 class="text-muted mt-3">No orders yet</h6>
                        <p class="text-muted">This customer hasn't placed any orders</p>
                    </div>
                <?php else: ?>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Request #</th>
                                    <th>Service</th>
                                    <th>Amount</th>
                                    <th>Status</th>
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
                                        <td><?php echo htmlspecialchars($request['laundry_type']); ?></td>
                                        <td><?php echo format_currency($request['total_amount']); ?></td>
                                        <td>
                                            <span class="badge <?php echo get_status_badge_class($request['status']); ?>">
                                                <?php echo ucfirst(str_replace('_', ' ', $request['status'])); ?>
                                            </span>
                                        </td>
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
                    <a href="mailto:<?php echo htmlspecialchars($user['email']); ?>" class="btn btn-outline-primary">
                        <i class="bi bi-envelope me-2"></i>Send Email
                    </a>
                    <a href="tel:<?php echo htmlspecialchars($user['phone']); ?>" class="btn btn-outline-success">
                        <i class="bi bi-telephone me-2"></i>Call Customer
                    </a>
                    <a href="requests.php?user_id=<?php echo $user['id']; ?>" class="btn btn-outline-info">
                        <i class="bi bi-list me-2"></i>View All Orders
                    </a>
                    <form method="POST" action="users.php" class="d-inline">
                        <input type="hidden" name="action" value="toggle_status">
                        <input type="hidden" name="user_id" value="<?php echo $user['id']; ?>">
                        <button type="submit" 
                                class="btn btn-outline-<?php echo $user['status'] === 'active' ? 'warning' : 'success'; ?> w-100"
                                onclick="return confirm('Are you sure you want to <?php echo $user['status'] === 'active' ? 'deactivate' : 'activate'; ?> this user?')">
                            <i class="bi bi-<?php echo $user['status'] === 'active' ? 'pause' : 'play'; ?> me-2"></i>
                            <?php echo $user['status'] === 'active' ? 'Deactivate' : 'Activate'; ?> User
                        </button>
                    </form>
                </div>
            </div>
        </div>
        
        <!-- Customer Insights -->
        <div class="card mb-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-lightbulb me-2"></i>Customer Insights
                </h5>
            </div>
            <div class="card-body">
                <?php if ($stats['total_requests'] > 0): ?>
                    <div class="mb-3">
                        <h6 class="text-muted">Customer Type</h6>
                        <p class="mb-0">
                            <?php 
                            if ($stats['total_requests'] >= 10) {
                                echo '<span class="badge bg-success">Loyal Customer</span>';
                            } elseif ($stats['total_requests'] >= 5) {
                                echo '<span class="badge bg-primary">Regular Customer</span>';
                            } elseif ($stats['total_requests'] >= 2) {
                                echo '<span class="badge bg-info">Returning Customer</span>';
                            } else {
                                echo '<span class="badge bg-secondary">New Customer</span>';
                            }
                            ?>
                        </p>
                    </div>
                    
                    <div class="mb-3">
                        <h6 class="text-muted">Value Segment</h6>
                        <p class="mb-0">
                            <?php 
                            $total_spent = $stats['total_spent'];
                            if ($total_spent >= 500) {
                                echo '<span class="badge bg-warning">High Value</span>';
                            } elseif ($total_spent >= 200) {
                                echo '<span class="badge bg-info">Medium Value</span>';
                            } else {
                                echo '<span class="badge bg-secondary">Low Value</span>';
                            }
                            ?>
                        </p>
                    </div>
                    
                    <?php if (!empty($service_preferences)): ?>
                        <div class="mb-3">
                            <h6 class="text-muted">Preferred Service</h6>
                            <p class="mb-0"><?php echo htmlspecialchars($service_preferences[0]['laundry_type']); ?></p>
                        </div>
                    <?php endif; ?>
                    
                    <div>
                        <h6 class="text-muted">Activity Level</h6>
                        <p class="mb-0">
                            <?php 
                            $days_since_last = $stats['last_order_date'] ? 
                                (time() - strtotime($stats['last_order_date'])) / (60 * 60 * 24) : 999;
                            
                            if ($days_since_last <= 7) {
                                echo '<span class="badge bg-success">Very Active</span>';
                            } elseif ($days_since_last <= 30) {
                                echo '<span class="badge bg-primary">Active</span>';
                            } elseif ($days_since_last <= 90) {
                                echo '<span class="badge bg-warning">Inactive</span>';
                            } else {
                                echo '<span class="badge bg-danger">Dormant</span>';
                            }
                            ?>
                        </p>
                    </div>
                <?php else: ?>
                    <p class="text-muted mb-0">No order history available for insights.</p>
                <?php endif; ?>
            </div>
        </div>
        
        <!-- Account Information -->
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-info-circle me-2"></i>Account Information
                </h5>
            </div>
            <div class="card-body">
                <div class="mb-3">
                    <h6 class="text-muted">User ID</h6>
                    <p class="mb-0"><?php echo $user['id']; ?></p>
                </div>
                
                <div class="mb-3">
                    <h6 class="text-muted">Account Type</h6>
                    <p class="mb-0">
                        <span class="badge bg-primary"><?php echo ucfirst($user['user_type']); ?></span>
                    </p>
                </div>
                
                <div class="mb-3">
                    <h6 class="text-muted">Registration Date</h6>
                    <p class="mb-0"><?php echo format_datetime($user['created_at']); ?></p>
                </div>
                
                <div>
                    <h6 class="text-muted">Last Profile Update</h6>
                    <p class="mb-0"><?php echo format_datetime($user['updated_at']); ?></p>
                </div>
            </div>
        </div>
    </div>
</div>

<?php include '../includes/footer.php'; ?>

