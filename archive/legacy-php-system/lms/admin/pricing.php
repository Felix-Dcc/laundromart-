<?php
require_once '../config/config.php';
require_admin();

$page_title = 'Manage Pricing';

$errors = [];
$success_message = '';

// Handle pricing updates
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $action = $_POST['action'] ?? '';
    
    if ($action === 'update_pricing') {
        $pricing_id = intval($_POST['pricing_id'] ?? 0);
        $service_type = sanitize_input($_POST['service_type'] ?? '');
        $price_per_kg = floatval($_POST['price_per_kg'] ?? 0);
        $description = sanitize_input($_POST['description'] ?? '');
        $status = sanitize_input($_POST['status'] ?? 'active');
        
        // Validation
        if (empty($service_type)) {
            $errors[] = 'Service type is required.';
        }
        
        if ($price_per_kg <= 0) {
            $errors[] = 'Price must be greater than 0.';
        } elseif ($price_per_kg > 1000) {
            $errors[] = 'Price cannot exceed $1000 per kg.';
        }
        
        if (empty($errors)) {
            try {
                if ($pricing_id > 0) {
                    // Update existing pricing
                    $stmt = $pdo->prepare("
                        UPDATE laundry_pricing 
                        SET service_type = ?, price_per_kg = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
                        WHERE id = ?
                    ");
                    
                    if ($stmt->execute([$service_type, $price_per_kg, $description, $status, $pricing_id])) {
                        $success_message = 'Pricing updated successfully!';
                    } else {
                        $errors[] = 'Failed to update pricing.';
                    }
                } else {
                    // Add new pricing
                    $stmt = $pdo->prepare("
                        INSERT INTO laundry_pricing (service_type, price_per_kg, description, status) 
                        VALUES (?, ?, ?, ?)
                    ");
                    
                    if ($stmt->execute([$service_type, $price_per_kg, $description, $status])) {
                        $success_message = 'New pricing added successfully!';
                    } else {
                        $errors[] = 'Failed to add pricing.';
                    }
                }
            } catch (PDOException $e) {
                if ($e->getCode() == 23000) {
                    $errors[] = 'Service type already exists.';
                } else {
                    $errors[] = 'Database error. Please try again.';
                    error_log("Pricing update error: " . $e->getMessage());
                }
            }
        }
    }
    
    elseif ($action === 'delete_pricing') {
        $pricing_id = intval($_POST['pricing_id'] ?? 0);
        
        if ($pricing_id > 0) {
            try {
                // Check if pricing is being used in any requests
                $stmt = $pdo->prepare("SELECT COUNT(*) FROM laundry_requests WHERE laundry_type = (SELECT service_type FROM laundry_pricing WHERE id = ?)");
                $stmt->execute([$pricing_id]);
                $usage_count = $stmt->fetchColumn();
                
                if ($usage_count > 0) {
                    $errors[] = 'Cannot delete pricing that is being used in existing requests. You can deactivate it instead.';
                } else {
                    $stmt = $pdo->prepare("DELETE FROM laundry_pricing WHERE id = ?");
                    if ($stmt->execute([$pricing_id])) {
                        $success_message = 'Pricing deleted successfully!';
                    } else {
                        $errors[] = 'Failed to delete pricing.';
                    }
                }
            } catch (PDOException $e) {
                $errors[] = 'Failed to delete pricing.';
                error_log("Pricing delete error: " . $e->getMessage());
            }
        }
    }
}

// Get all pricing
try {
    $stmt = $pdo->prepare("SELECT * FROM laundry_pricing ORDER BY service_type ASC");
    $stmt->execute();
    $pricing_list = $stmt->fetchAll();
    
    // Get usage statistics
    $stmt = $pdo->prepare("
        SELECT lp.service_type, COUNT(lr.id) as usage_count, SUM(lr.total_amount) as total_revenue
        FROM laundry_pricing lp
        LEFT JOIN laundry_requests lr ON lp.service_type = lr.laundry_type
        GROUP BY lp.service_type
        ORDER BY usage_count DESC
    ");
    $stmt->execute();
    $usage_stats = $stmt->fetchAll();
    
} catch (PDOException $e) {
    error_log("Pricing fetch error: " . $e->getMessage());
    $pricing_list = [];
    $usage_stats = [];
}

include '../includes/header.php';
?>

<div class="d-flex justify-content-between align-items-center mb-4">
    <h2>
        <i class="bi bi-currency-dollar me-2"></i>Manage Pricing
    </h2>
    <div>
        <button type="button" class="btn btn-primary me-2" data-bs-toggle="modal" data-bs-target="#pricingModal">
            <i class="bi bi-plus-circle me-2"></i>Add New Service
        </button>
        <a href="dashboard.php" class="btn btn-outline-secondary">
            <i class="bi bi-arrow-left me-2"></i>Back to Dashboard
        </a>
    </div>
</div>

<?php if ($success_message): ?>
    <div class="alert alert-success">
        <i class="bi bi-check-circle me-2"></i>
        <?php echo htmlspecialchars($success_message); ?>
    </div>
<?php endif; ?>

<?php if (!empty($errors)): ?>
    <div class="alert alert-danger">
        <i class="bi bi-exclamation-triangle me-2"></i>
        <ul class="mb-0">
            <?php foreach ($errors as $error): ?>
                <li><?php echo htmlspecialchars($error); ?></li>
            <?php endforeach; ?>
        </ul>
    </div>
<?php endif; ?>

<div class="row g-4">
    <!-- Pricing List -->
    <div class="col-lg-8">
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-list me-2"></i>Service Pricing
                </h5>
            </div>
            <div class="card-body">
                <?php if (empty($pricing_list)): ?>
                    <div class="text-center py-5">
                        <i class="bi bi-currency-dollar text-muted" style="font-size: 4rem;"></i>
                        <h4 class="text-muted mt-3">No pricing configured</h4>
                        <p class="text-muted">Add your first service pricing to get started</p>
                        <button type="button" class="btn btn-primary" data-bs-toggle="modal" data-bs-target="#pricingModal">
                            <i class="bi bi-plus-circle me-2"></i>Add Service Pricing
                        </button>
                    </div>
                <?php else: ?>
                    <div class="table-responsive">
                        <table class="table table-hover">
                            <thead>
                                <tr>
                                    <th>Service Type</th>
                                    <th>Price per KG</th>
                                    <th>Description</th>
                                    <th>Status</th>
                                    <th>Usage</th>
                                    <th>Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($pricing_list as $pricing): ?>
                                    <?php
                                    // Find usage stats for this service
                                    $usage = array_filter($usage_stats, function($stat) use ($pricing) {
                                        return $stat['service_type'] === $pricing['service_type'];
                                    });
                                    $usage = reset($usage);
                                    $usage_count = $usage ? $usage['usage_count'] : 0;
                                    $total_revenue = $usage ? $usage['total_revenue'] : 0;
                                    ?>
                                    <tr>
                                        <td>
                                            <strong><?php echo htmlspecialchars($pricing['service_type']); ?></strong>
                                        </td>
                                        <td>
                                            <span class="fs-5 fw-bold text-success">
                                                <?php echo format_currency($pricing['price_per_kg']); ?>
                                            </span>
                                        </td>
                                        <td>
                                            <?php echo htmlspecialchars($pricing['description'] ?: 'No description'); ?>
                                        </td>
                                        <td>
                                            <span class="badge <?php echo get_status_badge_class($pricing['status']); ?>">
                                                <?php echo ucfirst($pricing['status']); ?>
                                            </span>
                                        </td>
                                        <td>
                                            <div>
                                                <strong><?php echo $usage_count; ?></strong> requests
                                                <?php if ($total_revenue > 0): ?>
                                                    <br>
                                                    <small class="text-success"><?php echo format_currency($total_revenue); ?> revenue</small>
                                                <?php endif; ?>
                                            </div>
                                        </td>
                                        <td>
                                            <div class="btn-group btn-group-sm">
                                                <button type="button" class="btn btn-outline-primary" 
                                                        data-bs-toggle="modal" 
                                                        data-bs-target="#pricingModal"
                                                        data-pricing-id="<?php echo $pricing['id']; ?>"
                                                        data-service-type="<?php echo htmlspecialchars($pricing['service_type']); ?>"
                                                        data-price="<?php echo $pricing['price_per_kg']; ?>"
                                                        data-description="<?php echo htmlspecialchars($pricing['description']); ?>"
                                                        data-status="<?php echo $pricing['status']; ?>"
                                                        title="Edit">
                                                    <i class="bi bi-pencil"></i>
                                                </button>
                                                <?php if ($usage_count == 0): ?>
                                                    <form method="POST" class="d-inline">
                                                        <input type="hidden" name="action" value="delete_pricing">
                                                        <input type="hidden" name="pricing_id" value="<?php echo $pricing['id']; ?>">
                                                        <button type="submit" class="btn btn-outline-danger" 
                                                                onclick="return confirm('Are you sure you want to delete this pricing?')"
                                                                title="Delete">
                                                            <i class="bi bi-trash"></i>
                                                        </button>
                                                    </form>
                                                <?php endif; ?>
                                            </div>
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
    
    <!-- Usage Statistics -->
    <div class="col-lg-4">
        <div class="card">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-bar-chart me-2"></i>Usage Statistics
                </h5>
            </div>
            <div class="card-body">
                <?php if (empty($usage_stats) || array_sum(array_column($usage_stats, 'usage_count')) == 0): ?>
                    <div class="text-center py-4">
                        <i class="bi bi-graph-up text-muted" style="font-size: 3rem;"></i>
                        <h6 class="text-muted mt-3">No usage data yet</h6>
                        <p class="text-muted mb-0">Statistics will appear as customers use your services</p>
                    </div>
                <?php else: ?>
                    <?php 
                    $max_usage = max(array_column($usage_stats, 'usage_count'));
                    foreach ($usage_stats as $stat): 
                        if ($stat['usage_count'] > 0):
                    ?>
                        <div class="mb-4">
                            <div class="d-flex justify-content-between align-items-center mb-2">
                                <h6 class="mb-0"><?php echo htmlspecialchars($stat['service_type']); ?></h6>
                                <span class="badge bg-primary"><?php echo $stat['usage_count']; ?></span>
                            </div>
                            <div class="progress mb-1">
                                <div class="progress-bar" style="width: <?php echo ($stat['usage_count'] / $max_usage) * 100; ?>%"></div>
                            </div>
                            <small class="text-muted">
                                Revenue: <?php echo format_currency($stat['total_revenue']); ?>
                            </small>
                        </div>
                    <?php 
                        endif;
                    endforeach; 
                    ?>
                <?php endif; ?>
            </div>
        </div>
        
        <!-- Pricing Tips -->
        <div class="card mt-4">
            <div class="card-header">
                <h5 class="mb-0">
                    <i class="bi bi-lightbulb me-2"></i>Pricing Tips
                </h5>
            </div>
            <div class="card-body">
                <ul class="list-unstyled mb-0">
                    <li class="mb-2">
                        <i class="bi bi-check-circle text-success me-2"></i>
                        <small>Research competitor pricing in your area</small>
                    </li>
                    <li class="mb-2">
                        <i class="bi bi-check-circle text-success me-2"></i>
                        <small>Consider premium pricing for specialty services</small>
                    </li>
                    <li class="mb-2">
                        <i class="bi bi-check-circle text-success me-2"></i>
                        <small>Update prices based on demand and costs</small>
                    </li>
                    <li class="mb-2">
                        <i class="bi bi-check-circle text-success me-2"></i>
                        <small>Offer bundle discounts for multiple services</small>
                    </li>
                    <li>
                        <i class="bi bi-check-circle text-success me-2"></i>
                        <small>Monitor usage statistics to optimize pricing</small>
                    </li>
                </ul>
            </div>
        </div>
    </div>
</div>

<!-- Pricing Modal -->
<div class="modal fade" id="pricingModal" tabindex="-1">
    <div class="modal-dialog">
        <div class="modal-content">
            <div class="modal-header">
                <h5 class="modal-title" id="pricingModalTitle">Add New Service</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
            </div>
            <form method="POST" id="pricingForm">
                <div class="modal-body">
                    <input type="hidden" name="action" value="update_pricing">
                    <input type="hidden" name="pricing_id" id="pricing_id">
                    
                    <div class="mb-3">
                        <label for="service_type" class="form-label">Service Type</label>
                        <input type="text" class="form-control" name="service_type" id="service_type" 
                               placeholder="e.g., Regular Wash, Dry Cleaning" required>
                    </div>
                    
                    <div class="mb-3">
                        <label for="price_per_kg" class="form-label">Price per KG</label>
                        <div class="input-group">
                            <span class="input-group-text">$</span>
                            <input type="number" class="form-control" name="price_per_kg" id="price_per_kg" 
                                   min="0.01" max="1000" step="0.01" placeholder="0.00" required>
                        </div>
                    </div>
                    
                    <div class="mb-3">
                        <label for="description" class="form-label">Description</label>
                        <textarea class="form-control" name="description" id="description" rows="3" 
                                  placeholder="Brief description of the service..."></textarea>
                    </div>
                    
                    <div class="mb-3">
                        <label for="status" class="form-label">Status</label>
                        <select class="form-select" name="status" id="status" required>
                            <option value="active">Active</option>
                            <option value="inactive">Inactive</option>
                        </select>
                    </div>
                </div>
                <div class="modal-footer">
                    <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancel</button>
                    <button type="submit" class="btn btn-primary" id="pricingSubmitBtn">Add Service</button>
                </div>
            </form>
        </div>
    </div>
</div>

<?php include '../includes/footer.php'; ?>

<script>
// Handle pricing modal
document.addEventListener('DOMContentLoaded', function() {
    const pricingModal = document.getElementById('pricingModal');
    const modalTitle = document.getElementById('pricingModalTitle');
    const submitBtn = document.getElementById('pricingSubmitBtn');
    
    if (pricingModal) {
        pricingModal.addEventListener('show.bs.modal', function(event) {
            const button = event.relatedTarget;
            
            if (button && button.hasAttribute('data-pricing-id')) {
                // Edit mode
                const pricingId = button.getAttribute('data-pricing-id');
                const serviceType = button.getAttribute('data-service-type');
                const price = button.getAttribute('data-price');
                const description = button.getAttribute('data-description');
                const status = button.getAttribute('data-status');
                
                modalTitle.textContent = 'Edit Service Pricing';
                submitBtn.textContent = 'Update Service';
                
                document.getElementById('pricing_id').value = pricingId;
                document.getElementById('service_type').value = serviceType;
                document.getElementById('price_per_kg').value = price;
                document.getElementById('description').value = description;
                document.getElementById('status').value = status;
            } else {
                // Add mode
                modalTitle.textContent = 'Add New Service';
                submitBtn.textContent = 'Add Service';
                
                // Reset form
                document.getElementById('pricingForm').reset();
                document.getElementById('pricing_id').value = '';
                document.getElementById('status').value = 'active';
            }
        });
    }
});

// Form validation
document.getElementById('pricingForm').addEventListener('submit', function(e) {
    const serviceType = document.getElementById('service_type').value.trim();
    const price = parseFloat(document.getElementById('price_per_kg').value);
    
    if (!serviceType) {
        e.preventDefault();
        showAlert('Service type is required.', 'danger');
        return;
    }
    
    if (price <= 0 || price > 1000) {
        e.preventDefault();
        showAlert('Price must be between $0.01 and $1000.', 'danger');
        return;
    }
});
</script>

