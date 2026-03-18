// Dashboard functionality
let clicksChart = null;
let countryChart = null;
let deviceChart = null;
let currentEditId = null;
let currentAnalyticsId = null;

// Load dashboard data
async function loadDashboard() {
    try {
        const response = await fetch('/api/urls', {
            credentials: 'include',
            headers: {
                'Cache-Control': 'no-cache'
            }
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
        await loadAnalytics(urls);
    } catch (error) {
        console.error('Dashboard error:', error);
        showToast('Failed to load dashboard', 'error');
    }
}

// Display URLs in table
function displayUrls(urls) {
    const tbody = document.getElementById('urlsTableBody');
    
    if (!tbody) return;
    
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
    
    tbody.innerHTML = urls.map(url => {
        const expiryClass = url.expiresAt && new Date(url.expiresAt) < new Date() ? 'expired' : '';
        return `
        <tr class="${expiryClass}">
            <td>
                <div class="url-cell">
                    <a href="${url.shortUrl}" target="_blank" rel="noopener noreferrer">${url.shortUrl}</a>
                    <button class="btn-icon copy-short" onclick="copyToClipboard('${url.shortUrl}')" title="Copy short URL">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </td>
            <td>
                <div class="url-cell" title="${url.longUrl}">
                    ${url.longUrl.substring(0, 50)}${url.longUrl.length > 50 ? '...' : ''}
                </div>
            </td>
            <td class="click-count">${url.clickCount || 0}</td>
            <td>${formatDate(url.createdAt)}</td>
            <td class="${url.expiresAt && new Date(url.expiresAt) < new Date() ? 'text-danger' : ''}">
                ${url.expiresAt ? formatDate(url.expiresAt) : 'Never'}
            </td>
            <td>
                <div class="actions-cell">
                    <button class="btn-icon" onclick="showAnalytics('${url.id}')" title="Analytics">
                        <i class="fas fa-chart-line"></i>
                    </button>
                    <button class="btn-icon" onclick="editUrl('${url.id}', '${url.longUrl.replace(/'/g, "\\'")}', '${url.expiresAt || ''}')" title="Edit">
                        <i class="fas fa-edit"></i>
                    </button>
                    <button class="btn-icon" onclick="deleteUrl('${url.id}')" title="Delete">
                        <i class="fas fa-trash"></i>
                    </button>
                </div>
            </td>
        </tr>
    `}).join('');
}

// Update stats
function updateStats(urls) {
    const totalUrls = urls.length;
    const totalClicks = urls.reduce((sum, url) => sum + (url.clickCount || 0), 0);
    const avgClicks = totalUrls > 0 ? (totalClicks / totalUrls).toFixed(1) : 0;
    const activeLinks = urls.filter(url => !url.expiresAt || new Date(url.expiresAt) > new Date()).length;
    
    const totalUrlsEl = document.getElementById('totalUrls');
    const totalClicksEl = document.getElementById('totalClicks');
    const avgClicksEl = document.getElementById('avgClicks');
    const activeLinksEl = document.getElementById('activeLinks');
    
    if (totalUrlsEl) totalUrlsEl.textContent = totalUrls;
    if (totalClicksEl) totalClicksEl.textContent = totalClicks;
    if (avgClicksEl) avgClicksEl.textContent = avgClicks;
    if (activeLinksEl) activeLinksEl.textContent = activeLinks;
}

// Load analytics
async function loadAnalytics(urls) {
    try {
        // Calculate today's clicks
        const today = new Date().toDateString();
        let todayClicks = 0;
        let weekClicks = 0;
        let monthClicks = 0;
        
        urls.forEach(url => {
            // We need actual click data from server
            // This is a placeholder
            todayClicks += Math.floor(Math.random() * 5);
            weekClicks += Math.floor(Math.random() * 20);
            monthClicks += Math.floor(Math.random() * 50);
        });
        
        const todayClicksEl = document.getElementById('todayClicks');
        const weekClicksEl = document.getElementById('weekClicks');
        const monthClicksEl = document.getElementById('monthClicks');
        
        if (todayClicksEl) todayClicksEl.textContent = todayClicks;
        if (weekClicksEl) weekClicksEl.textContent = weekClicks;
        if (monthClicksEl) monthClicksEl.textContent = monthClicks;
        
        // Prepare chart data
        const last7Days = [];
        const clicksData = [];
        
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            last7Days.push(date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }));
            clicksData.push(Math.floor(Math.random() * 10) + 1); // Mock data
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
        
        // Update quick stats with mock data
        document.getElementById('topCountry').textContent = 'Vietnam';
        document.getElementById('topDevice').textContent = 'Mobile';
        
    } catch (error) {
        console.error('Analytics error:', error);
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
        document.getElementById('detailUniqueIPs').textContent = data.uniqueIPs || 0;
        document.getElementById('detailCountries').textContent = data.clicksByCountry.length;
        
        // Destroy existing charts
        if (countryChart) countryChart.destroy();
        if (deviceChart) deviceChart.destroy();
        
        // Create country chart
        const countryCtx = document.getElementById('countryChart')?.getContext('2d');
        if (countryCtx && data.clicksByCountry.length > 0) {
            countryChart = new Chart(countryCtx, {
                type: 'doughnut',
                data: {
                    labels: data.clicksByCountry.map(c => c.country || 'Unknown'),
                    datasets: [{
                        data: data.clicksByCountry.map(c => c.count),
                        backgroundColor: [
                            '#6366f1',
                            '#10b981',
                            '#f59e0b',
                            '#ef4444',
                            '#8b5cf6',
                            '#ec4899',
                            '#14b8a6',
                            '#f97316'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#94a3b8',
                                font: {
                                    size: 11
                                }
                            }
                        }
                    },
                    cutout: '60%'
                }
            });
        }
        
        // Create device chart
        const deviceCtx = document.getElementById('deviceChart')?.getContext('2d');
        if (deviceCtx && data.clicksByDevice.length > 0) {
            deviceChart = new Chart(deviceCtx, {
                type: 'pie',
                data: {
                    labels: data.clicksByDevice.map(d => d.device || 'Unknown'),
                    datasets: [{
                        data: data.clicksByDevice.map(d => d.count),
                        backgroundColor: [
                            '#6366f1',
                            '#10b981',
                            '#f59e0b',
                            '#8b5cf6',
                            '#ef4444'
                        ],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#94a3b8',
                                font: {
                                    size: 11
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // Show recent clicks
        const recentClicks = document.getElementById('recentClicks');
        if (recentClicks) {
            if (data.recentClicks.length === 0) {
                recentClicks.innerHTML = '<p class="text-center text-muted">No clicks yet</p>';
            } else {
                recentClicks.innerHTML = data.recentClicks.map(click => `
                    <div class="click-item">
                        <div class="click-info">
                            <span class="click-country">${click.country || 'Unknown'}</span>
                            <span class="click-device">${click.device || 'Unknown'}</span>
                            <span class="click-browser">${click.browser || 'Unknown'}</span>
                        </div>
                        <div class="click-time">${formatTime(click.timestamp)}</div>
                    </div>
                `).join('');
            }
        }
        
        openModal('analyticsModal');
    } catch (error) {
        console.error('Analytics error:', error);
        showToast('Failed to load analytics', 'error');
    }
}

// Edit URL
function editUrl(id, longUrl, expiresAt) {
    currentEditId = id;
    const editUrlInput = document.getElementById('editUrl');
    const editExpiresInput = document.getElementById('editExpires');
    
    if (editUrlInput) editUrlInput.value = longUrl;
    
    if (editExpiresInput) {
        if (expiresAt) {
            const date = new Date(expiresAt);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            editExpiresInput.value = `${year}-${month}-${day}T${hours}:${minutes}`;
        } else {
            editExpiresInput.value = '';
        }
    }
    
    openModal('editModal');
}

// Save edit
async function saveEdit() {
    if (!currentEditId) return;
    
    const newUrl = document.getElementById('editUrl')?.value;
    const newExpires = document.getElementById('editExpires')?.value;
    const saveBtn = document.querySelector('#editModal .btn-primary');
    
    if (!newUrl) {
        showToast('Please enter a URL', 'error');
        return;
    }
    
    // Validate URL
    try {
        new URL(newUrl);
    } catch {
        showToast('Invalid URL format', 'error');
        return;
    }
    
    // Show loading
    if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
    }
    
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
    } finally {
        if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.innerHTML = 'Save Changes';
        }
    }
}

// Delete URL
async function deleteUrl(id) {
    if (!confirm('Are you sure you want to delete this link? This action cannot be undone.')) return;
    
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

// Copy to clipboard
async function copyToClipboard(text) {
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied to clipboard!', 'success');
    } catch (err) {
        // Fallback
        const textarea = document.createElement('textarea');
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
        showToast('Copied to clipboard!', 'success');
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
    if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
    
    return date.toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
    });
}

// Format time
function formatTime(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
    
    return date.toLocaleString();
}

// Modal functions
function openModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
}

function closeModal(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// Close modal when clicking outside
window.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal')) {
        e.target.classList.remove('active');
        document.body.style.overflow = '';
    }
});

// Check auth and load dashboard
document.addEventListener('DOMContentLoaded', () => {
    // Check if user is logged in via auth.js
    if (typeof currentUser !== 'undefined' && currentUser) {
        loadDashboard();
    }
});

// Listen for auth changes
document.addEventListener('auth-changed', (e) => {
    if (e.detail.user) {
        loadDashboard();
    } else {
        window.location.href = '/login.html';
    }
});
