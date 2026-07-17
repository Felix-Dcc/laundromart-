<?php
require_once 'config/config.php';

$page_title = 'Forgot Password';

// Redirect if already logged in
if (is_logged_in()) {
    if (is_admin()) {
        header('Location: admin/dashboard.php');
    } else {
        header('Location: user/dashboard.php');
    }
    exit();
}

$errors = [];
$success_message = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = sanitize_input($_POST['email'] ?? '');
    
    // Validation
    if (empty($email)) {
        $errors[] = 'Email is required.';
    } elseif (!validate_email($email)) {
        $errors[] = 'Please enter a valid email address.';
    }
    
    // Check if email exists and send reset link
    if (empty($errors)) {
        try {
            $stmt = $pdo->prepare("SELECT id, first_name FROM users WHERE email = ? AND status = 'active'");
            $stmt->execute([$email]);
            $user = $stmt->fetch();
            
            if ($user) {
                // Generate reset token
                $reset_token = generate_token();
                $reset_expires = date('Y-m-d H:i:s', time() + 3600); // 1 hour from now
                
                // Update user with reset token
                $stmt = $pdo->prepare("UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?");
                $stmt->execute([$reset_token, $reset_expires, $user['id']]);
                
                // In a real application, you would send an email here
                // For demo purposes, we'll just show a success message
                $success_message = 'If an account with that email exists, a password reset link has been sent.';
                
                // Send notification
                send_notification($user['id'], 'Password Reset Request', 'A password reset request has been made for your account. If this was not you, please contact support.', 'warning');
                
            } else {
                // Don't reveal if email exists or not for security
                $success_message = 'If an account with that email exists, a password reset link has been sent.';
            }
        } catch (PDOException $e) {
            $errors[] = 'An error occurred. Please try again.';
            error_log("Password reset error: " . $e->getMessage());
        }
    }
}
?>

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $page_title . ' - ' . APP_NAME; ?></title>
    
    <!-- Bootstrap 5 CSS -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    
    <!-- Bootstrap Icons -->
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css" rel="stylesheet">
    
    <!-- Custom CSS -->
    <link href="assets/css/style.css" rel="stylesheet">
</head>
<body>
    <div class="auth-container">
        <div class="container">
            <div class="row justify-content-center">
                <div class="col-md-5 col-lg-4">
                    <div class="auth-card">
                        <div class="auth-logo">
                            <i class="bi bi-key"></i>
                            <h2 class="mt-3 mb-0">Forgot Password</h2>
                            <p class="text-muted">Enter your email to reset your password</p>
                        </div>
                        
                        <?php if ($success_message): ?>
                            <div class="alert alert-success">
                                <i class="bi bi-check-circle me-2"></i>
                                <?php echo htmlspecialchars($success_message); ?>
                            </div>
                            <div class="text-center">
                                <a href="login.php" class="btn btn-primary">
                                    <i class="bi bi-arrow-left me-2"></i>Back to Login
                                </a>
                            </div>
                        <?php else: ?>
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
                            
                            <form method="POST" id="forgotPasswordForm" novalidate>
                                <div class="mb-4">
                                    <label for="email" class="form-label">Email Address</label>
                                    <div class="input-group">
                                        <span class="input-group-text"><i class="bi bi-envelope"></i></span>
                                        <input type="email" class="form-control" id="email" name="email" 
                                               value="<?php echo htmlspecialchars($_POST['email'] ?? ''); ?>" 
                                               placeholder="Enter your email address" required>
                                    </div>
                                    <div class="form-text">
                                        We'll send a password reset link to this email address.
                                    </div>
                                </div>
                                
                                <div class="d-grid">
                                    <button type="submit" class="btn btn-primary btn-lg">
                                        <i class="bi bi-envelope me-2"></i>Send Reset Link
                                    </button>
                                </div>
                            </form>
                            
                            <div class="text-center mt-4">
                                <p class="mb-0">Remember your password? 
                                    <a href="login.php" class="text-decoration-none">Sign in here</a>
                                </p>
                            </div>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Bootstrap 5 JS Bundle -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    
    <!-- Custom JavaScript -->
    <script src="assets/js/script.js"></script>
    
    <script>
        // Form validation
        document.getElementById('forgotPasswordForm')?.addEventListener('submit', function(e) {
            if (!submitFormWithValidation('forgotPasswordForm')) {
                e.preventDefault();
            }
        });
        
        // Auto-focus email field
        document.getElementById('email')?.focus();
    </script>
</body>
</html>

