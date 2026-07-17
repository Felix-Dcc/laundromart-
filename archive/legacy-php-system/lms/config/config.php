<?php
/**
 * Application Configuration for Laundry Management System
 */

// Start session if not already started
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

// Application settings
define('APP_NAME', 'LAUNDROMAT');
define('APP_VERSION', '1.0.0');
define('APP_URL', 'http://localhost/lms');

// File upload settings
define('UPLOAD_DIR', __DIR__ . '/../uploads/');
define('MAX_FILE_SIZE', 5 * 1024 * 1024); // 5MB

// Email settings
define('SMTP_HOST', 'localhost');
define('SMTP_PORT', 587);
define('SMTP_USERNAME', 'noreply@lms.com');
define('SMTP_PASSWORD', '');
define('FROM_EMAIL', 'noreply@lms.com');
define('FROM_NAME', 'Laundry Management System');

// Security settings
define('ENCRYPTION_KEY', 'your-secret-encryption-key-here');
define('PASSWORD_MIN_LENGTH', 6);
define('SESSION_TIMEOUT', 3600); // 1 hour

// Pagination settings
define('RECORDS_PER_PAGE', 10);

// Date and time settings
define('DEFAULT_TIMEZONE', 'America/New_York');
date_default_timezone_set(DEFAULT_TIMEZONE);

// Error reporting (set to 0 in production)
error_reporting(E_ALL);
ini_set('display_errors', 1);

// Include database configuration
require_once __DIR__ . '/database.php';

// Include utility functions
require_once __DIR__ . '/../includes/functions.php';
?>

