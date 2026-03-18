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
                        fill: true
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            display: false
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            grid: {
                                color: 'rgba(255, 255, 255, 0.1)'
                            }
                        },
                        x: {
                            grid: {
                                display: false
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
        tbody.innerHTML = users.map(user => `
            <tr>
                <td>${user.username}</td>
                <td>${user.email}</td>
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
                        ` : ''}
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
        const response = await fetch('/api/urls', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load URLs');
        
        const urls = await response.json();
        
        const tbody = document.getElementById('adminUrlsTableBody');
        tbody.innerHTML = urls.map(url => `
            <tr>
                <td>
                    <a href="${url.shortUrl}" target="_blank">${url.shortUrl}</a>
                </td>
                <td>
                    <div class="url-cell" title="${url.longUrl}">
                        ${url.longUrl}
                    </div>
                </td>
                <td>${url.userId}</td>
                <td>${url.clickCount || 0}</td>
                <td>${formatDate(url.createdAt)}</td>
                <td>${url.expiresAt ? formatDate(url.expiresAt) : 'Never'}</td>
                <td>
                    <div class="actions-cell">
                        <button class="btn-icon" onclick="deleteUrl('${url.id}')" title="Delete URL">
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('URLs error:', error);
    }
}

// Load blacklist
async function loadBlacklist() {
    try {
        const db = await fetch('/database.json').then(res => res.json());
        
        const tbody = document.getElementById('blacklistTableBody');
        tbody.innerHTML = db.blacklist.map((domain, index) => `
            <tr>
                <td>${domain}</td>
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
        const db = await fetch('/database.json').then(res => res.json());
        
        document.getElementById('allowCustomUrls').checked = db.settings.allowCustomUrls;
        document.getElementById('defaultUrlLength').value = db.settings.defaultUrlLength;
        document.getElementById('maxUrlLength').value = db.settings.maxUrlLength;
    } catch (error) {
        console.error('Settings error:', error);
    }
}

// Delete user
async function deleteUser(userId) {
    if (!confirm('Are you sure you want to delete this user? All their links will also be deleted.')) return;
    
    try {
        const response = await fetch(`/api/admin/users/${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showToast('User deleted successfully', 'success');
            loadUsers();
            loadSystemStats();
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
    if (!confirm('Are you sure you want to delete this URL?')) return;
    
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
    const domain = document.getElementById('blacklistDomain').value.trim();
    
    if (!domain) {
        showToast('Please enter a domain', 'error');
        return;
    }
    
    // This would need a backend API to update blacklist
    showToast('Blacklist management coming soon!', 'info');
}

// Remove from blacklist
function removeFromBlacklist(domain) {
    showToast('Blacklist management coming soon!', 'info');
}

// Save settings
async function saveSettings() {
    const settings = {
        allowCustomUrls: document.getElementById('allowCustomUrls').checked,
        defaultUrlLength: parseInt(document.getElementById('defaultUrlLength').value),
        maxUrlLength: parseInt(document.getElementById('maxUrlLength').value)
    };
    
    // This would need a backend API to save settings
    showToast('Settings saved successfully!', 'success');
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
    document.getElementById(`${tabName}Tab`).classList.add('active');
}

// Check auth and load admin data
document.addEventListener('auth-changed', (e) => {
    if (e.detail.user && e.detail.user.role === 'admin') {
        loadAdminData();
    } else if (e.detail.user) {
        window.location.href = '/dashboard.html';
    } else {
        window.location.href = '/login.html';
    }
});
