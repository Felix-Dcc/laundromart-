<?php
require_once 'config/config.php';
require_login();

$page_title = 'Notifications';

// Pagination settings
$page = max(1, intval($_GET['page'] ?? 1));
$limit = RECORDS_PER_PAGE;
$offset = ($page - 1) * $limit;

// Filter settings
$type_filter = sanitize_input($_GET['type'] ?? '');
$read_filter = sanitize_input($_GET['read'] ?? '');

// Build WHERE clause
$where_conditions = ['user_id = ?'];
$params = [$_SESSION['user_id']];

if (!empty($type_filter)) {
    $where_conditions[] = 'type = ?';
    $params[] = $type_filter;
}

if ($read_filter !== '') {
    $where_conditions[] = 'is_read = ?';
    $params[] = $read_filter === 'read' ? 1 : 0;
}

$where_clause = 'WHERE ' . implode(' AND ', $where_conditions);

// Mark notification as read if requested
if (isset($_GET['mark_read']) && is_numeric($_GET['mark_read'])) {
    try {
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = TRUE WHERE id = ? AND user_id = ?");
        $stmt->execute([$_GET['mark_read'], $_SESSION['user_id']]);
    } catch (PDOException $e) {
        error_log("Mark read error: " . $e->getMessage());
    }
}

// Mark all as read if requested
if (isset($_GET['mark_all_read'])) {
    try {
        $stmt = $pdo->prepare("UPDATE notifications SET is_read = TRUE WHERE user_id = ?");
        $stmt->execute([$_SESSION['user_id']]);
        $_SESSION['success_message'] = 'All notifications marked as read.';
        header('Location: notifications.php');
        exit();
    } catch (PDOException $e) {
        error_log("Mark all read error: " . $e->getMessage());
        $_SESSION['error_message'] = 'Failed to mark notifications as read.';
    }
}

try {
    // Get total count
    $count_sql = "SELECT COUNT(*) FROM notifications {$where_clause}";
    $stmt = $pdo->prepare($count_sql);
    $stmt->execute($params);
    $total_records = $stmt->fetchColumn();
    
    // Get notifications
    $sql = "
        SELECT * FROM notifications 
        {$where_clause}
        ORDER BY created_at DESC 
        LIMIT {$limit} OFFSET {$offset}
    ";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $notifications = $stmt->fetchAll();
    
    // Calculate pagination
    $total_pages = ceil($total_records / $limit);
    
    // Get unread count
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = FALSE");
    $stmt->execute([$_SESSION['user_id']]);
    $unread_count = $stmt->fetchColumn();
    
} catch (PDOException $e) {
    error_log("Notifications fetch error: " . $e->getMessage());
    $notifications = [];
    $total_records = 0;
    $total_pages = 0;
    $unread_count = 0;
}

include 'includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <div>
        <h2>
            <i class="bi bi-bell me-2"></i>Notifications
            <?php if ($unread_count > 0): ?>
                <span class="badge bg-danger"><?php echo $unread_count; ?></span>
            <?php endif; ?>
        </h2>
    </div>
    <div>
        <?php if ($unread_count > 0): ?>
            <a href="?mark_all_read=1" class="btn btn-outline-primary me-2">
                <i class="bi bi-check-all me-1"></i>Mark All Read
            </a>
        <?php endif; ?>
        <a href="<?php echo is_admin() ? 'admin/dashboard.php' : 'user/dashboard.php'; ?>" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-2"></i>Back to Dashboard
        </a>
    </div>
</div>

<!-- Filters -->
<div class="card mb-4">
    <div class="card-body">
        <form method="GET" class="row g-3">
            <div class="col-md-3">
                <label for="type" class="form-label">Type</label>
                <select class="form-select" id="type" name="type">
                    <option value="">All Types</option>
                    <option value="info" <?php echo $type_filter === 'info' ? 'selected' : ''; ?>>Info</option>
                    <option value="success" <?php echo $type_filter === 'success' ? 'selected' : ''; ?>>Success</option>
                    <option value="warning" <?php echo $type_filter === 'warning' ? 'selected' : ''; ?>>Warning</option>
                    <option value="error" <?php echo $type_filter === 'error' ? 'selected' : ''; ?>>Error</option>
                </select>
            </div>
            <div class="col-md-3">
                <label for="read" class="form-label">Status</label>
                <select class="form-select" id="read" name="read">
                    <option value="">All</option>
                    <option value="unread" <?php echo $read_filter === 'unread' ? 'selected' : ''; ?>>Unread</option>
                    <option value="read" <?php echo $read_filter === 'read' ? 'selected' : ''; ?>>Read</option>
                </select>
            </div>
            <div class="col-md-3 d-flex align-items-end">
                <button type="submit" class="btn btn-primary me-2">
                    <i class="bi bi-funnel me-1"></i>Filter
                </button>
                <a href="notifications.php" class="btn btn-outline-secondary">
                    <i class="bi bi-x-circle me-1"></i>Clear
                </a>
            </div>
        </form>
    </div>
</div>

<!-- Results Summary -->
<div class="d-flex justify-content-between align-items-center mb-3">
    <p class="text-muted mb-0">
        Showing <?php echo min($offset + 1, $total_records); ?> to <?php echo min($offset + $limit, $total_records); ?> 
        of <?php echo $total_records; ?> notifications
    </p>
    <?php if (!empty($type_filter) || !empty($read_filter)): ?>
        <small class="text-muted">
            Filtered by: 
            <?php if (!empty($type_filter)): ?>
                Type: <?php echo ucfirst($type_filter); ?>
            <?php endif; ?>
            <?php if (!empty($read_filter)): ?>
                Status: <?php echo ucfirst($read_filter); ?>
            <?php endif; ?>
        </small>
    <?php endif; ?>
</div>

<!-- Notifications List -->
<div class="card">
    <div class="card-body">
        <?php if (empty($notifications)): ?>
            <div class="text-center py-5">
                <i class="bi bi-bell-slash text-muted" style="font-size: 4rem;"></i>
                <h4 class="text-muted mt-3">No notifications found</h4>
                <?php if (!empty($type_filter) || !empty($read_filter)): ?>
                    <p class="text-muted">Try adjusting your filters</p>
                    <a href="notifications.php" class="btn btn-outline-primary">Clear Filters</a>
                <?php else: ?>
                    <p class="text-muted">You don't have any notifications yet</p>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <div class="list-group list-group-flush">
                <?php foreach ($notifications as $notification): ?>
                    <div class="list-group-item border-0 px-0 py-3 <?php echo !$notification['is_read'] ? 'bg-light' : ''; ?>">
                        <div class="d-flex w-100 justify-content-between align-items-start">
                            <div class="flex-grow-1">
                                <div class="d-flex align-items-center mb-2">
                                    <?php
                                    $type_icons = [
                                        'info' => 'info-circle text-info',
                                        'success' => 'check-circle text-success',
                                        'warning' => 'exclamation-triangle text-warning',
                                        'error' => 'x-circle text-danger'
                                    ];
                                    $icon_class = $type_icons[$notification['type']] ?? 'bell text-secondary';
                                    ?>
                                    <i class="bi bi-<?php echo $icon_class; ?> me-2"></i>
                                    <h6 class="mb-0 <?php echo !$notification['is_read'] ? 'fw-bold' : ''; ?>">
                                        <?php echo htmlspecialchars($notification['title']); ?>
                                    </h6>
                                    <?php if (!$notification['is_read']): ?>
                                        <span class="badge bg-primary ms-2">New</span>
                                    <?php endif; ?>
                                </div>
                                <p class="mb-2 text-muted"><?php echo htmlspecialchars($notification['message']); ?></p>
                                <small class="text-muted">
                                    <i class="bi bi-clock me-1"></i>
                                    <?php echo format_datetime($notification['created_at']); ?>
                                </small>
                            </div>
                            <div class="ms-3">
                                <?php if (!$notification['is_read']): ?>
                                    <a href="?mark_read=<?php echo $notification['id']; ?>&<?php echo http_build_query($_GET); ?>" 
                                       class="btn btn-sm btn-outline-primary" title="Mark as read">
                                        <i class="bi bi-check"></i>
                                    </a>
                                <?php endif; ?>
                            </div>
                        </div>
                    </div>
                <?php endforeach; ?>
            </div>
            
            <!-- Pagination -->
            <?php if ($total_pages > 1): ?>
                <nav aria-label="Notifications pagination" class="mt-4">
                    <ul class="pagination justify-content-center">
                        <?php if ($page > 1): ?>
                            <li class="page-item">
                                <a class="page-link" href="?page=<?php echo $page - 1; ?>&type=<?php echo urlencode($type_filter); ?>&read=<?php echo urlencode($read_filter); ?>">
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
                                <a class="page-link" href="?page=<?php echo $i; ?>&type=<?php echo urlencode($type_filter); ?>&read=<?php echo urlencode($read_filter); ?>">
                                    <?php echo $i; ?>
                                </a>
                            </li>
                        <?php endfor; ?>
                        
                        <?php if ($page < $total_pages): ?>
                            <li class="page-item">
                                <a class="page-link" href="?page=<?php echo $page + 1; ?>&type=<?php echo urlencode($type_filter); ?>&read=<?php echo urlencode($read_filter); ?>">
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

<?php include 'includes/footer.php'; ?>

