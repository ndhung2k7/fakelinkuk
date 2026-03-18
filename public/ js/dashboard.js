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
        const response = await fetch(`
