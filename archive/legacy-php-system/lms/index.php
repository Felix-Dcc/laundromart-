<?php
require_once 'config/config.php';

$page_title = 'Welcome';

// Redirect logged-in users to their dashboard
if (is_logged_in()) {
    if (is_admin()) {
        header('Location: admin/dashboard.php');
    } else {
        header('Location: user/dashboard.php');
    }
    exit();
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
    <!-- Navigation -->
    <nav class="navbar navbar-expand-lg navbar-dark bg-primary">
        <div class="container">
            <a class="navbar-brand fw-bold" href="index.php">
                <i class="bi bi-droplet-half me-2"></i>
                <?php echo APP_NAME; ?>
            </a>
            
            <button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#navbarNav">
                <span class="navbar-toggler-icon"></span>
            </button>
            
            <div class="collapse navbar-collapse" id="navbarNav">
                <ul class="navbar-nav ms-auto">
                    <li class="nav-item">
                        <a class="nav-link" href="#features">Features</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#services">Services</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="#contact">Contact</a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="login.php">
                            <i class="bi bi-box-arrow-in-right me-1"></i>Login
                        </a>
                    </li>
                    <li class="nav-item">
                        <a class="nav-link" href="register.php">
                            <i class="bi bi-person-plus me-1"></i>Register
                        </a>
                    </li>
                </ul>
            </div>
        </div>
    </nav>

    <!-- Hero Section -->
    <section class="hero-section py-5">
        <div class="container">
            <div class="row align-items-center min-vh-75">
                <div class="col-lg-6">
                    <div class="hero-content">
                        <h1 class="display-4 fw-bold text-primary mb-4">
                            Professional Laundry Services Made Easy
                        </h1>
                        <p class="lead text-muted mb-4">
                            Experience hassle-free laundry management with our modern system. 
                            Schedule pickups, track your orders, and enjoy fresh, clean clothes 
                            delivered right to your doorstep.
                        </p>
                        <div class="d-flex flex-wrap gap-3">
                            <a href="register.php" class="btn btn-primary btn-lg">
                                <i class="bi bi-person-plus me-2"></i>Get Started
                            </a>
                            <a href="login.php" class="btn btn-outline-primary btn-lg">
                                <i class="bi bi-box-arrow-in-right me-2"></i>Sign In
                            </a>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="hero-image text-center">
                        <i class="bi bi-droplet-half display-1 text-primary"></i>
                        <div class="mt-4">
                            <div class="row g-3">
                                <div class="col-6">
                                    <div class="card border-0 shadow-sm">
                                        <div class="card-body text-center">
                                            <i class="bi bi-clock text-success fs-2"></i>
                                            <h6 class="mt-2 mb-0">Quick Service</h6>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card border-0 shadow-sm">
                                        <div class="card-body text-center">
                                            <i class="bi bi-truck text-info fs-2"></i>
                                            <h6 class="mt-2 mb-0">Free Pickup</h6>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card border-0 shadow-sm">
                                        <div class="card-body text-center">
                                            <i class="bi bi-shield-check text-warning fs-2"></i>
                                            <h6 class="mt-2 mb-0">Quality Care</h6>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6">
                                    <div class="card border-0 shadow-sm">
                                        <div class="card-body text-center">
                                            <i class="bi bi-phone text-danger fs-2"></i>
                                            <h6 class="mt-2 mb-0">24/7 Support</h6>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Features Section -->
    <section id="features" class="py-5 bg-light">
        <div class="container">
            <div class="row">
                <div class="col-lg-8 mx-auto text-center mb-5">
                    <h2 class="display-5 fw-bold text-dark">Why Choose Our Service?</h2>
                    <p class="lead text-muted">
                        We provide comprehensive laundry management solutions with modern technology
                    </p>
                </div>
            </div>
            <div class="row g-4">
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-4">
                            <div class="feature-icon mb-3">
                                <i class="bi bi-calendar-check text-primary fs-1"></i>
                            </div>
                            <h5 class="card-title">Easy Scheduling</h5>
                            <p class="card-text text-muted">
                                Schedule pickup and delivery times that work for your busy lifestyle
                            </p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-4">
                            <div class="feature-icon mb-3">
                                <i class="bi bi-geo-alt text-success fs-1"></i>
                            </div>
                            <h5 class="card-title">Real-time Tracking</h5>
                            <p class="card-text text-muted">
                                Track your laundry status from pickup to delivery in real-time
                            </p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-4">
                            <div class="feature-icon mb-3">
                                <i class="bi bi-credit-card text-info fs-1"></i>
                            </div>
                            <h5 class="card-title">Secure Payments</h5>
                            <p class="card-text text-muted">
                                Multiple payment options with secure transaction processing
                            </p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-4">
                            <div class="feature-icon mb-3">
                                <i class="bi bi-people text-warning fs-1"></i>
                            </div>
                            <h5 class="card-title">Professional Staff</h5>
                            <p class="card-text text-muted">
                                Experienced and trained professionals handle your garments with care
                            </p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-4">
                            <div class="feature-icon mb-3">
                                <i class="bi bi-bell text-danger fs-1"></i>
                            </div>
                            <h5 class="card-title">Smart Notifications</h5>
                            <p class="card-text text-muted">
                                Get notified about pickup, processing, and delivery updates
                            </p>
                        </div>
                    </div>
                </div>
                <div class="col-md-6 col-lg-4">
                    <div class="card h-100 border-0 shadow-sm">
                        <div class="card-body text-center p-4">
                            <div class="feature-icon mb-3">
                                <i class="bi bi-award text-purple fs-1"></i>
                            </div>
                            <h5 class="card-title">Quality Guarantee</h5>
                            <p class="card-text text-muted">
                                100% satisfaction guarantee with quality assurance on every order
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Services Section -->
    <section id="services" class="py-5">
        <div class="container">
            <div class="row">
                <div class="col-lg-8 mx-auto text-center mb-5">
                    <h2 class="display-5 fw-bold text-dark">Our Services</h2>
                    <p class="lead text-muted">
                        Comprehensive laundry solutions for all your needs
                    </p>
                </div>
            </div>
            <div class="row g-4">
                <div class="col-lg-6">
                    <div class="service-item d-flex">
                        <div class="service-icon me-4">
                            <i class="bi bi-droplet text-primary fs-2"></i>
                        </div>
                        <div class="service-content">
                            <h5>Regular Wash & Dry</h5>
                            <p class="text-muted mb-0">
                                Standard washing and drying service for everyday clothes
                            </p>
                            <small class="text-success fw-bold">Starting at $5.00/kg</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="service-item d-flex">
                        <div class="service-icon me-4">
                            <i class="bi bi-wind text-info fs-2"></i>
                        </div>
                        <div class="service-content">
                            <h5>Dry Cleaning</h5>
                            <p class="text-muted mb-0">
                                Professional dry cleaning for delicate and formal wear
                            </p>
                            <small class="text-success fw-bold">Starting at $15.00/kg</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="service-item d-flex">
                        <div class="service-icon me-4">
                            <i class="bi bi-lightning text-warning fs-2"></i>
                        </div>
                        <div class="service-content">
                            <h5>Express Service</h5>
                            <p class="text-muted mb-0">
                                Same-day wash and dry service for urgent needs
                            </p>
                            <small class="text-success fw-bold">Starting at $8.00/kg</small>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6">
                    <div class="service-item d-flex">
                        <div class="service-icon me-4">
                            <i class="bi bi-heart text-danger fs-2"></i>
                        </div>
                        <div class="service-content">
                            <h5>Delicate Care</h5>
                            <p class="text-muted mb-0">
                                Special care for delicate fabrics and premium garments
                            </p>
                            <small class="text-success fw-bold">Starting at $12.00/kg</small>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Contact Section -->
    <section id="contact" class="py-5 bg-primary text-white">
        <div class="container">
            <div class="row">
                <div class="col-lg-8 mx-auto text-center">
                    <h2 class="display-5 fw-bold mb-4">Ready to Get Started?</h2>
                    <p class="lead mb-4">
                        Join thousands of satisfied customers who trust us with their laundry needs
                    </p>
                    <div class="d-flex flex-wrap justify-content-center gap-3 mb-4">
                        <a href="register.php" class="btn btn-light btn-lg">
                            <i class="bi bi-person-plus me-2"></i>Create Account
                        </a>
                        <a href="login.php" class="btn btn-outline-light btn-lg">
                            <i class="bi bi-box-arrow-in-right me-2"></i>Sign In
                        </a>
                    </div>
                    <div class="row g-4 mt-4">
                        <div class="col-md-4">
                            <i class="bi bi-telephone fs-2 mb-3"></i>
                            <h6>Call Us</h6>
                            <p class="mb-0">+1 (555) 123-4567</p>
                        </div>
                        <div class="col-md-4">
                            <i class="bi bi-envelope fs-2 mb-3"></i>
                            <h6>Email Us</h6>
                            <p class="mb-0"><?php echo get_setting('site_email', 'info@lms.com'); ?></p>
                        </div>
                        <div class="col-md-4">
                            <i class="bi bi-geo-alt fs-2 mb-3"></i>
                            <h6>Visit Us</h6>
                            <p class="mb-0">123 Laundry St, City, State</p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Footer -->
    <footer class="bg-dark text-light py-4">
        <div class="container">
            <div class="row align-items-center">
                <div class="col-md-6">
                    <p class="mb-0">&copy; <?php echo date('Y'); ?> <?php echo APP_NAME; ?>. All rights reserved.</p>
                </div>
              
            </div>
        </div>
    </footer>

    <!-- Bootstrap 5 JS Bundle -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
    
    <!-- Custom JavaScript -->
    <script src="assets/js/script.js"></script>
    
    <script>
        // Smooth scrolling for navigation links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
        
        // Add animation on scroll
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };
        
        const observer = new IntersectionObserver(function(entries) {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('fade-in');
                }
            });
        }, observerOptions);
        
        // Observe all cards and service items
        document.querySelectorAll('.card, .service-item').forEach(el => {
            observer.observe(el);
        });
    </script>
</body>
</html>

