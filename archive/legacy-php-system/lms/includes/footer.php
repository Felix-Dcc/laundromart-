        </div>
    </main>

    <!-- Footer -->
    <footer class="bg-dark text-light py-4 mt-5">
        <div class="container">
            <div class="row">
                <div class="col-md-6">
                    <h5 class="fw-bold">
                        <i class="bi bi-droplet-half me-2"></i>
                        <?php echo APP_NAME; ?>
                    </h5>
                    <p class="mb-0">Laundromat.</p>
                </div>
                <div class="col-md-3">
                    <h6 class="fw-bold">Quick Links</h6>
                    <ul class="list-unstyled">
                        <?php if (is_logged_in()): ?>
                            <?php if (is_admin()): ?>
                                <li><a href="<?php echo APP_URL; ?>/admin/dashboard.php" class="text-light text-decoration-none">Dashboard</a></li>
                                <li><a href="<?php echo APP_URL; ?>/admin/requests.php" class="text-light text-decoration-none">Manage Requests</a></li>
                                <li><a href="<?php echo APP_URL; ?>/admin/reports.php" class="text-light text-decoration-none">Reports</a></li>
                            <?php else: ?>
                                <li><a href="<?php echo APP_URL; ?>/user/dashboard.php" class="text-light text-decoration-none">Dashboard</a></li>
                                <li><a href="<?php echo APP_URL; ?>/user/new-request.php" class="text-light text-decoration-none">New Request</a></li>
                                <li><a href="<?php echo APP_URL; ?>/user/requests.php" class="text-light text-decoration-none">My Requests</a></li>
                            <?php endif; ?>
                        <?php else: ?>
                            <li><a href="<?php echo APP_URL; ?>/login.php" class="text-light text-decoration-none">Login</a></li>
                            <li><a href="<?php echo APP_URL; ?>/register.php" class="text-light text-decoration-none">Register</a></li>
                        <?php endif; ?>
                    </ul>
                </div>
                <div class="col-md-3">
                    <h6 class="fw-bold">Contact Info</h6>
                    <ul class="list-unstyled">
                        <li><i class="bi bi-envelope me-2"></i><?php echo get_setting('site_email', 'info@laundromat.com'); ?></li>
                        <li><i class="bi bi-telephone me-2"></i>+233256466136</li>
                        <li><i class="bi bi-geo-alt me-2"></i>Ayensu, 123, round palace</li>
                    </ul>
                </div>
            </div>
            <hr class="my-3">
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
    <script src="<?php echo APP_URL; ?>/assets/js/script.js"></script>
    
    <!-- Page-specific JavaScript -->
    <?php if (isset($page_js)): ?>
        <script src="<?php echo APP_URL; ?>/assets/js/<?php echo $page_js; ?>"></script>
    <?php endif; ?>
</body>
</html>

