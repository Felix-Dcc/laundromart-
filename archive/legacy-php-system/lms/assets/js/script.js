/**
 * Custom JavaScript for Laundry Management System
 */

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Initialize tooltips
    var tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    var tooltipList = tooltipTriggerList.map(function (tooltipTriggerEl) {
        return new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize popovers
    var popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    var popoverList = popoverTriggerList.map(function (popoverTriggerEl) {
        return new bootstrap.Popover(popoverTriggerEl);
    });

    // Auto-hide alerts after 5 seconds
    setTimeout(function() {
        var alerts = document.querySelectorAll('.alert');
        alerts.forEach(function(alert) {
            var bsAlert = new bootstrap.Alert(alert);
            bsAlert.close();
        });
    }, 5000);

    // Add fade-in animation to cards
    var cards = document.querySelectorAll('.card');
    cards.forEach(function(card, index) {
        setTimeout(function() {
            card.classList.add('fade-in');
        }, index * 100);
    });
});

// Form validation functions
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

function validatePhone(phone) {
    const re = /^[0-9+\-\s()]+$/;
    return re.test(phone);
}

function validatePassword(password) {
    return password.length >= 6;
}

// Real-time form validation
function setupFormValidation(formId) {
    const form = document.getElementById(formId);
    if (!form) return;

    const inputs = form.querySelectorAll('input, select, textarea');
    
    inputs.forEach(function(input) {
        input.addEventListener('blur', function() {
            validateField(this);
        });
        
        input.addEventListener('input', function() {
            clearFieldError(this);
        });
    });
}

function validateField(field) {
    const value = field.value.trim();
    const fieldName = field.name;
    let isValid = true;
    let errorMessage = '';

    // Remove existing error styling
    clearFieldError(field);

    // Required field validation
    if (field.hasAttribute('required') && !value) {
        isValid = false;
        errorMessage = 'This field is required.';
    }
    
    // Email validation
    else if (fieldName === 'email' && value && !validateEmail(value)) {
        isValid = false;
        errorMessage = 'Please enter a valid email address.';
    }
    
    // Phone validation
    else if (fieldName === 'phone' && value && !validatePhone(value)) {
        isValid = false;
        errorMessage = 'Please enter a valid phone number.';
    }
    
    // Password validation
    else if (fieldName === 'password' && value && !validatePassword(value)) {
        isValid = false;
        errorMessage = 'Password must be at least 6 characters long.';
    }
    
    // Confirm password validation
    else if (fieldName === 'confirm_password' && value) {
        const passwordField = document.querySelector('input[name="password"]');
        if (passwordField && value !== passwordField.value) {
            isValid = false;
            errorMessage = 'Passwords do not match.';
        }
    }

    if (!isValid) {
        showFieldError(field, errorMessage);
    }

    return isValid;
}

function showFieldError(field, message) {
    field.classList.add('is-invalid');
    
    // Remove existing error message
    const existingError = field.parentNode.querySelector('.invalid-feedback');
    if (existingError) {
        existingError.remove();
    }
    
    // Add new error message
    const errorDiv = document.createElement('div');
    errorDiv.className = 'invalid-feedback';
    errorDiv.textContent = message;
    field.parentNode.appendChild(errorDiv);
}

function clearFieldError(field) {
    field.classList.remove('is-invalid');
    const errorDiv = field.parentNode.querySelector('.invalid-feedback');
    if (errorDiv) {
        errorDiv.remove();
    }
}

// Form submission with validation
function submitFormWithValidation(formId) {
    const form = document.getElementById(formId);
    if (!form) return false;

    const inputs = form.querySelectorAll('input, select, textarea');
    let isFormValid = true;

    inputs.forEach(function(input) {
        if (!validateField(input)) {
            isFormValid = false;
        }
    });

    if (!isFormValid) {
        showAlert('Please correct the errors in the form.', 'danger');
        return false;
    }

    return true;
}

// Show loading spinner
function showLoading() {
    const spinner = document.createElement('div');
    spinner.className = 'spinner-overlay';
    spinner.innerHTML = `
        <div class="spinner-border spinner-border-custom text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
        </div>
    `;
    document.body.appendChild(spinner);
}

function hideLoading() {
    const spinner = document.querySelector('.spinner-overlay');
    if (spinner) {
        spinner.remove();
    }
}

// Show alert message
function showAlert(message, type = 'info') {
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type} alert-dismissible fade show`;
    alertDiv.innerHTML = `
        <i class="bi bi-info-circle me-2"></i>
        ${message}
        <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    `;
    
    const container = document.querySelector('.container');
    if (container) {
        container.insertBefore(alertDiv, container.firstChild);
        
        // Auto-hide after 5 seconds
        setTimeout(function() {
            const bsAlert = new bootstrap.Alert(alertDiv);
            bsAlert.close();
        }, 5000);
    }
}

// Confirm dialog
function confirmAction(message, callback) {
    if (confirm(message)) {
        callback();
    }
}

// Delete confirmation
function confirmDelete(url, itemName = 'item') {
    const message = `Are you sure you want to delete this ${itemName}? This action cannot be undone.`;
    if (confirm(message)) {
        window.location.href = url;
    }
}

// Auto-calculate laundry cost
function calculateLaundryCost() {
    const serviceSelect = document.getElementById('laundry_type');
    const weightInput = document.getElementById('weight_kg');
    const totalDisplay = document.getElementById('total_amount');
    
    if (!serviceSelect || !weightInput || !totalDisplay) return;
    
    const serviceType = serviceSelect.value;
    const weight = parseFloat(weightInput.value) || 0;
    
    if (serviceType && weight > 0) {
        // This would typically fetch pricing from server
        // For now, using static pricing
        const pricing = {
            'Regular Wash': 5.00,
            'Dry Cleaning': 15.00,
            'Express Service': 8.00,
            'Delicate Items': 12.00,
            'Ironing Only': 3.00
        };
        
        const pricePerKg = pricing[serviceType] || 0;
        const total = pricePerKg * weight;
        
        totalDisplay.textContent = '$' + total.toFixed(2);
    } else {
        totalDisplay.textContent = '$0.00';
    }
}

// Setup auto-calculation for laundry request form
function setupLaundryCostCalculation() {
    const serviceSelect = document.getElementById('laundry_type');
    const weightInput = document.getElementById('weight_kg');
    
    if (serviceSelect && weightInput) {
        serviceSelect.addEventListener('change', calculateLaundryCost);
        weightInput.addEventListener('input', calculateLaundryCost);
    }
}

// File upload preview
function setupFileUploadPreview(inputId, previewId) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    
    if (!input || !preview) return;
    
    input.addEventListener('change', function(e) {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = function(e) {
                if (file.type.startsWith('image/')) {
                    preview.innerHTML = `<img src="${e.target.result}" class="img-thumbnail" style="max-width: 200px;">`;
                } else {
                    preview.innerHTML = `<p class="text-muted">File selected: ${file.name}</p>`;
                }
            };
            reader.readAsDataURL(file);
        } else {
            preview.innerHTML = '';
        }
    });
}

// Data table search and filter
function setupDataTableSearch(tableId, searchInputId) {
    const table = document.getElementById(tableId);
    const searchInput = document.getElementById(searchInputId);
    
    if (!table || !searchInput) return;
    
    searchInput.addEventListener('input', function() {
        const searchTerm = this.value.toLowerCase();
        const rows = table.querySelectorAll('tbody tr');
        
        rows.forEach(function(row) {
            const text = row.textContent.toLowerCase();
            if (text.includes(searchTerm)) {
                row.style.display = '';
            } else {
                row.style.display = 'none';
            }
        });
    });
}

// Auto-refresh notifications
function setupNotificationRefresh() {
    setInterval(function() {
        fetch('ajax/get_notifications.php')
            .then(response => response.json())
            .then(data => {
                if (data.count > 0) {
                    const badge = document.querySelector('.navbar .badge');
                    if (badge) {
                        badge.textContent = data.count;
                        badge.style.display = 'inline';
                    }
                }
            })
            .catch(error => console.log('Notification refresh error:', error));
    }, 30000); // Refresh every 30 seconds
}

// Print functionality
function printPage() {
    window.print();
}

function printElement(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;
    
    const printWindow = window.open('', '_blank');
    printWindow.document.write(`
        <html>
            <head>
                <title>Print</title>
                <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
                <style>
                    body { padding: 20px; }
                    .no-print { display: none !important; }
                </style>
            </head>
            <body>
                ${element.innerHTML}
            </body>
        </html>
    `);
    printWindow.document.close();
    printWindow.print();
}

// Export to CSV
function exportTableToCSV(tableId, filename = 'export.csv') {
    const table = document.getElementById(tableId);
    if (!table) return;
    
    const rows = table.querySelectorAll('tr');
    const csvContent = [];
    
    rows.forEach(function(row) {
        const cols = row.querySelectorAll('td, th');
        const rowData = [];
        cols.forEach(function(col) {
            rowData.push('"' + col.textContent.replace(/"/g, '""') + '"');
        });
        csvContent.push(rowData.join(','));
    });
    
    const csvString = csvContent.join('\n');
    const blob = new Blob([csvString], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    
    window.URL.revokeObjectURL(url);
}

// Initialize page-specific functionality
function initializePage() {
    // Setup form validation for common forms
    setupFormValidation('loginForm');
    setupFormValidation('registerForm');
    setupFormValidation('requestForm');
    setupFormValidation('profileForm');
    
    // Setup laundry cost calculation
    setupLaundryCostCalculation();
    
    // Setup notification refresh for logged-in users
    if (document.querySelector('.navbar .badge')) {
        setupNotificationRefresh();
    }
    
    // Setup data table search
    setupDataTableSearch('requestsTable', 'searchInput');
    setupDataTableSearch('usersTable', 'searchInput');
}

// Initialize everything when page loads
document.addEventListener('DOMContentLoaded', initializePage);

