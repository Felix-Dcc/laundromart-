<?php
require_once 'config/config.php';

// Check if user is logged in
if (is_logged_in()) {
    // Clear remember me cookie if it exists
    if (isset($_COOKIE['remember_token'])) {
        setcookie('remember_token', '', time() - 3600, '/');
        
        // Clear remember token from database
        try {
            $stmt = $pdo->prepare("UPDATE users SET remember_token = NULL WHERE id = ?");
            $stmt->execute([$_SESSION['user_id']]);
        } catch (PDOException $e) {
            error_log("Logout token clear error: " . $e->getMessage());
        }
    }
    
    // Send logout notification
    send_notification($_SESSION['user_id'], 'Logout Successful', 'You have successfully logged out of your account.', 'info');
    
    // Destroy session
    session_destroy();
}

// Redirect to login page
$_SESSION['success_message'] = 'You have been successfully logged out.';
header('Location: login.php');
exit();
?>

