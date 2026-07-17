<?php
require_once '../config/config.php';
require_login();

$request_id = intval($_GET['id'] ?? 0);

if (!$request_id) {
    $_SESSION['error_message'] = 'Invalid request ID.';
    header('Location: requests.php');
    exit();
}

try {
    // Check if request exists and belongs to user
    $stmt = $pdo->prepare("SELECT * FROM laundry_requests WHERE id = ? AND user_id = ?");
    $stmt->execute([$request_id, $_SESSION['user_id']]);
    $request = $stmt->fetch();
    
    if (!$request) {
        $_SESSION['error_message'] = 'Request not found.';
        header('Location: requests.php');
        exit();
    }
    
    // Check if request can be cancelled (only pending requests)
    if ($request['status'] !== 'pending') {
        $_SESSION['error_message'] = 'Only pending requests can be cancelled.';
        header('Location: request-details.php?id=' . $request_id);
        exit();
    }
    
    // Cancel the request
    $stmt = $pdo->prepare("UPDATE laundry_requests SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?");
    
    if ($stmt->execute([$request_id])) {
        // Add status history
        $stmt = $pdo->prepare("
            INSERT INTO request_status_history (request_id, status, notes, changed_by) 
            VALUES (?, 'cancelled', 'Request cancelled by customer', ?)
        ");
        $stmt->execute([$request_id, $_SESSION['user_id']]);
        
        // Send notification to user
        send_notification(
            $_SESSION['user_id'], 
            'Request Cancelled', 
            "Your laundry request #{$request['request_number']} has been cancelled successfully.", 
            'info'
        );
        
        // Send notification to admin
        $stmt = $pdo->prepare("SELECT id FROM users WHERE user_type = 'admin' AND status = 'active' LIMIT 1");
        $stmt->execute();
        $admin = $stmt->fetch();
        if ($admin) {
            send_notification(
                $admin['id'], 
                'Request Cancelled', 
                "Laundry request #{$request['request_number']} has been cancelled by " . $_SESSION['first_name'] . " " . $_SESSION['last_name'], 
                'warning'
            );
        }
        
        $_SESSION['success_message'] = 'Request cancelled successfully.';
    } else {
        $_SESSION['error_message'] = 'Failed to cancel request. Please try again.';
    }
    
} catch (PDOException $e) {
    error_log("Cancel request error: " . $e->getMessage());
    $_SESSION['error_message'] = 'Failed to cancel request. Please try again.';
}

header('Location: requests.php');
exit();
?>

