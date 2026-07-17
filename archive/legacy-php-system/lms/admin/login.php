<?php
require_once '../config/config.php';

$page_title = 'Admin Login';

// Redirect if already logged in as admin
if (is_logged_in() && is_admin()) {
    header('Location: dashboard.php');
    exit();
}

// Redirect regular users to user login
if (is_logged_in() && !is_admin()) {
    header('Location: ../user/dashboard.php');
    exit();
}

$errors = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $email = sanitize_input($_POST['email'] ?? '');
    $password = $_POST['password'] ?? '';
    
    // Validation
    if (empty($email)) {
        $errors[] = 'Email is required.';
    } elseif (!validate_email($email)) {
        $errors[] = 'Please enter a valid email address.';
    }
    
    if (empty($password)) {
        $errors[] = 'Password is required.';
    }
    
    // Authenticate admin
    if (empty($errors)) {
        try {
            $stmt = $pdo->prepare("SELECT id, first_name, last_name, email, password, user_type, status FROM users WHERE email = ? AND user_type = 'admin'");
            $stmt->execute([$email]);
            $admin = $stmt->fetch();
            
            if ($admin && verify_password($password, $admin['password'])) {
                if ($admin['status'] === 'active') {
                    // Set session variables
                    $_SESSION['user_id'] = $admin['id'];
                    $_SESSION['first_name'] = $admin['first_name'];
                    $_SESSION['last_name'] = $admin['last_name'];
                    $_SESSION['email'] = $admin['email'];
                    $_SESSION['user_type'] = $admin['user_type'];
                    $_SESSION['login_time'] = time();
                    
                    // Send login notification
                    send_notification($admin['id'], 'Admin Login', 'You have successfully logged into the admin panel.', 'info');
                    
                    header('Location: dashboard.php');
                    exit();
                } else {
                    $errors[] = 'Your admin account has been deactivated.';
                }
            } else {
                $errors[] = 'Invalid admin credentials.';
            }
        } catch (PDOException $e) {
            $errors[] = 'Login failed. Please try again.';
            error_log("Admin login error: " . $e->getMessage());
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
    <link href="../assets/css/style.css" rel="stylesheet">
</head>
<body>
    <div class="auth-container">
        <div class="container">
            <div class="row justify-content-center">
                <div class="col-md-5 col-lg-4">
                    <div class="auth-card">
                        <div class="auth-logo">
                            <i class="bi bi-shield-lock"></i>
                            <h2 class="mt-3 mb-0">Admin Panel</h2>
                            <p class="text-muted">Sign in to admin dashboard</p>
                        </div>
                        
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
                        
                        <form method="POST" id="adminLoginForm" novalidate>
                            <div class="mb-3">
                                <label for="email" class="form-label">Admin Email</label>
                                <div class="input-group">
                                    <span class="input-group-text"><i class="bi bi-person-badge"></i></span>
                                    <input type="email" class="form-control" id="email" name="email" 
                                           value="<?php echo htmlspecialchars($_POST['email'] ?? ''); ?>" 
                                           placeholder="Enter admin email" required>
                                </div>
                            </div>
                            
                            <div class="mb-4">
                                <label for="password" class="form-label">Password</label>
                                <div class="input-group">
                                    <span class="input-group-text"><i class="bi bi-lock"></i></span>
                                    <input type="password" class="form-control" id="password" name="password" 
                                           placeholder="Enter admin password" required>
                                    <button class="btn btn-outline-secondary" type="button" id="togglePassword">
                                        <i class="bi bi-eye"></i>
                                    </button>
                                </div>
                            </div>
                            
                            <div class="d-grid">
                                <button type="submit" class="btn btn-primary btn-lg">
                                    <i class="bi bi-shield-check me-2"></i>Admin Sign In
                                </button>
                            </div>
                        </form>
                        
                        <div class="text-center mt-4">
                            <hr>
                            <p class="mb-0 text-muted">
                                <small>User Login: <a href="../login.php" class="text-decoration-none">Click here</a></small>
                            </p>
                        </div>
                        
                        <div class="mt-3 p-3 bg-light rounded">
                            <h6 class="text-muted mb-2">Demo Credentials:</h6>
                            <small class="text-muted">
                                <strong>Email:</strong> admin@lms.com<br>
                                <strong>Password:</strong> password
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- Bootstrap 5 JS Bundle -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    
    <!-- Custom JavaScript -->
    <script src="../assets/js/script.js"></script>
    
    <script>
        // Toggle password visibility
        document.getElementById('togglePassword').addEventListener('click', function() {
            const passwordField = document.getElementById('password');
            const icon = this.querySelector('i');
            
            if (passwordField.type === 'password') {
                passwordField.type = 'text';
                icon.className = 'bi bi-eye-slash';
            } else {
                passwordField.type = 'password';
                icon.className = 'bi bi-eye';
            }
        });
        
        // Form validation
        document.getElementById('adminLoginForm').addEventListener('submit', function(e) {
            if (!submitFormWithValidation('adminLoginForm')) {
                e.preventDefault();
            }
        });
        
        // Auto-focus email field
        document.getElementById('email').focus();
    </script>
</body>
</html>

