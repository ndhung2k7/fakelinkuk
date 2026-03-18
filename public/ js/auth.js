// Auth management
let currentUser = null;

// Check if user is logged in
async function checkAuth() {
    try {
        const response = await fetch('/api/user', {
            credentials: 'include'
        });
        
        if (response.ok) {
            currentUser = await response.json();
            updateUIForLoggedInUser();
        } else {
            updateUIForLoggedOutUser();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        updateUIForLoggedOutUser();
    }
}

// Update UI for logged in user
function updateUIForLoggedInUser() {
    const navAuth = document.getElementById('navAuth');
    const navUser = document.getElementById('navUser');
    const userName = document.getElementById('userName');
    const adminLink = document.getElementById('adminLink');
    
    if (navAuth) navAuth.style.display = 'none';
    if (navUser) {
        navUser.style.display = 'flex';
        if (userName) userName.textContent = currentUser.username;
    }
    
    // Show admin link if user is admin
    if (adminLink && currentUser.role === 'admin') {
        adminLink.style.display = 'block';
    }
    
    // Trigger custom event
    document.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: currentUser } }));
}

// Update UI for logged out user
function updateUIForLoggedOutUser() {
    const navAuth = document.getElementById('navAuth');
    const navUser = document.getElementById('navUser');
    const adminLink = document.getElementById('adminLink');
    
    if (navAuth) navAuth.style.display = 'flex';
    if (navUser) navUser.style.display = 'none';
    if (adminLink) adminLink.style.display = 'none';
    
    currentUser = null;
    document.dispatchEvent(new CustomEvent('auth-changed', { detail: { user: null } }));
}

// Login function
async function login(email, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Login successful!', 'success');
            currentUser = data.user;
            updateUIForLoggedInUser();
            
            // Redirect based on role
            if (data.user.role === 'admin') {
                window.location.href = '/admin.html';
            } else {
                window.location.href = '/dashboard.html';
            }
        } else {
            showToast(data.error || 'Login failed', 'error');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('Login failed. Please try again.', 'error');
    }
}

// Register function
async function register(username, email, password) {
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ username, email, password }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('Registration successful!', 'success');
            currentUser = data.user;
            updateUIForLoggedInUser();
            window.location.href = '/dashboard.html';
        } else {
            showToast(data.error || 'Registration failed', 'error');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showToast('Registration failed. Please try again.', 'error');
    }
}

// Logout function
async function logout() {
    try {
        await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        showToast('Logged out successfully', 'success');
        currentUser = null;
        updateUIForLoggedOutUser();
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
        showToast('Logout failed', 'error');
    }
}

// Check auth on page load
document.addEventListener('DOMContentLoaded', checkAuth);
