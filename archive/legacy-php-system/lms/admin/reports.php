<?php
require_once '../config/config.php';
require_admin();

$page_title = 'Reports & Analytics';

// Date range settings
$date_from = sanitize_input($_GET['date_from'] ?? date('Y-m-01')); // First day of current month
$date_to = sanitize_input($_GET['date_to'] ?? date('Y-m-d')); // Today
$report_type = sanitize_input($_GET['report_type'] ?? 'overview');

try {
    // Overview Statistics
    if ($report_type === 'overview') {
        // Total requests in date range
        $stmt = $pdo->prepare("
            SELECT COUNT(*) as total_requests,
                   SUM(CASE WHEN payment_status = 'paid' THEN total_amount ELSE 0 END) as total_revenue,
                   AVG(total_amount) as avg_order_value,
                   COUNT(DISTINCT user_id) as unique_customers
            FROM laundry_requests 
            WHERE DATE(created_at) BETWEEN ? AND ?
        ");
        $stmt->execute([$date_from, $date_to]);
        $overview = $stmt->fetch();
        
        // Status breakdown
        $stmt = $pdo->prepare("
            SELECT status, COUNT(*) as count 
            FROM laundry_requests 
            WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY status
        ");
        $stmt->execute([$date_from, $date_to]);
        $status_breakdown = $stmt->fetchAll();
        
        // Service type breakdown
        $stmt = $pdo->prepare("
            SELECT laundry_type, COUNT(*) as count, SUM(total_amount) as revenue
            FROM laundry_requests 
            WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY laundry_type
            ORDER BY count DESC
        ");
        $stmt->execute([$date_from, $date_to]);
        $service_breakdown = $stmt->fetchAll();
        
        // Daily trends
        $stmt = $pdo->prepare("
            SELECT DATE(created_at) as date, 
                   COUNT(*) as requests,
                   SUM(total_amount) as revenue
            FROM laundry_requests 
            WHERE DATE(created_at) BETWEEN ? AND ?
            GROUP BY DATE(created_at)
            ORDER BY date ASC
        ");
        $stmt->execute([$date_from, $date_to]);
        $daily_trends = $stmt->fetchAll();
    }
    
    // Monthly Report
    elseif ($report_type === 'monthly') {
        $stmt = $pdo->prepare("
            SELECT DATE_FORMAT(created_at, '%Y-%m') as month,
                   COUNT(*) as requests,
                   SUM(total_amount) as revenue,
                   COUNT(DISTINCT user_id) as unique_customers,
                   AVG(total_amount) as avg_order_value
            FROM laundry_requests 
            WHERE created_at >= DATE_SUB(CURRENT_DATE(), INTERVAL 12 MONTH)
            GROUP BY DATE_FORMAT(created_at, '%Y-%m')
            ORDER BY month DESC
        ");
        $stmt->execute();
        $monthly_data = $stmt->fetchAll();
    }
    
    // Customer Report
    elseif ($report_type === 'customers') {
        $stmt = $pdo->prepare("
            SELECT u.id, u.first_name, u.last_name, u.email,
                   COUNT(lr.id) as total_requests,
                   SUM(CASE WHEN lr.payment_status = 'paid' THEN lr.total_amount ELSE 0 END) as total_spent,
                   MAX(lr.created_at) as last_order_date,
                   MIN(lr.created_at) as first_order_date
            FROM users u
            LEFT JOIN laundry_requests lr ON u.id = lr.user_id 
                AND DATE(lr.created_at) BETWEEN ? AND ?
            WHERE u.user_type = 'user'
            GROUP BY u.id
            HAVING total_requests > 0
            ORDER BY total_spent DESC
        ");
        $stmt->execute([$date_from, $date_to]);
        $customer_data = $stmt->fetchAll();
    }
    
} catch (PDOException $e) {
    error_log("Reports error: " . $e->getMessage());
    $overview = $status_breakdown = $service_breakdown = $daily_trends = [];
    $monthly_data = $customer_data = [];
}

include '../includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h2>
        <i class="bi bi-graph-up me-2"></i>Reports & Analytics
    </h2>
    <a href="dashboard.php" class="btn btn-outline-secondary">
        <i class="bi bi-arrow-left me-2"></i>Back to Dashboard
    </a>
</div>

<!-- Report Controls -->
<div class="card mb-4">
    <div class="card-body">
        <form method="GET" class="row g-3">
            <div class="col-md-3">
                <label for="report_type" class="form-label">Report Type</label>
                <select class="form-select" id="report_type" name="report_type">
                    <option value="overview" <?php echo $report_type === 'overview' ? 'selected' : ''; ?>>Overview</option>
                    <option value="monthly" <?php echo $report_type === 'monthly' ? 'selected' : ''; ?>>Monthly Trends</option>
                    <option value="customers" <?php echo $report_type === 'customers' ? 'selected' : ''; ?>>Customer Analysis</option>
                </select>
            </div>
            <?php if ($report_type !== 'monthly'): ?>
            <div class="col-md-3">
                <label for="date_from" class="form-label">From Date</label>
                <input type="date" class="form-control" id="date_from" name="date_from" 
                       value="<?php echo htmlspecialchars($date_from); ?>">
            </div>
            <div class="col-md-3">
                <label for="date_to" class="form-label">To Date</label>
                <input type="date" class="form-control" id="date_to" name="date_to" 
                       value="<?php echo htmlspecialchars($date_to); ?>">
            </div>
            <?php endif; ?>
            <div class="col-md-3 d-flex align-items-end">
                <button type="submit" class="btn btn-primary me-2">
                    <i class="bi bi-search me-1"></i>Generate Report
                </button>
                <button type="button" class="btn btn-outline-success" onclick="exportReport()">
                    <i class="bi bi-download me-1"></i>Export
                </button>
            </div>
        </form>
    </div>
</div>

<?php if ($report_type === 'overview'): ?>
    <!-- Overview Report -->
    <div class="row g-4 mb-4">
        <div class="col-md-3">
            <div class="card text-center">
                <div class="card-body">
                    <h3 class="text-primary"><?php echo $overview['total_requests'] ?? 0; ?></h3>
                    <p class="text-muted mb-0">Total Requests</p>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center">
                <div class="card-body">
                    <h3 class="text-success"><?php echo format_currency($overview['total_revenue'] ?? 0); ?></h3>
                    <p class="text-muted mb-0">Total Revenue</p>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center">
                <div class="card-body">
                    <h3 class="text-info"><?php echo format_currency($overview['avg_order_value'] ?? 0); ?></h3>
                    <p class="text-muted mb-0">Avg Order Value</p>
                </div>
            </div>
        </div>
        <div class="col-md-3">
            <div class="card text-center">
                <div class="card-body">
                    <h3 class="text-warning"><?php echo $overview['unique_customers'] ?? 0; ?></h3>
                    <p class="text-muted mb-0">Unique Customers</p>
                </div>
            </div>
        </div>
    </div>
    
    <div class="row g-4">
        <!-- Status Breakdown -->
        <div class="col-lg-6">
            <div class="card">
                <div class="card-header">
                    <h5 class="mb-0">Request Status Breakdown</h5>
                </div>
                <div class="card-body">
                    <?php if (empty($status_breakdown)): ?>
                        <p class="text-muted">No data available for the selected period.</p>
                    <?php else: ?>
                        <?php foreach ($status_breakdown as $status): ?>
                            <div class="mb-3">
                                <div class="d-flex justify-content-between">
                                    <span><?php echo ucfirst(str_replace('_', ' ', $status['status'])); ?></span>
                                    <span class="fw-bold"><?php echo $status['count']; ?></span>
                                </div>
                                <div class="progress">
                                    <div class="progress-bar <?php echo get_status_badge_class($status['status']); ?>" 
                                         style="width: <?php echo ($status['count'] / max(array_column($status_breakdown, 'count'))) * 100; ?>%"></div>
                                </div>
                            </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        
        <!-- Service Type Breakdown -->
        <div class="col-lg-6">
            <div class="card">
                <div class="card-header">
                    <h5 class="mb-0">Popular Services</h5>
                </div>
                <div class="card-body">
                    <?php if (empty($service_breakdown)): ?>
                        <p class="text-muted">No data available for the selected period.</p>
                    <?php else: ?>
                        <?php foreach ($service_breakdown as $service): ?>
                            <div class="mb-3">
                                <div class="d-flex justify-content-between">
                                    <span><?php echo htmlspecialchars($service['laundry_type']); ?></span>
                                    <span class="fw-bold"><?php echo $service['count']; ?></span>
                                </div>
                                <div class="progress">
                                    <div class="progress-bar bg-primary" 
                                         style="width: <?php echo ($service['count'] / max(array_column($service_breakdown, 'count'))) * 100; ?>%"></div>
                                </div>
                                <small class="text-muted"><?php echo format_currency($service['revenue']); ?> revenue</small>
                            </div>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Daily Trends Chart -->
    <?php if (!empty($daily_trends)): ?>
    <div class="card mt-4">
        <div class="card-header">
            <h5 class="mb-0">Daily Trends</h5>
        </div>
        <div class="card-body">
            <canvas id="dailyTrendsChart" width="400" height="100"></canvas>
        </div>
    </div>
    <?php endif; ?>

<?php elseif ($report_type === 'monthly'): ?>
    <!-- Monthly Report -->
    <div class="card">
        <div class="card-header">
            <h5 class="mb-0">Monthly Performance (Last 12 Months)</h5>
        </div>
        <div class="card-body">
            <?php if (empty($monthly_data)): ?>
                <p class="text-muted">No monthly data available.</p>
            <?php else: ?>
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Month</th>
                                <th>Requests</th>
                                <th>Revenue</th>
                                <th>Unique Customers</th>
                                <th>Avg Order Value</th>
                                <th>Growth</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php 
                            $prev_revenue = 0;
                            foreach ($monthly_data as $index => $month): 
                                $growth = $prev_revenue > 0 ? (($month['revenue'] - $prev_revenue) / $prev_revenue) * 100 : 0;
                                $prev_revenue = $month['revenue'];
                            ?>
                                <tr>
                                    <td><?php echo date('F Y', strtotime($month['month'] . '-01')); ?></td>
                                    <td><?php echo $month['requests']; ?></td>
                                    <td><?php echo format_currency($month['revenue']); ?></td>
                                    <td><?php echo $month['unique_customers']; ?></td>
                                    <td><?php echo format_currency($month['avg_order_value']); ?></td>
                                    <td>
                                        <?php if ($index > 0): ?>
                                            <span class="badge <?php echo $growth >= 0 ? 'bg-success' : 'bg-danger'; ?>">
                                                <?php echo ($growth >= 0 ? '+' : '') . number_format($growth, 1); ?>%
                                            </span>
                                        <?php else: ?>
                                            <span class="text-muted">-</span>
                                        <?php endif; ?>
                                    </td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </div>
    </div>

<?php elseif ($report_type === 'customers'): ?>
    <!-- Customer Report -->
    <div class="card">
        <div class="card-header">
            <h5 class="mb-0">Customer Analysis</h5>
        </div>
        <div class="card-body">
            <?php if (empty($customer_data)): ?>
                <p class="text-muted">No customer data available for the selected period.</p>
            <?php else: ?>
                <div class="table-responsive">
                    <table class="table table-hover">
                        <thead>
                            <tr>
                                <th>Customer</th>
                                <th>Email</th>
                                <th>Total Requests</th>
                                <th>Total Spent</th>
                                <th>Avg Order Value</th>
                                <th>First Order</th>
                                <th>Last Order</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($customer_data as $customer): ?>
                                <tr>
                                    <td>
                                        <a href="user-details.php?id=<?php echo $customer['id']; ?>" class="text-decoration-none">
                                            <?php echo htmlspecialchars($customer['first_name'] . ' ' . $customer['last_name']); ?>
                                        </a>
                                    </td>
                                    <td><?php echo htmlspecialchars($customer['email']); ?></td>
                                    <td><?php echo $customer['total_requests']; ?></td>
                                    <td><?php echo format_currency($customer['total_spent']); ?></td>
                                    <td><?php echo format_currency($customer['total_spent'] / max(1, $customer['total_requests'])); ?></td>
                                    <td><?php echo $customer['first_order_date'] ? format_date($customer['first_order_date']) : '-'; ?></td>
                                    <td><?php echo $customer['last_order_date'] ? format_date($customer['last_order_date']) : '-'; ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </div>
    </div>
<?php endif; ?>

<?php include '../includes/footer.php'; ?>

<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
// Daily trends chart
<?php if ($report_type === 'overview' && !empty($daily_trends)): ?>
const ctx = document.getElementById('dailyTrendsChart').getContext('2d');
const dailyTrendsChart = new Chart(ctx, {
    type: 'line',
    data: {
        labels: [<?php echo implode(',', array_map(function($d) { return '"' . date('M j', strtotime($d['date'])) . '"'; }, $daily_trends)); ?>],
        datasets: [{
            label: 'Requests',
            data: [<?php echo implode(',', array_column($daily_trends, 'requests')); ?>],
            borderColor: 'rgb(75, 192, 192)',
            backgroundColor: 'rgba(75, 192, 192, 0.1)',
            tension: 0.1,
            yAxisID: 'y'
        }, {
            label: 'Revenue ($)',
            data: [<?php echo implode(',', array_column($daily_trends, 'revenue')); ?>],
            borderColor: 'rgb(255, 99, 132)',
            backgroundColor: 'rgba(255, 99, 132, 0.1)',
            tension: 0.1,
            yAxisID: 'y1'
        }]
    },
    options: {
        responsive: true,
        interaction: {
            mode: 'index',
            intersect: false,
        },
        scales: {
            x: {
                display: true,
                title: {
                    display: true,
                    text: 'Date'
                }
            },
            y: {
                type: 'linear',
                display: true,
                position: 'left',
                title: {
                    display: true,
                    text: 'Requests'
                }
            },
            y1: {
                type: 'linear',
                display: true,
                position: 'right',
                title: {
                    display: true,
                    text: 'Revenue ($)'
                },
                grid: {
                    drawOnChartArea: false,
                },
            }
        }
    }
});
<?php endif; ?>

// Export function
function exportReport() {
    const reportType = '<?php echo $report_type; ?>';
    const dateFrom = '<?php echo $date_from; ?>';
    const dateTo = '<?php echo $date_to; ?>';
    
    let filename = `${reportType}_report_${dateFrom}_to_${dateTo}.csv`;
    
    // Find the main table on the page
    const table = document.querySelector('.table');
    if (table) {
        exportTableToCSV(table, filename);
    } else {
        showAlert('No data available to export.', 'warning');
    }
}
</script>

