-- Laundry Management System Database Schema
-- Created for PHP 8 and MySQL

CREATE DATABASE IF NOT EXISTS laundry_management_system;
USE laundry_management_system;

-- Users table for both regular users and admin
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name VARCHAR(50) NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    phone VARCHAR(15) NOT NULL,
    address TEXT NOT NULL,
    password VARCHAR(255) NOT NULL,
    user_type ENUM('user', 'admin') DEFAULT 'user',
    status ENUM('active', 'inactive') DEFAULT 'active',
    email_verified BOOLEAN DEFAULT FALSE,
    verification_token VARCHAR(255) NULL,
    reset_token VARCHAR(255) NULL,
    reset_token_expires DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Laundry pricing table
CREATE TABLE laundry_pricing (
    id INT AUTO_INCREMENT PRIMARY KEY,
    service_type VARCHAR(100) NOT NULL,
    price_per_kg DECIMAL(10,2) NOT NULL,
    description TEXT,
    status ENUM('active', 'inactive') DEFAULT 'active',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Laundry requests table
CREATE TABLE laundry_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    request_number VARCHAR(20) UNIQUE NOT NULL,
    pickup_date DATE NOT NULL,
    pickup_time TIME NOT NULL,
    delivery_date DATE NULL,
    delivery_time TIME NULL,
    pickup_address TEXT NOT NULL,
    delivery_address TEXT NOT NULL,
    laundry_type VARCHAR(100) NOT NULL,
    weight_kg DECIMAL(5,2) NOT NULL,
    special_instructions TEXT,
    total_amount DECIMAL(10,2) DEFAULT 0.00,
    status ENUM('pending', 'accepted', 'picked_up', 'in_process', 'ready', 'delivered', 'cancelled') DEFAULT 'pending',
    payment_status ENUM('pending', 'paid', 'refunded') DEFAULT 'pending',
    payment_method VARCHAR(50) NULL,
    admin_notes TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Request status history table
CREATE TABLE request_status_history (
    id INT AUTO_INCREMENT PRIMARY KEY,
    request_id INT NOT NULL,
    status VARCHAR(50) NOT NULL,
    notes TEXT,
    changed_by INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (request_id) REFERENCES laundry_requests(id) ON DELETE CASCADE,
    FOREIGN KEY (changed_by) REFERENCES users(id) ON DELETE CASCADE
);

-- Notifications table
CREATE TABLE notifications (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    title VARCHAR(255) NOT NULL,
    message TEXT NOT NULL,
    type ENUM('info', 'success', 'warning', 'error') DEFAULT 'info',
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- System settings table
CREATE TABLE system_settings (
    id INT AUTO_INCREMENT PRIMARY KEY,
    setting_key VARCHAR(100) UNIQUE NOT NULL,
    setting_value TEXT NOT NULL,
    description TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Insert default admin user
INSERT INTO users (first_name, last_name, email, phone, address, password, user_type, status, email_verified) 
VALUES ('Admin', 'User', 'admin@lms.com', '1234567890', 'Admin Address', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'admin', 'active', TRUE);

-- Insert default laundry pricing
INSERT INTO laundry_pricing (service_type, price_per_kg, description) VALUES
('Regular Wash', 5.00, 'Standard washing and drying service'),
('Dry Cleaning', 15.00, 'Professional dry cleaning service'),
('Express Service', 8.00, 'Same day wash and dry service'),
('Delicate Items', 12.00, 'Special care for delicate fabrics'),
('Ironing Only', 3.00, 'Ironing service only');

-- Insert default system settings
INSERT INTO system_settings (setting_key, setting_value, description) VALUES
('site_name', 'Laundry Management System', 'Website name'),
('site_email', 'info@lms.com', 'System email address'),
('currency', 'USD', 'Default currency'),
('tax_rate', '10', 'Tax rate percentage'),
('pickup_time_slots', '09:00,10:00,11:00,14:00,15:00,16:00', 'Available pickup time slots'),
('delivery_time_slots', '09:00,10:00,11:00,14:00,15:00,16:00', 'Available delivery time slots');

-- Create indexes for better performance
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_type ON users(user_type);
CREATE INDEX idx_requests_user ON laundry_requests(user_id);
CREATE INDEX idx_requests_status ON laundry_requests(status);
CREATE INDEX idx_requests_date ON laundry_requests(created_at);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(is_read);

