<?php
require_once '../config/config.php';
require_login();

$page_title = 'New Laundry Request';

// Get available services
try {
    $stmt = $pdo->prepare("SELECT * FROM laundry_pricing WHERE status = 'active' ORDER BY service_type");
    $stmt->execute();
    $services = $stmt->fetchAll();
} catch (PDOException $e) {
    error_log("Services fetch error: " . $e->getMessage());
    $services = [];
}

// Get time slots from settings
$pickup_slots = explode(',', get_setting('pickup_time_slots', '09:00,10:00,11:00,14:00,15:00,16:00'));
$delivery_slots = explode(',', get_setting('delivery_time_slots', '09:00,10:00,11:00,14:00,15:00,16:00'));

$errors = [];
$success_message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    // Sanitize input
    $pickup_date = sanitize_input($_POST['pickup_date'] ?? '');
    $pickup_time = sanitize_input($_POST['pickup_time'] ?? '');
    $delivery_date = sanitize_input($_POST['delivery_date'] ?? '');
    $delivery_time = sanitize_input($_POST['delivery_time'] ?? '');
    $pickup_address = sanitize_input($_POST['pickup_address'] ?? '');
    $delivery_address = sanitize_input($_POST['delivery_address'] ?? '');
    $laundry_type = sanitize_input($_POST['laundry_type'] ?? '');
    $weight_kg = floatval($_POST['weight_kg'] ?? 0);
    $special_instructions = sanitize_input($_POST['special_instructions'] ?? '');
    
    // Validation
    if (empty($pickup_date)) {
        $errors[] = 'Pickup date is required.';
    } elseif (strtotime($pickup_date) < strtotime('today')) {
        $errors[] = 'Pickup date cannot be in the past.';
    }
    
    if (empty($pickup_time)) {
        $errors[] = 'Pickup time is required.';
    }
    
    if (empty($pickup_address)) {
        $errors[] = 'Pickup address is required.';
    }
    
    if (empty($delivery_address)) {
        $errors[] = 'Delivery address is required.';
    }
    
    if (empty($laundry_type)) {
        $errors[] = 'Laundry service type is required.';
    }
    
    if ($weight_kg <= 0) {
        $errors[] = 'Weight must be greater than 0.';
    } elseif ($weight_kg > 50) {
        $errors[] = 'Maximum weight is 50 kg per request.';
    }
    
    // Calculate total amount
    $total_amount = 0;
    if (empty($errors) && !empty($laundry_type) && $weight_kg > 0) {
        $total_amount = calculate_laundry_cost($laundry_type, $weight_kg);
    }
    
    // Create request
    if (empty($errors)) {
        try {
            $request_number = generate_request_number();
            
            $stmt = $pdo->prepare("
                INSERT INTO laundry_requests (
                    user_id, request_number, pickup_date, pickup_time, delivery_date, delivery_time,
                    pickup_address, delivery_address, laundry_type, weight_kg, special_instructions, total_amount
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            
            if ($stmt->execute([
                $_SESSION['user_id'], $request_number, $pickup_date, $pickup_time, 
                $delivery_date, $delivery_time, $pickup_address, $delivery_address, 
                $laundry_type, $weight_kg, $special_instructions, $total_amount
            ])) {
                $request_id = $pdo->lastInsertId();
                
                // Add status history
                $stmt = $pdo->prepare("
                    INSERT INTO request_status_history (request_id, status, notes, changed_by) 
                    VALUES (?, 'pending', 'Request submitted by customer', ?)
                ");
                $stmt->execute([$request_id, $_SESSION['user_id']]);
                
                // Send notification to user
                send_notification(
                    $_SESSION['user_id'], 
                    'Request Submitted', 
                    "Your laundry request #{$request_number} has been submitted successfully. We will contact you soon for confirmation.", 
                    'success'
                );
                
                // Send notification to admin (get first admin)
                $stmt = $pdo->prepare("SELECT id FROM users WHERE user_type = 'admin' AND status = 'active' LIMIT 1");
                $stmt->execute();
                $admin = $stmt->fetch();
                if ($admin) {
                    send_notification(
                        $admin['id'], 
                        'New Laundry Request', 
                        "A new laundry request #{$request_number} has been submitted by " . $_SESSION['first_name'] . " " . $_SESSION['last_name'], 
                        'info'
                    );
                }
                
                $_SESSION['success_message'] = "Your laundry request has been submitted successfully! Request number: {$request_number}";
                header('Location: requests.php');
                exit();
            } else {
                $errors[] = 'Failed to submit request. Please try again.';
            }
        } catch (PDOException $e) {
            $errors[] = 'Failed to submit request. Please try again.';
            error_log("Request submission error: " . $e->getMessage());
        }
    }
}

include '../includes/header.php';
?>

<div class="row justify-content-center">
    <div class="col-lg-8">
        <div class="card">
            <div class="card-header">
                <h4 class="mb-0">
                    <i class="bi bi-plus-circle me-2"></i>New Laundry Request
                </h4>
            </div>
            <div class="card-body">
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
                
                <form method="POST" id="requestForm" novalidate>
                    <!-- Pickup Information -->
                    <div class="row">
                        <div class="col-12">
                            <h5 class="text-primary mb-3">
                                <i class="bi bi-truck me-2"></i>Pickup Information
                            </h5>
                        </div>
                    </div>
                    
                    <div class="row g-3 mb-4">
                        <div class="col-md-6">
                            <label for="pickup_date" class="form-label">Pickup Date</label>
                            <input type="date" class="form-control" id="pickup_date" name="pickup_date" 
                                   value="<?php echo htmlspecialchars($_POST['pickup_date'] ?? ''); ?>" 
                                   min="<?php echo date('Y-m-d'); ?>" required>
                        </div>
                        <div class="col-md-6">
                            <label for="pickup_time" class="form-label">Pickup Time</label>
                            <select class="form-select" id="pickup_time" name="pickup_time" required>
                                <option value="">Select pickup time</option>
                                <?php foreach ($pickup_slots as $slot): ?>
                                    <option value="<?php echo trim($slot); ?>" 
                                            <?php echo (($_POST['pickup_time'] ?? '') === trim($slot)) ? 'selected' : ''; ?>>
                                        <?php echo date('g:i A', strtotime(trim($slot))); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                    
                    <div class="mb-4">
                        <label for="pickup_address" class="form-label">Pickup Address</label>
                        <textarea class="form-control" id="pickup_address" name="pickup_address" rows="3" 
                                  placeholder="Enter complete pickup address" required><?php echo htmlspecialchars($_POST['pickup_address'] ?? ''); ?></textarea>
                    </div>
                    
                    <!-- Delivery Information -->
                    <div class="row">
                        <div class="col-12">
                            <h5 class="text-primary mb-3">
                                <i class="bi bi-house me-2"></i>Delivery Information
                            </h5>
                        </div>
                    </div>
                    
                    <div class="row g-3 mb-4">
                        <div class="col-md-6">
                            <label for="delivery_date" class="form-label">Delivery Date (Optional)</label>
                            <input type="date" class="form-control" id="delivery_date" name="delivery_date" 
                                   value="<?php echo htmlspecialchars($_POST['delivery_date'] ?? ''); ?>" 
                                   min="<?php echo date('Y-m-d'); ?>">
                            <div class="form-text">Leave empty for standard delivery time</div>
                        </div>
                        <div class="col-md-6">
                            <label for="delivery_time" class="form-label">Delivery Time (Optional)</label>
                            <select class="form-select" id="delivery_time" name="delivery_time">
                                <option value="">Select delivery time</option>
                                <?php foreach ($delivery_slots as $slot): ?>
                                    <option value="<?php echo trim($slot); ?>" 
                                            <?php echo (($_POST['delivery_time'] ?? '') === trim($slot)) ? 'selected' : ''; ?>>
                                        <?php echo date('g:i A', strtotime(trim($slot))); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                    </div>
                    
                    <div class="mb-4">
                        <label for="delivery_address" class="form-label">Delivery Address</label>
                        <textarea class="form-control" id="delivery_address" name="delivery_address" rows="3" 
                                  placeholder="Enter complete delivery address" required><?php echo htmlspecialchars($_POST['delivery_address'] ?? ''); ?></textarea>
                        <div class="form-check mt-2">
                            <input class="form-check-input" type="checkbox" id="same_as_pickup">
                            <label class="form-check-label" for="same_as_pickup">
                                Same as pickup address
                            </label>
                        </div>
                    </div>
                    
                    <!-- Service Information -->
                    <div class="row">
                        <div class="col-12">
                            <h5 class="text-primary mb-3">
                                <i class="bi bi-droplet me-2"></i>Service Information
                            </h5>
                        </div>
                    </div>
                    
                    <div class="row g-3 mb-4">
                        <div class="col-md-6">
                            <label for="laundry_type" class="form-label">Service Type</label>
                            <select class="form-select" id="laundry_type" name="laundry_type" required>
                                <option value="">Select service type</option>
                                <?php foreach ($services as $service): ?>
                                    <option value="<?php echo htmlspecialchars($service['service_type']); ?>" 
                                            data-price="<?php echo $service['price_per_kg']; ?>"
                                            <?php echo (($_POST['laundry_type'] ?? '') === $service['service_type']) ? 'selected' : ''; ?>>
                                        <?php echo htmlspecialchars($service['service_type']); ?> - <?php echo format_currency($service['price_per_kg']); ?>/kg
                                    </option>
                                <?php endforeach; ?>
                            </select>
                        </div>
                        <div class="col-md-6">
                            <label for="weight_kg" class="form-label">Estimated Weight (kg)</label>
                            <input type="number" class="form-control" id="weight_kg" name="weight_kg" 
                                   value="<?php echo htmlspecialchars($_POST['weight_kg'] ?? ''); ?>" 
                                   min="0.1" max="50" step="0.1" placeholder="0.0" required>
                            <div class="form-text">Maximum 50 kg per request</div>
                        </div>
                    </div>
                    
                    <div class="mb-4">
                        <label for="special_instructions" class="form-label">Special Instructions (Optional)</label>
                        <textarea class="form-control" id="special_instructions" name="special_instructions" rows="3" 
                                  placeholder="Any special care instructions for your laundry"><?php echo htmlspecialchars($_POST['special_instructions'] ?? ''); ?></textarea>
                    </div>
                    
                    <!-- Cost Estimate -->
                    <div class="card bg-light mb-4">
                        <div class="card-body">
                            <h6 class="card-title">
                                <i class="bi bi-calculator me-2"></i>Cost Estimate
                            </h6>
                            <div class="row">
                                <div class="col-md-6">
                                    <p class="mb-1"><strong>Service:</strong> <span id="selected_service">-</span></p>
                                    <p class="mb-1"><strong>Weight:</strong> <span id="selected_weight">0</span> kg</p>
                                </div>
                                <div class="col-md-6">
                                    <p class="mb-1"><strong>Rate:</strong> <span id="service_rate">$0.00</span>/kg</p>
                                    <p class="mb-1"><strong>Total:</strong> <span id="total_amount" class="text-success fw-bold">$0.00</span></p>
                                </div>
                            </div>
                            <small class="text-muted">*Final amount may vary based on actual weight</small>
                        </div>
                    </div>
                    
                    <div class="d-flex justify-content-between">
                        <a href="dashboard.php" class="btn btn-secondary">
                            <i class="bi bi-arrow-left me-2"></i>Cancel
                        </a>
                        <button type="submit" class="btn btn-primary btn-lg">
                            <i class="bi bi-check-circle me-2"></i>Submit Request
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
</div>

<?php 
$page_js = 'request-form.js';
include '../includes/footer.php'; 
?>

<script>
// Auto-calculate cost
function updateCostEstimate() {
    const serviceSelect = document.getElementById('laundry_type');
    const weightInput = document.getElementById('weight_kg');
    const selectedServiceSpan = document.getElementById('selected_service');
    const selectedWeightSpan = document.getElementById('selected_weight');
    const serviceRateSpan = document.getElementById('service_rate');
    const totalAmountSpan = document.getElementById('total_amount');
    
    const selectedOption = serviceSelect.options[serviceSelect.selectedIndex];
    const weight = parseFloat(weightInput.value) || 0;
    
    if (selectedOption.value && weight > 0) {
        const serviceName = selectedOption.text.split(' - ')[0];
        const rate = parseFloat(selectedOption.dataset.price) || 0;
        const total = rate * weight;
        
        selectedServiceSpan.textContent = serviceName;
        selectedWeightSpan.textContent = weight;
        serviceRateSpan.textContent = '$' + rate.toFixed(2);
        totalAmountSpan.textContent = '$' + total.toFixed(2);
    } else {
        selectedServiceSpan.textContent = '-';
        selectedWeightSpan.textContent = '0';
        serviceRateSpan.textContent = '$0.00';
        totalAmountSpan.textContent = '$0.00';
    }
}

// Event listeners
document.getElementById('laundry_type').addEventListener('change', updateCostEstimate);
document.getElementById('weight_kg').addEventListener('input', updateCostEstimate);

// Same as pickup address checkbox
document.getElementById('same_as_pickup').addEventListener('change', function() {
    const pickupAddress = document.getElementById('pickup_address').value;
    const deliveryAddress = document.getElementById('delivery_address');
    
    if (this.checked) {
        deliveryAddress.value = pickupAddress;
    } else {
        deliveryAddress.value = '';
    }
});

// Form validation
document.getElementById('requestForm').addEventListener('submit', function(e) {
    if (!submitFormWithValidation('requestForm')) {
        e.preventDefault();
    }
});

// Initialize cost estimate
updateCostEstimate();
</script>

