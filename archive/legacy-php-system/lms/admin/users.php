<?php
require_once '../config/config.php';
require_admin();

$page_title = 'Manage Users';

// Pagination settings
$page = max(1, intval($_GET['page'] ?? 1));
$limit = RECORDS_PER_PAGE;
$offset = ($page - 1) * $limit;

// Filter settings
$status_filter = sanitize_input($_GET['status'] ?? '');
$search_query = sanitize_input($_GET['search'] ?? '');

// Build WHERE clause
$where_conditions = ["user_type = 'user'"];
$params = [];

if (!empty($status_filter)) {
    $where_conditions[] = 'status = ?';
    $params[] = $status_filter;
}

if (!empty($search_query)) {
    $where_conditions[] = '(first_name LIKE ? OR last_name LIKE ? OR email LIKE ? OR phone LIKE ?)';
    $search_param = "%{$search_query}%";
    $params[] = $search_param;
    $params[] = $search_param;
    $params[] = $search_param;
    $params[] = $search_param;
}

$where_clause = 'WHERE ' . implode(' AND ', $where_conditions);

// Handle user actions
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    $user_id = intval($_POST['user_id'] ?? 0);
    
    if ($action === 'toggle_status' && $user_id > 0) {
        try {
            $stmt = $pdo->prepare("SELECT status FROM users WHERE id = ? AND user_type = 'user'");
            $stmt->execute([$user_id]);
            $user = $stmt->fetch();
            
            if ($user) {
                $new_status = $user['status'] === 'active' ? 'inactive' : 'active';
                $stmt = $pdo->prepare("UPDATE users SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?");
                
                if ($stmt->execute([$new_status, $user_id])) {
                    // Send notification to user
                    $message = $new_status === 'active' ? 'Your account has been activated.' : 'Your account has been deactivated.';
                    send_notification($user_id, 'Account Status Updated', $message, $new_status === 'active' ? 'success' : 'warning');
                    
                    $_SESSION['success_message'] = "User status updated to {$new_status}.";
                } else {
                    $_SESSION['error_message'] = 'Failed to update user status.';
                }
            }
        } catch (PDOException $e) {
            error_log("User status update error: " . $e->getMessage());
            $_SESSION['error_message'] = 'Failed to update user status.';
        }
        
        header('Location: users.php?' . http_build_query($_GET));
        exit();
    }
}

try {
    // Get total count
    $count_sql = "SELECT COUNT(*) FROM users {$where_clause}";
    $stmt = $pdo->prepare($count_sql);
    $stmt->execute($params);
    $total_records = $stmt->fetchColumn();
    
    // Get users with request statistics
    $sql = "
        SELECT u.*, 
               COUNT(lr.id) as total_requests,
               SUM(CASE WHEN lr.payment_status = 'paid' THEN lr.total_amount ELSE 0 END) as total_spent,
               MAX(lr.created_at) as last_request_date
        FROM users u 
        LEFT JOIN laundry_requests lr ON u.id = lr.user_id 
        {$where_clause}
        GROUP BY u.id
        ORDER BY u.created_at DESC 
        LIMIT {$limit} OFFSET {$offset}
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $users = $stmt->fetchAll();
    
    // Calculate pagination
    $total_pages = ceil($total_records / $limit);
    
    // Get summary statistics
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE user_type = 'user' AND status = 'active'");
    $stmt->execute();
    $active_users = $stmt->fetchColumn();
    
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE user_type = 'user' AND status = 'inactive'");
    $stmt->execute();
    $inactive_users = $stmt->fetchColumn();
    
} catch (PDOException $e) {
    error_log("Users fetch error: " . $e->getMessage());
    $users = [];
    $total_records = 0;
    $total_pages = 0;
    $active_users = $inactive_users = 0;
}

include '../includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h2>
        <i class="bi bi-people me-2"></i>Manage Users
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
                <h3 class="text-primary"><?php echo $total_records; ?></h3>
                <p class="text-muted mb-0">Total Users</p>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card text-center">
            <div class="card-body">
                <h3 class="text-success"><?php echo $active_users; ?></h3>
                <p class="text-muted mb-0">Active Users</p>
            </div>
        </div>
    </div>
    <div class="col-md-4">
        <div class="card text-center">
            <div class="card-body">
                <h3 class="text-warning"><?php echo $inactive_users; ?></h3>
                <p class="text-muted mb-0">Inactive Users</p>
            </div>
        </div>
    </div>
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
                           placeholder="Name, email, phone...">
                </div>
            </div>
            <div class="col-md-3">
                <label for="status" class="form-label">Status</label>
                <select class="form-select" id="status" name="status">
                    <option value="">All Status</option>
                    <option value="active" <?php echo $status_filter === 'active' ? 'selected' : ''; ?>>Active</option>
                    <option value="inactive" <?php echo $status_filter === 'inactive' ? 'selected' : ''; ?>>Inactive</option>
                </select>
            </div>
            <div class="col-md-3 d-flex align-items-end">
                <button type="submit" class="btn btn-primary me-2">
                    <i class="bi bi-funnel me-1"></i>Filter
                </button>
                <a href="users.php" class="btn btn-outline-secondary">
                    <i class="bi bi-x-circle me-1"></i>Clear
                </a>
            </div>
            <div class="col-md-2 d-flex align-items-end">
                <button type="button" class="btn btn-outline-success" onclick="exportTableToCSV('usersTable', 'users.csv')">
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
        of <?php echo $total_records; ?> users
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

<!-- Users Table -->
<div class="card">
    <div class="card-body">
        <?php if (empty($users)): ?>
            <div class="text-center py-5">
                <i class="bi bi-people text-muted" style="font-size: 4rem;"></i>
                <h4 class="text-muted mt-3">No users found</h4>
                <?php if (!empty($search_query) || !empty($status_filter)): ?>
                    <p class="text-muted">Try adjusting your search criteria or filters</p>
                    <a href="users.php" class="btn btn-outline-primary">Clear Filters</a>
                <?php else: ?>
                    <p class="text-muted">No users have registered yet</p>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <div class="table-responsive">
                <table class="table table-hover" id="usersTable">
                    <thead>
                        <tr>
                            <th>User</th>
                            <th>Contact</th>
                            <th>Status</th>
                            <th>Requests</th>
                            <th>Total Spent</th>
                            <th>Last Request</th>
                            <th>Joined</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach ($users as $user): ?>
                            <tr>
                                <td>
                                    <div class="d-flex align-items-center">
                                        <div class="avatar-circle me-3">
                                            <?php echo strtoupper(substr($user['first_name'], 0, 1) . substr($user['last_name'], 0, 1)); ?>
                                        </div>
                                        <div>
                                            <h6 class="mb-0"><?php echo htmlspecialchars($user['first_name'] . ' ' . $user['last_name']); ?></h6>
                                            <small class="text-muted">ID: <?php echo $user['id']; ?></small>
                                        </div>
                                    </div>
                                </td>
                                <td>
                                    <div>
                                        <i class="bi bi-envelope me-1"></i>
                                        <a href="mailto:<?php echo htmlspecialchars($user['email']); ?>" class="text-decoration-none">
                                            <?php echo htmlspecialchars($user['email']); ?>
                                        </a>
                                    </div>
                                    <div class="mt-1">
                                        <i class="bi bi-telephone me-1"></i>
                                        <a href="tel:<?php echo htmlspecialchars($user['phone']); ?>" class="text-decoration-none">
                                            <?php echo htmlspecialchars($user['phone']); ?>
                                        </a>
                                    </div>
                                </td>
                                <td>
                                    <span class="badge <?php echo get_status_badge_class($user['status']); ?>">
                                        <?php echo ucfirst($user['status']); ?>
                                    </span>
                                </td>
                                <td>
                                    <span class="fw-bold"><?php echo $user['total_requests']; ?></span>
                                    <?php if ($user['total_requests'] > 0): ?>
                                        <br>
                                        <a href="requests.php?user_id=<?php echo $user['id']; ?>" class="small text-decoration-none">
                                            View requests
                                        </a>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <span class="fw-bold text-success"><?php echo format_currency($user['total_spent']); ?></span>
                                </td>
                                <td>
                                    <?php if ($user['last_request_date']): ?>
                                        <?php echo format_date($user['last_request_date']); ?>
                                        <br>
                                        <small class="text-muted"><?php echo date('g:i A', strtotime($user['last_request_date'])); ?></small>
                                    <?php else: ?>
                                        <span class="text-muted">Never</span>
                                    <?php endif; ?>
                                </td>
                                <td>
                                    <?php echo format_date($user['created_at']); ?>
                                    <br>
                                    <small class="text-muted"><?php echo date('g:i A', strtotime($user['created_at'])); ?></small>
                                </td>
                                <td>
                                    <div class="btn-group btn-group-sm">
                                        <a href="user-details.php?id=<?php echo $user['id']; ?>" 
                                           class="btn btn-outline-primary" title="View Details">
                                            <i class="bi bi-eye"></i>
                                        </a>
                                        <form method="POST" class="d-inline">
                                            <input type="hidden" name="action" value="toggle_status">
                                            <input type="hidden" name="user_id" value="<?php echo $user['id']; ?>">
                                            <button type="submit" 
                                                    class="btn btn-outline-<?php echo $user['status'] === 'active' ? 'warning' : 'success'; ?>" 
                                                    title="<?php echo $user['status'] === 'active' ? 'Deactivate' : 'Activate'; ?> User"
                                                    onclick="return confirm('Are you sure you want to <?php echo $user['status'] === 'active' ? 'deactivate' : 'activate'; ?> this user?')">
                                                <i class="bi bi-<?php echo $user['status'] === 'active' ? 'pause' : 'play'; ?>"></i>
                                            </button>
                                        </form>
                                    </div>
                                </td>
                            </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            
            <!-- Pagination -->
            <?php if ($total_pages > 1): ?>
                <nav aria-label="Users pagination" class="mt-4">
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

<style>
.avatar-circle {
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--primary-color), #0056b3);
    color: white;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: bold;
    font-size: 0.9rem;
}
</style>

