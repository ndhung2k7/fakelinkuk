// Dashboard functionality
let clicksChart = null;
let currentEditId = null;
let currentAnalyticsId = null;

// Load dashboard data
async function loadDashboard() {
    try {
        const response = await fetch('/api/urls', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            if (response.status === 401) {
                window.location.href = '/login.html';
                return;
            }
            throw new Error('Failed to load URLs');
        }
        
        const urls = await response.json();
        displayUrls(urls);
        updateStats(urls);
        loadAnalytics(urls);
    } catch (error) {
        console.error('Dashboard error:', error);
        showToast('Failed to load dashboard', 'error');
    }
}

// Display URLs in table
function displayUrls(urls) {
    const tbody = document.getElementById('urlsTableBody');
    
    if (urls.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center">
                    <div class="empty-state">
                        <i class="fas fa-link"></i>
                        <p>No links yet. Create your first shortened URL!</p>
                        <a href="/" class="btn btn-primary">Create Link</a>
                    </div>
                </td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = urls.map(url => `
        <tr>
            <td>
                <div class="url-cell">
                    <a href="${url.shortUrl}" target="_blank">${url.shortUrl}</a>
                </div>
            </td>
            <td>
                <div class="url-cell" title="${url.longUrl}">
                    ${url.longUrl}
                </div>
            </td>
            <td>${url.clickCount || 0}</td>
            <td>${formatDate(url.createdAt)}</td>
            <td>${url.expiresAt ? formatDate(url.expiresAt) : 'Never'}</td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon" onclick="showAnalytics('${url.id}')" title="Analytics">
                        <i class="fas fa-chart-line"></i>
                    </button>
                    <button class="btn-icon" onclick="editUrl('${url.id}', '${url.longUrl}', '${url.expiresAt || ''}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteUrl('${url.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `).join('');
}

// Update stats
function updateStats(urls) {
    const totalUrls = urls.length;
    const totalClicks = urls.reduce((sum, url) => sum + (url.clickCount || 0), 0);
    const avgClicks = totalUrls > 0 ? Math.round(totalClicks / totalUrls) : 0;
    const activeLinks = urls.filter(url => !url.expiresAt || new Date(url.expiresAt) > new Date()).length;
    
    document.getElementById('totalUrls').textContent = totalUrls;
    document.getElementById('totalClicks').textContent = totalClicks;
    document.getElementById('avgClicks').textContent = avgClicks;
    document.getElementById('activeLinks').textContent = activeLinks;
}

// Load analytics
async function loadAnalytics(urls) {
    // Get today's clicks
    const today = new Date().toDateString();
    const todayClicks = urls.reduce((sum, url) => {
        // This would need real click data from server
        return sum + (url.clickCount || 0);
    }, 0);
    
    document.getElementById('todayClicks').textContent = todayClicks;
    
    // Prepare chart data
    const last7Days = [];
    const clicksData = [];
    
    for (let i = 6; i >= 0; i--) {
        const date = new Date();
        date.setDate(date.getDate() - i);
        last7Days.push(date.toLocaleDateString('en-US', { weekday: 'short' }));
        clicksData.push(Math.floor(Math.random() * 10)); // Mock data - replace with real data
    }
    
    // Create chart
    const ctx = document.getElementById('clicksChart')?.getContext('2d');
    if (ctx) {
        if (clicksChart) clicksChart.destroy();
        
        clicksChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: last7Days,
                datasets: [{
                    label: 'Clicks',
                    data: clicksData,
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
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    },
                    x: {
                        grid: {
                            display: false
                        },
                        ticks: {
                            color: '#94a3b8'
                        }
                    }
                }
            }
        });
    }
}

// Show analytics modal
async function showAnalytics(urlId) {
    currentAnalyticsId = urlId;
    
    try {
        const response = await fetch(`/api/urls/${urlId}/analytics`, {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load analytics');
        
        const data = await response.json();
        
        // Update stats
        document.getElementById('detailTotalClicks').textContent = data.totalClicks;
        document.getElementById('detailUniqueIPs').textContent = new Set(data.recentClicks.map(c => c.ip)).size;
        document.getElementById('detailCountries').textContent = data.clicksByCountry.length;
        
        // Create country chart
        const countryCtx = document.getElementById('countryChart')?.getContext('2d');
        if (countryCtx) {
            new Chart(countryCtx, {
                type: 'doughnut',
                data: {
                    labels: data.clicksByCountry.map(c => c.country),
                    datasets: [{
                        data: data.clicksByCountry.map(c => c.count),
                        backgroundColor: [
                            '#6366f1',
                            '#10b981',
                            '#f59e0b',
                            '#ef4444',
                            '#8b5cf6'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#94a3b8'
                            }
                        }
                    }
                }
            });
        }
        
        // Create device chart
        const deviceCtx = document.getElementById('deviceChart')?.getContext('2d');
        if (deviceCtx) {
            new Chart(deviceCtx, {
                type: 'pie',
                data: {
                    labels: data.clicksByDevice.map(d => d.device),
                    datasets: [{
                        data: data.clicksByDevice.map(d => d.count),
                        backgroundColor: [
                            '#6366f1',
                            '#10b981',
                            '#f59e0b',
                            '#8b5cf6'
                        ]
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#94a3b8'
                            }
                        }
                    }
                }
            });
        }
        
        // Show recent clicks
        const recentClicks = document.getElementById('recentClicks');
        recentClicks.innerHTML = data.recentClicks.map(click => `
            <div class="click-item">
                <div class="click-info">
                    <span class="click-country">${click.country}</span>
                    <span class="click-device">${click.device}</span>
                    <span class="click-browser">${click.browser}</span>
                </div>
                <div class="click-time">${formatTime(click.timestamp)}</div>
            </div>
        `).join('');
        
        openModal('analyticsModal');
    } catch (error) {
        console.error('Analytics error:', error);
        showToast('Failed to load analytics', 'error');
    }
}

// Edit URL
function editUrl(id, longUrl, expiresAt) {
    currentEditId = id;
    document.getElementById('editUrl').value = longUrl;
    
    if (expiresAt) {
        document.getElementById('editExpires').value = expiresAt.slice(0, 16);
    } else {
        document.getElementById('editExpires').value = '';
    }
    
    openModal('editModal');
}

// Save edit
async function saveEdit() {
    if (!currentEditId) return;
    
    const newUrl = document.getElementById('editUrl').value;
    const newExpires = document.getElementById('editExpires').value;
    
    try {
        const response = await fetch(`/api/urls/${currentEditId}`, {
            method: 'PUT',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                longUrl: newUrl,
                expiresAt: newExpires ? new Date(newExpires).toISOString() : null
            }),
            credentials: 'include'
        });
        
        if (response.ok) {
            showToast('URL updated successfully', 'success');
            closeModal('editModal');
            loadDashboard();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to update URL', 'error');
        }
    } catch (error) {
        console.error('Edit error:', error);
        showToast('Failed to update URL', 'error');
    }
}

// Delete URL
async function deleteUrl(id) {
    if (!confirm('Are you sure you want to delete this link?')) return;
    
    try {
        const response = await fetch(`/api/urls/${id}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        
        if (response.ok) {
            showToast('URL deleted successfully', 'success');
            loadDashboard();
        } else {
            const data = await response.json();
            showToast(data.error || 'Failed to delete URL', 'error');
        }
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Failed to delete URL', 'error');
    }
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffTime = Math.abs(now - date);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
    
    return date.toLocaleDateString();
}

// Format time
function formatTime(dateString) {
    const date = new Date(dateString);
    return date.toLocaleTimeString();
}

// Modal functions
function openModal(modalId) {
    document.getElementById(modalId).classList.add('active');
}

function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');
}

// Check auth and load dashboard
document.addEventListener('auth-changed', (e) => {
    if (e.detail.user) {
        loadDashboard();
    } else {
        window.location.href = '/login.html';
    }
});
