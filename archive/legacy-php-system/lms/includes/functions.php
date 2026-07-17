<?php
/**
 * Utility Functions for Laundry Management System
 */

/**
 * Sanitize input data
 */
function sanitize_input($data) {
    $data = trim($data);
    $data = stripslashes($data);
    $data = htmlspecialchars($data);
    return $data;
}

/**
 * Validate email address
 */
function validate_email($email) {
    return filter_var($email, FILTER_VALIDATE_EMAIL);
}

/**
 * Validate phone number
 */
function validate_phone($phone) {
    return preg_match('/^[0-9+\-\s()]+$/', $phone);
}

/**
 * Generate secure password hash
 */
function hash_password($password) {
    return password_hash($password, PASSWORD_DEFAULT);
}

/**
 * Verify password
 */
function verify_password($password, $hash) {
    return password_verify($password, $hash);
}

/**
 * Generate random token
 */
function generate_token($length = 32) {
    return bin2hex(random_bytes($length));
}

/**
 * Generate unique request number
 */
function generate_request_number() {
    return 'LMS' . date('Y') . str_pad(mt_rand(1, 9999), 4, '0', STR_PAD_LEFT);
}

/**
 * Check if user is logged in
 */
function is_logged_in() {
    return isset($_SESSION['user_id']) && !empty($_SESSION['user_id']);
}

/**
 * Check if user is admin
 */
function is_admin() {
    return isset($_SESSION['user_type']) && $_SESSION['user_type'] === 'admin';
}

/**
 * Redirect to login if not authenticated
 */
function require_login() {
    if (!is_logged_in()) {
        header('Location: ../login.php');
        exit();
    }
}

/**
 * Redirect to admin login if not admin
 */
function require_admin() {
    if (!is_logged_in() || !is_admin()) {
        header('Location: ../admin/login.php');
        exit();
    }
}

/**
 * Format currency
 */
function format_currency($amount) {
    return 'GH₵' . number_format($amount, 2);
}

/**
 * Format date
 */
function format_date($date, $format = 'M d, Y') {
    return date($format, strtotime($date));
}

/**
 * Format datetime
 */
function format_datetime($datetime, $format = 'M d, Y g:i A') {
    return date($format, strtotime($datetime));
}

/**
 * Get status badge class for Bootstrap
 */
function get_status_badge_class($status) {
    $classes = [
        'pending' => 'bg-warning',
        'accepted' => 'bg-info',
        'picked_up' => 'bg-primary',
        'in_process' => 'bg-secondary',
        'ready' => 'bg-success',
        'delivered' => 'bg-success',
        'cancelled' => 'bg-danger',
        'active' => 'bg-success',
        'inactive' => 'bg-secondary'
    ];
    
    return $classes[$status] ?? 'bg-secondary';
}

/**
 * Send notification to user
 */
function send_notification($user_id, $title, $message, $type = 'info') {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)");
        return $stmt->execute([$user_id, $title, $message, $type]);
    } catch (PDOException $e) {
        error_log("Notification error: " . $e->getMessage());
        return false;
    }
}

/**
 * Get unread notifications count
 */
function get_unread_notifications_count($user_id) {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM notifications WHERE user_id = ? AND is_read = FALSE");
        $stmt->execute([$user_id]);
        return $stmt->fetchColumn();
    } catch (PDOException $e) {
        error_log("Notification count error: " . $e->getMessage());
        return 0;
    }
}

/**
 * Upload file
 */
function upload_file($file, $allowed_types = ['jpg', 'jpeg', 'png', 'pdf'], $max_size = MAX_FILE_SIZE) {
    if ($file['error'] !== UPLOAD_ERR_OK) {
        return ['success' => false, 'message' => 'File upload error.'];
    }
    
    if ($file['size'] > $max_size) {
        return ['success' => false, 'message' => 'File size too large.'];
    }
    
    $file_extension = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    if (!in_array($file_extension, $allowed_types)) {
        return ['success' => false, 'message' => 'Invalid file type.'];
    }
    
    $filename = uniqid() . '.' . $file_extension;
    $upload_path = UPLOAD_DIR . $filename;
    
    if (move_uploaded_file($file['tmp_name'], $upload_path)) {
        return ['success' => true, 'filename' => $filename];
    } else {
        return ['success' => false, 'message' => 'Failed to upload file.'];
    }
}

/**
 * Log activity
 */
function log_activity($user_id, $action, $details = '') {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("INSERT INTO activity_logs (user_id, action, details, ip_address, user_agent) VALUES (?, ?, ?, ?, ?)");
        return $stmt->execute([
            $user_id,
            $action,
            $details,
            $_SERVER['REMOTE_ADDR'] ?? '',
            $_SERVER['HTTP_USER_AGENT'] ?? ''
        ]);
    } catch (PDOException $e) {
        error_log("Activity log error: " . $e->getMessage());
        return false;
    }
}

/**
 * Calculate laundry cost
 */
function calculate_laundry_cost($service_type, $weight) {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("SELECT price_per_kg FROM laundry_pricing WHERE service_type = ? AND status = 'active'");
        $stmt->execute([$service_type]);
        $pricing = $stmt->fetch();
        
        if ($pricing) {
            return $pricing['price_per_kg'] * $weight;
        }
        
        return 0;
    } catch (PDOException $e) {
        error_log("Cost calculation error: " . $e->getMessage());
        return 0;
    }
}

/**
 * Get system setting
 */
function get_setting($key, $default = '') {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("SELECT setting_value FROM system_settings WHERE setting_key = ?");
        $stmt->execute([$key]);
        $result = $stmt->fetch();
        
        return $result ? $result['setting_value'] : $default;
    } catch (PDOException $e) {
        error_log("Setting retrieval error: " . $e->getMessage());
        return $default;
    }
}

/**
 * Update system setting
 */
function update_setting($key, $value) {
    global $pdo;
    
    try {
        $stmt = $pdo->prepare("UPDATE system_settings SET setting_value = ? WHERE setting_key = ?");
        return $stmt->execute([$value, $key]);
    } catch (PDOException $e) {
        error_log("Setting update error: " . $e->getMessage());
        return false;
    }
}
?>

