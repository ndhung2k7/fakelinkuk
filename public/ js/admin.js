// Admin functionality
let systemChart = null;

// Load admin data
async function loadAdminData() {
    try {
        // Check if user is admin
        if (!currentUser || currentUser.role !== 'admin') {
            window.location.href = '/dashboard.html';
            return;
        }
        
        // Show admin link in nav
        const adminLink = document.getElementById('adminLink');
        if (adminLink) adminLink.style.display = 'block';
        
        // Load stats
        await loadSystemStats();
        
        // Load users
        await loadUsers();
        
        // Load all URLs
        await loadAllUrls();
        
        // Load blacklist
        await loadBlacklist();
        
        // Load settings
        await loadSettings();
    } catch (error) {
        console.error('Admin load error:', error);
        showToast('Failed to load admin data', 'error');
    }
}

// Load system stats
async function loadSystemStats() {
    try {
        const response = await fetch('/api/admin/stats', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load stats');
        
        const stats = await response.json();
        
        document.getElementById('totalUsers').textContent = stats.totalUsers;
        document.getElementById('totalUrls').textContent = stats.totalUrls;
        document.getElementById('totalClicks').textContent = stats.totalClicks;
        document.getElementById('avgUrlsPerUser').textContent = 
            stats.totalUsers > 0 ? (stats.totalUrls / stats.totalUsers).toFixed(1) : 0;
        
        // Create system chart
        const ctx = document.getElementById('systemChart')?.getContext('2d');
        if (ctx) {
            if (systemChart) systemChart.destroy();
            
            systemChart = new Chart(ctx, {
                type: 'line',
                data: {
                    labels: stats.clicksOverTime.map(d => d.date),
                    datasets: [{
                        label: 'Clicks',
                        data: stats.clicksOverTime.map(d => d.count),
                        borderColor: '#6366f1',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        tension: 0.4,
                        fill: true,
                        pointBackgroundColor: '#6366f1',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2,
                        pointRadius: 4,
                        pointHoverRadius: 6
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: '#1e293b',
                            titleColor: '#f8fafc',
                            bodyColor: '#94a3b8',
                            borderColor: '#334155',
                            borderWidth: 1
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            },
                            ticks: {
                                color: '#94a3b8',
                                stepSize: 1
                            }
                        },
                        x: {
                            grid: {
                                display: false
                            },
                            ticks: {
                                color: '#94a3b8',
                                maxRotation: 45,
                                minRotation: 45
                            }
                        }
                    }
                }
            });
        }
    } catch (error) {
        console.error('Stats error:', error);
    }
}

// Load users
async function loadUsers() {
    try {
        const response = await fetch('/api/admin/users', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load users');
        
        const users = await response.json();
        
        const tbody = document.getElementById('usersTableBody');
        if (!tbody) return;
        
        if (users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No users found</td></tr>';
            return;
        }
        
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.email)}</td>
                <td>
                    <span class="badge ${user.role === 'admin' ? 'badge-primary' : 'badge-secondary'}">
                        ${user.role}
                    </span>
                </td>
                <td>${user.urlCount}</td>
                <td>${user.totalClicks}</td>
                <td>${formatDate(user.createdAt)}</td>
                <td>
                    <div class="actions-cell">
                        ${user.role !== 'admin' ? `
                            <button class="btn-icon" onclick="deleteUser('${user.id}')" title="Delete User">
                                <i class="fas fa-trash"></i>
                            </button>
                        ` : '<span class="text-muted">Protected</span>'}
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Users error:', error);
    }
}

// Load all URLs
async function loadAllUrls() {
    try {
        const response = await fetch('/api/admin/urls', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load URLs');
        
        const urls = await response.json();
        
        const tbody = document.getElementById('adminUrlsTableBody');
        if (!tbody) return;
        
        if (urls.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center">No URLs found</td></tr>';
            return;
        }
        
        tbody.innerHTML = urls.map(url => {
            const expiryClass = url.expiresAt && new Date(url.expiresAt) < new Date() ? 'expired' : '';
            return `
            <tr class="${expiryClass}">
                <td>
                    <a href="${url.shortUrl}" target="_blank" rel="noopener noreferrer">/${url.shortCode}</a>
                </td>
                <td>
                    <div class="url-cell" title="${escapeHtml(url.longUrl)}">
                        ${escapeHtml(url.longUrl.substring(0, 50))}${url.longUrl.length > 50 ? '...' : ''}
                    </div>
                </td>
                <td>${escapeHtml(url.username)}</td>
                <td>${url.clickCount || 0}</td>
                <td>${formatDate(url.createdAt)}</td>
                <td class="${url.expiresAt && new Date(url.expiresAt) < new Date() ? 'text-danger' : ''}">
                    ${url.expiresAt ? formatDate(url.expiresAt) : 'Never'}
                </td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon" onclick="deleteUrl('${url.id}')" title="Delete URL">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `}).join('');
    } catch (error) {
        console.error('URLs error:', error);
    }
}

// Load blacklist
async function loadBlacklist() {
    try {
        const response = await fetch('/database.json');
        const db = await response.json();
        
        const tbody = document.getElementById('blacklistTableBody');
        if (!tbody) return;
        
        if (!db.blacklist || db.blacklist.length === 0) {
            tbody.innerHTML = '<tr><td colspan="3" class="text-center">No blacklisted domains</td></tr>';
            return;
        }
        
        tbody.innerHTML = db.blacklist.map((domain, index) => `
            <tr>
                <td>${escapeHtml(domain)}</td>
                <td>${formatDate(new Date().toISOString())}</td>
                <td>
                    <button class="btn-icon" onclick="removeFromBlacklist('${domain}')" title="Remove">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Blacklist error:', error);
    }
}

// Load settings
async function loadSettings() {
    try {
        const response = await fetch('/database.json');
        const db = await response.json();
        
        const allowCustomUrls = document.getElementById('allowCustomUrls');
        const defaultUrlLength = document.getElementById('defaultUrlLength');
        const maxUrlLength = document.getElementById('maxUrlLength');
        const requireLogin = document.getElementById('requireLogin');
        const enableBlacklist = document.getElementById('enableBlacklist');
        
        if (allowCustomUrls) allowCustomUrls.checked = db.settings.allowCustomUrls;
        if (defaultUrlLength) defaultUrlLength.value = db.settings.defaultUrlLength;
        if (maxUrlLength) maxUrlLength.value = db.settings.maxUrlLength;
        if (requireLogin) requireLogin.checked = db.settings.requireLogin;
        if (enableBlacklist) enableBlacklist.checked = db.settings.enableBlacklist;
    } catch (error) {
        console.error('Settings error:', error);
    }
}

// Delete user
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? All their links and analytics will also be deleted. This action cannot be undone.')) return;
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showToast('User deleted successfully', 'success');
            loadUsers();
            loadSystemStats();
            loadAllUrls();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to delete user', 'error');
        }
    } catch (error) {
        console.error('Delete user error:', error);
        showToast('Failed to delete user', 'error');
    }
}

// Delete URL (admin)
async function deleteUrl(urlId) {
    if (!confirm('Are you sure you want to delete this URL? This action cannot be undone.')) return;
    
    try {
        const response = await fetch(`/api/urls/${urlId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showToast('URL deleted successfully', 'success');
            loadAllUrls();
            loadSystemStats();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to delete URL', 'error');
        }
    } catch (error) {
        console.error('Delete URL error:', error);
        showToast('Failed to delete URL', 'error');
    }
}

// Add to blacklist
async function addToBlacklist() {
    const input = document.getElementById('blacklistDomain');
    const domain = input?.value.trim();
    
    if (!domain) {
        showToast('Please enter a domain', 'error');
        return;
    }
    
    // Basic domain validation
    const domainRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?\.[a-zA-Z]{2,}$/;
    if (!domainRegex.test(domain)) {
        showToast('Please enter a valid domain (e.g., example.com)', 'error');
        return;
    }
    
    try {
        const response = await fetch('/api/admin/blacklist', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ domain: domain.toLowerCase() }),
            credentials: 'include'
        });
        
        if (response.ok) {
            showToast('Domain added to blacklist', 'success');
            input.value = '';
            loadBlacklist();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to add domain', 'error');
        }
    } catch (error) {
        console.error('Add to blacklist error:', error);
        showToast('Failed to add domain', 'error');
    }
}

// Remove from blacklist
async function removeFromBlacklist(domain) {
    if (!confirm(`Remove ${domain} from blacklist?`)) return;
    
    try {
        const response = await fetch(`/api/admin/blacklist/${encodeURIComponent(domain)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showToast('Domain removed from blacklist', 'success');
            loadBlacklist();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to remove domain', 'error');
        }
    } catch (error) {
        console.error('Remove from blacklist error:', error);
        showToast('Failed to remove domain', 'error');
    }
}

// Save settings
async function saveSettings() {
    const settings = {
        allowCustomUrls: document.getElementById('allowCustomUrls')?.checked ?? true,
        defaultUrlLength: parseInt(document.getElementById('defaultUrlLength')?.value) || 6,
        maxUrlLength: parseInt(document.getElementById('maxUrlLength')?.value) || 8,
        requireLogin: document.getElementById('requireLogin')?.checked ?? true,
        enableBlacklist: document.getElementById('enableBlacklist')?.checked ?? true
    };
    
    // Validate
    if (settings.defaultUrlLength < 4 || settings.defaultUrlLength > 10) {
        showToast('Default URL length must be between 4 and 10', 'error');
        return;
    }
    
    if (settings.maxUrlLength < settings.defaultUrlLength || settings.maxUrlLength > 20) {
        showToast('Max URL length must be greater than default and less than 20', 'error');
        return;
    }
    
    const saveBtn = document.querySelector('#settingsTab .btn-primary');
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }
    
    try {
        const response = await fetch('/api/admin/settings', {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(settings),
            credentials: 'include'
        });
        
        if (response.ok) {
            showToast('Settings saved successfully!', 'success');
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to save settings', 'error');
        }
    } catch (error) {
        console.error('Save settings error:', error);
        showToast('Failed to save settings', 'error');
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save"></i> Save Settings';
        }
    }
}

// Switch tabs
function switchTab(tabName) {
    // Update tab buttons
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Update tab content
    document.querySelectorAll('.tab-content').forEach(tab => {
        tab.classList.remove('active');
    });
    
    const activeTab = document.getElementById(`${tabName}Tab`);
    if (activeTab) {
        activeTab.classList.add('active');
    }
}

// Escape HTML to prevent XSS
function escapeHtml(unsafe) {
    if (!unsafe) return '';
    return unsafe
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// Format date
function formatDate(dateString) {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Check auth and load admin data
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in and is admin
    if (typeof currentUser !== 'undefined') {
        if (currentUser && currentUser.role === 'admin') {
            loadAdminData();
        } else if (currentUser) {
            window.location.href = '/dashboard.html';
        }
    }
});

// Listen for auth changes
document.addEventListener('auth-changed', (e) => {
    if (e.detail.user && e.detail.user.role === 'admin') {
        loadAdminData();
    } else if (e.detail.user) {
        window.location.href = '/dashboard.html';
    } else {
        window.location.href = '/login.html';
    }
});
