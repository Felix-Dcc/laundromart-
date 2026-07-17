<?php
/**
 * Installation Script for Laundry Management System
 * This script sets up the database and creates default data
 */

// Check if already installed
if (file_exists('config/installed.lock')) {
    die('System is already installed. Delete config/installed.lock to reinstall.');
}

// Database configuration
$db_host = 'localhost';
$db_name = 'laundry_management_system';
$db_user = 'root';
$db_pass = '';

$errors = [];
$success_messages = [];

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $db_host = $_POST['db_host'] ?? 'localhost';
    $db_name = $_POST['db_name'] ?? 'laundry_management_system';
    $db_user = $_POST['db_user'] ?? 'root';
    $db_pass = $_POST['db_pass'] ?? '';
    
    $admin_email = $_POST['admin_email'] ?? '';
    $admin_password = $_POST['admin_password'] ?? '';
    $admin_first_name = $_POST['admin_first_name'] ?? '';
    $admin_last_name = $_POST['admin_last_name'] ?? '';
    
    // Validation
    if (empty($admin_email) || !filter_var($admin_email, FILTER_VALIDATE_EMAIL)) {
        $errors[] = 'Valid admin email is required.';
    }
    
    if (empty($admin_password) || strlen($admin_password) < 6) {
        $errors[] = 'Admin password must be at least 6 characters.';
    }
    
    if (empty($admin_first_name) || empty($admin_last_name)) {
        $errors[] = 'Admin first and last name are required.';
    }
    
    if (empty($errors)) {
        try {
            // Connect to MySQL server
            $pdo = new PDO("mysql:host={$db_host}", $db_user, $db_pass);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            
            // Create database
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$db_name}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
            $success_messages[] = "Database '{$db_name}' created successfully.";
            
            // Connect to the new database
            $pdo = new PDO("mysql:host={$db_host};dbname={$db_name}", $db_user, $db_pass);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            
            // Read and execute SQL file
            $sql_file = file_get_contents('database/lms_database.sql');
            $statements = explode(';', $sql_file);
            
            foreach ($statements as $statement) {
                $statement = trim($statement);
                if (!empty($statement)) {
                    $pdo->exec($statement);
                }
            }
            $success_messages[] = "Database tables created successfully.";
            
            // Create admin user
            $hashed_password = password_hash($admin_password, PASSWORD_DEFAULT);
            $stmt = $pdo->prepare("
                INSERT INTO users (first_name, last_name, email, password, phone, address, user_type, status) 
                VALUES (?, ?, ?, ?, '000-000-0000', 'Admin Address', 'admin', 'active')
            ");
            $stmt->execute([$admin_first_name, $admin_last_name, $admin_email, $hashed_password]);
            $success_messages[] = "Admin user created successfully.";
            
            // Insert default pricing
            $default_pricing = [
                ['Regular Wash', 5.00, 'Standard washing and drying service'],
                ['Dry Cleaning', 15.00, 'Professional dry cleaning service'],
                ['Express Service', 8.00, 'Same-day washing and drying'],
                ['Delicate Items', 12.00, 'Special care for delicate fabrics'],
                ['Comforter/Blanket', 20.00, 'Large item cleaning service']
            ];
            
            $stmt = $pdo->prepare("
                INSERT INTO laundry_pricing (service_type, price_per_kg, description, status) 
                VALUES (?, ?, ?, 'active')
            ");
            
            foreach ($default_pricing as $pricing) {
                $stmt->execute($pricing);
            }
            $success_messages[] = "Default pricing data inserted successfully.";
            
            // Update database configuration file
            $config_content = "<?php
/**
 * Database Configuration
 */
define('DB_HOST', '{$db_host}');
define('DB_NAME', '{$db_name}');
define('DB_USER', '{$db_user}');
define('DB_PASS', '{$db_pass}');

try {
    \$pdo = new PDO(
        \"mysql:host=\" . DB_HOST . \";dbname=\" . DB_NAME . \";charset=utf8mb4\",
        DB_USER,
        DB_PASS,
        [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]
    );
} catch (PDOException \$e) {
    error_log(\"Database connection failed: \" . \$e->getMessage());
    die('Database connection failed. Please check your configuration.');
}
?>";
            
            file_put_contents('config/database.php', $config_content);
            $success_messages[] = "Database configuration updated.";
            
            // Create installation lock file
            file_put_contents('config/installed.lock', date('Y-m-d H:i:s'));
            $success_messages[] = "Installation completed successfully!";
            
            $installation_complete = true;
            
        } catch (PDOException $e) {
            $errors[] = "Database error: " . $e->getMessage();
        } catch (Exception $e) {
            $errors[] = "Installation error: " . $e->getMessage();
        }
    }
}
?>
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Install Laundry Management System</title>
    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.0/font/bootstrap-icons.css" rel="stylesheet">
</head>
<body class="bg-light">
    <div class="container py-5">
        <div class="row justify-content-center">
            <div class="col-lg-8">
                <div class="card shadow">
                    <div class="card-header bg-primary text-white text-center">
                        <h2 class="mb-0">
                            <i class="bi bi-gear me-2"></i>
                            Laundry Management System Installation
                        </h2>
                    </div>
                    <div class="card-body p-5">
                        <?php if (isset($installation_complete) && $installation_complete): ?>
                            <div class="text-center">
                                <i class="bi bi-check-circle text-success" style="font-size: 4rem;"></i>
                                <h3 class="text-success mt-3">Installation Successful!</h3>
                                <p class="text-muted mb-4">Your Laundry Management System has been installed successfully.</p>
                                
                                <div class="row g-3">
                                    <div class="col-md-6">
                                        <div class="card">
                                            <div class="card-body text-center">
                                                <h5>Admin Panel</h5>
                                                <p class="text-muted">Manage your laundry business</p>
                                                <a href="admin/login.php" class="btn btn-primary">
                                                    <i class="bi bi-shield-lock me-2"></i>Admin Login
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                    <div class="col-md-6">
                                        <div class="card">
                                            <div class="card-body text-center">
                                                <h5>Customer Portal</h5>
                                                <p class="text-muted">Customer registration and orders</p>
                                                <a href="index.php" class="btn btn-success">
                                                    <i class="bi bi-house me-2"></i>Customer Portal
                                                </a>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                                
                                <div class="alert alert-info mt-4">
                                    <h6><i class="bi bi-info-circle me-2"></i>Admin Login Details:</h6>
                                    <p class="mb-0">
                                        <strong>Email:</strong> <?php echo htmlspecialchars($admin_email); ?><br>
                                        <strong>Password:</strong> [The password you entered]
                                    </p>
                                </div>
                            </div>
                        <?php else: ?>
                            <?php if (!empty($errors)): ?>
                                <div class="alert alert-danger">
                                    <h6><i class="bi bi-exclamation-triangle me-2"></i>Installation Errors:</h6>
                                    <ul class="mb-0">
                                        <?php foreach ($errors as $error): ?>
                                            <li><?php echo htmlspecialchars($error); ?></li>
                                        <?php endforeach; ?>
                                    </ul>
                                </div>
                            <?php endif; ?>
                            
                            <?php if (!empty($success_messages)): ?>
                                <div class="alert alert-success">
                                    <h6><i class="bi bi-check-circle me-2"></i>Progress:</h6>
                                    <ul class="mb-0">
                                        <?php foreach ($success_messages as $message): ?>
                                            <li><?php echo htmlspecialchars($message); ?></li>
                                        <?php endforeach; ?>
                                    </ul>
                                </div>
                            <?php endif; ?>
                            
                            <form method="POST">
                                <h4 class="mb-4">Database Configuration</h4>
                                
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6">
                                        <label for="db_host" class="form-label">Database Host</label>
                                        <input type="text" class="form-control" id="db_host" name="db_host" 
                                               value="<?php echo htmlspecialchars($db_host); ?>" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="db_name" class="form-label">Database Name</label>
                                        <input type="text" class="form-control" id="db_name" name="db_name" 
                                               value="<?php echo htmlspecialchars($db_name); ?>" required>
                                    </div>
                                </div>
                                
                                <div class="row g-3 mb-4">
                                    <div class="col-md-6">
                                        <label for="db_user" class="form-label">Database Username</label>
                                        <input type="text" class="form-control" id="db_user" name="db_user" 
                                               value="<?php echo htmlspecialchars($db_user); ?>" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="db_pass" class="form-label">Database Password</label>
                                        <input type="password" class="form-control" id="db_pass" name="db_pass" 
                                               value="<?php echo htmlspecialchars($db_pass); ?>">
                                    </div>
                                </div>
                                
                                <hr>
                                
                                <h4 class="mb-4">Admin Account</h4>
                                
                                <div class="row g-3 mb-3">
                                    <div class="col-md-6">
                                        <label for="admin_first_name" class="form-label">First Name</label>
                                        <input type="text" class="form-control" id="admin_first_name" name="admin_first_name" 
                                               value="<?php echo htmlspecialchars($_POST['admin_first_name'] ?? ''); ?>" required>
                                    </div>
                                    <div class="col-md-6">
                                        <label for="admin_last_name" class="form-label">Last Name</label>
                                        <input type="text" class="form-control" id="admin_last_name" name="admin_last_name" 
                                               value="<?php echo htmlspecialchars($_POST['admin_last_name'] ?? ''); ?>" required>
                                    </div>
                                </div>
                                
                                <div class="mb-3">
                                    <label for="admin_email" class="form-label">Admin Email</label>
                                    <input type="email" class="form-control" id="admin_email" name="admin_email" 
                                           value="<?php echo htmlspecialchars($_POST['admin_email'] ?? ''); ?>" required>
                                </div>
                                
                                <div class="mb-4">
                                    <label for="admin_password" class="form-label">Admin Password</label>
                                    <input type="password" class="form-control" id="admin_password" name="admin_password" 
                                           minlength="6" required>
                                    <div class="form-text">Password must be at least 6 characters long.</div>
                                </div>
                                
                                <div class="d-grid">
                                    <button type="submit" class="btn btn-primary btn-lg">
                                        <i class="bi bi-download me-2"></i>Install System
                                    </button>
                                </div>
                            </form>
                        <?php endif; ?>
                    </div>
                </div>
                
                <div class="text-center mt-4">
                    <p class="text-muted">
                        <i class="bi bi-shield-check me-1"></i>
                        Laundry Management System v1.0
                    </p>
                </div>
            </div>
        </div>
    </div>
    
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>

