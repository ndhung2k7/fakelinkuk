// Anti-devtools protection
(function() {
    // Disable right click
    document.addEventListener('contextmenu', (e) => e.preventDefault());
    
    // Disable F12, Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+U
    document.addEventListener('keydown', (e) => {
        if (e.key === 'F12' || 
            (e.ctrlKey && e.shiftKey && e.key === 'I') ||
            (e.ctrlKey && e.shiftKey && e.key === 'J') ||
            (e.ctrlKey && e.key === 'U')) {
            e.preventDefault();
            showToast('Developer tools are disabled', 'warning');
        }
    });
    
    // Detect devtools
    let devtoolsOpen = false;
    const element = new Image();
    Object.defineProperty(element, 'id', {
        get: function() {
            devtoolsOpen = true;
            document.body.classList.add('devtools-open');
            showToast('Developer tools detected. Please close them to continue.', 'warning');
        }
    });
    
    setInterval(() => {
        devtoolsOpen = false;
        console.log(element);
        if (!devtoolsOpen) {
            document.body.classList.remove('devtools-open');
        }
    }, 1000);
})();

// Toast notification system
function showToast(message, type = 'info') {
    const toastContainer = document.querySelector('.toast-container');
    if (!toastContainer) {
        const container = document.createElement('div');
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let icon = 'info-circle';
    if (type === 'success') icon = 'check-circle';
    if (type === 'error') icon = 'exclamation-circle';
    if (type === 'warning') icon = 'exclamation-triangle';
    
    toast.innerHTML = `
        <i class="fas fa-${icon}"></i>
        <span>${message}</span>
    `;
    
    document.querySelector('.toast-container').appendChild(toast);
    
    setTimeout(() => {
        toast.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Dark mode toggle
const themeToggle = document.getElementById('themeToggle');
if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const html = document.documentElement;
        const currentTheme = html.getAttribute('data-theme');
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        html.setAttribute('data-theme', newTheme);
        localStorage.setItem('theme', newTheme);
        
        const icon = themeToggle.querySelector('i');
        icon.className = newTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
    });
    
    // Load saved theme
    const savedTheme = localStorage.getItem('theme') || 'dark';
    document.documentElement.setAttribute('data-theme', savedTheme);
    const icon = themeToggle.querySelector('i');
    icon.className = savedTheme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
}

// URL shortening
const shortenForm = document.getElementById('shortenForm');
if (shortenForm) {
    shortenForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const urlInput = document.getElementById('urlInput');
        const shortenBtn = document.getElementById('shortenBtn');
        const customCode = document.getElementById('customCode')?.value;
        const expiresIn = document.getElementById('expiresIn')?.value;
        
        // Check if user is logged in
        if (!currentUser) {
            showToast('Please login to shorten URLs', 'warning');
            setTimeout(() => {
                window.location.href = '/login.html';
            }, 2000);
            return;
        }
        
        // Validate URL
        if (!isValidUrl(urlInput.value)) {
            showToast('Please enter a valid URL', 'error');
            return;
        }
        
        // Show loading
        shortenBtn.disabled = true;
        shortenBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Shortening...';
        
        try {
            const response = await fetch('/api/urls', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    url: urlInput.value,
                    customCode: customCode,
                    expiresIn: expiresIn
                }),
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                showResult(data.shortUrl);
                showToast('URL shortened successfully!', 'success');
            } else {
                showToast(data.error || 'Failed to shorten URL', 'error');
            }
        } catch (error) {
            console.error('Shorten error:', error);
            showToast('Failed to shorten URL. Please try again.', 'error');
        } finally {
            shortenBtn.disabled = false;
            shortenBtn.innerHTML = '<i class="fas fa-cut"></i> Shorten URL';
        }
    });
}

// URL validation
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Show result
function showResult(shortUrl) {
    const formSection = document.querySelector('.shortener-card > form');
    const resultSection = document.getElementById('resultSection');
    const shortUrlInput = document.getElementById('shortUrl');
    const visitLink = document.getElementById('visitLink');
    
    if (formSection) formSection.style.display = 'none';
    if (resultSection) {
        resultSection.style.display = 'block';
        shortUrlInput.value = shortUrl;
        visitLink.href = shortUrl;
    }
}

// Copy to clipboard
const copyBtn = document.getElementById('copyBtn');
if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
        const shortUrl = document.getElementById('shortUrl');
        
        try {
            await navigator.clipboard.writeText(shortUrl.value);
            showToast('Copied to clipboard!', 'success');
            
            // Animation
            copyBtn.innerHTML = '<i class="fas fa-check"></i> Copied!';
            setTimeout(() => {
                copyBtn.innerHTML = '<i class="fas fa-copy"></i> Copy';
            }, 2000);
        } catch (err) {
            showToast('Failed to copy', 'error');
        }
    });
}

// Create another
const createAnother = document.getElementById('createAnother');
if (createAnother) {
    createAnother.addEventListener('click', () => {
        const formSection = document.querySelector('.shortener-card > form');
        const resultSection = document.getElementById('resultSection');
        const urlInput = document.getElementById('urlInput');
        const customCode = document.getElementById('customCode');
        
        if (formSection) formSection.style.display = 'block';
        if (resultSection) resultSection.style.display = 'none';
        if (urlInput) {
            urlInput.value = '';
            urlInput.focus();
        }
        if (customCode) customCode.value = '';
    });
}

// Toggle advanced options
const toggleOptions = document.getElementById('toggleOptions');
if (toggleOptions) {
    toggleOptions.addEventListener('click', () => {
        const optionsPanel = document.getElementById('optionsPanel');
        const icon = toggleOptions.querySelector('i');
        
        if (optionsPanel.style.display === 'none') {
            optionsPanel.style.display = 'block';
            icon.style.transform = 'rotate(90deg)';
        } else {
            optionsPanel.style.display = 'none';
            icon.style.transform = 'rotate(0deg)';
        }
    });
}

// Scroll animations
const animateElements = document.querySelectorAll('.animate-on-scroll');

function checkScroll() {
    animateElements.forEach(element => {
        const elementTop = element.getBoundingClientRect().top;
        const windowHeight = window.innerHeight;
        
        if (elementTop < windowHeight - 100) {
            element.classList.add('visible');
        }
    });
}

window.addEventListener('scroll', checkScroll);
window.addEventListener('load', checkScroll);

// Get CSRF token
async function getCsrfToken() {
    try {
        const response = await fetch('/api/csrf-token', {
            credentials: 'include'
        });
        const data = await response.json();
        return data.csrfToken;
    } catch (error) {
        console.error('Failed to get CSRF token:', error);
        return null;
    }
}

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    checkScroll();
});
