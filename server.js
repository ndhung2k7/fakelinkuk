require('dotenv').config();
const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const { body, validationResult } = require('express-validator');
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const UAParser = require('ua-parser-js');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');

const app = express();

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.jsdelivr.net", "https://cdnjs.cloudflare.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "http://ip-api.com"],
        },
    },
    crossOriginEmbedderPolicy: false,
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? process.env.FRONTEND_URL : 'http://localhost:3000',
    credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// Database file path
const DB_PATH = path.join(__dirname, 'database.json');

// Initialize database
async function initDatabase() {
    try {
        await fs.access(DB_PATH);
        console.log('Database file found');
    } catch {
        console.log('Creating new database file...');
        const hashedPassword = await bcrypt.hash(process.env.ADMIN_PASSWORD || 'Admin123!', 10);
        const initialData = {
            users: [
                {
                    id: '1',
                    username: 'admin',
                    email: process.env.ADMIN_EMAIL || 'admin@example.com',
                    password: hashedPassword,
                    role: 'admin',
                    createdAt: new Date().toISOString()
                }
            ],
            urls: [],
            clicks: [],
            blacklist: ['malware.com', 'phishing.com', 'spam.net', 'bit.ly', 'tinyurl.com'],
            settings: {
                allowCustomUrls: true,
                defaultUrlLength: 6,
                maxUrlLength: 8,
                requireLogin: true,
                enableRateLimit: true,
                enableBlacklist: true
            }
        };
        await fs.writeFile(DB_PATH, JSON.stringify(initialData, null, 2));
        console.log('Database created successfully');
    }
}

// Read database with error handling
async function readDB() {
    try {
        const data = await fs.readFile(DB_PATH, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Error reading database:', error);
        // Return default structure if file is corrupted
        return {
            users: [],
            urls: [],
            clicks: [],
            blacklist: [],
            settings: {
                allowCustomUrls: true,
                defaultUrlLength: 6,
                maxUrlLength: 8,
                requireLogin: true,
                enableRateLimit: true,
                enableBlacklist: true
            }
        };
    }
}

// Write database with error handling
async function writeDB(data) {
    try {
        await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing to database:', error);
        throw new Error('Database write failed');
    }
}

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 50,
    message: { error: 'Too many requests from this IP, please try again later.' },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use('/api/', apiLimiter);

// CSRF Protection (except for API routes)
const csrfProtection = csrf({ 
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
});

// Apply CSRF protection to all non-GET routes except auth
app.use((req, res, next) => {
    if (req.method === 'GET' || req.path.startsWith('/api/login') || req.path.startsWith('/api/register')) {
        return next();
    }
    csrfProtection(req, res, next);
});

// Middleware: Verify JWT token
function authenticateToken(req, res, next) {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied. Please login.' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid or expired token' });
        }
        req.user = user;
        next();
    });
}

// Middleware: Check if admin
function isAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }
    next();
}

// Generate random short code
function generateShortCode(length = 6) {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';
    for (let i = 0; i < length; i++) {
        result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
}

// Validate URL with better checks
function isValidUrl(string) {
    try {
        const url = new URL(string);
        const protocol = url.protocol === 'http:' || url.protocol === 'https:';
        const hasValidHost = url.hostname && url.hostname.includes('.');
        return protocol && hasValidHost;
    } catch {
        return false;
    }
}

// Check if URL is in blacklist
async function isBlacklisted(url) {
    try {
        const db = await readDB();
        const urlObj = new URL(url);
        const domain = urlObj.hostname.replace('www.', '').toLowerCase();
        
        return db.blacklist.some(blocked => {
            const blockedLower = blocked.toLowerCase();
            return domain === blockedLower || domain.endsWith('.' + blockedLower);
        });
    } catch {
        return false;
    }
}

// Get country from IP with timeout
async function getCountryFromIP(ip) {
    // Handle localhost
    if (ip === '::1' || ip === '127.0.0.1') {
        return 'Local';
    }
    
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`, { timeout: 2000 });
        return response.data.country || 'Unknown';
    } catch {
        return 'Unknown';
    }
}

// Clean expired URLs
async function cleanExpiredUrls() {
    try {
        const db = await readDB();
        const now = new Date();
        const expiredUrls = db.urls.filter(url => url.expiresAt && new Date(url.expiresAt) < now);
        
        if (expiredUrls.length > 0) {
            db.urls = db.urls.filter(url => !url.expiresAt || new Date(url.expiresAt) >= now);
            await writeDB(db);
            console.log(`Cleaned ${expiredUrls.length} expired URLs`);
        }
    } catch (error) {
        console.error('Error cleaning expired URLs:', error);
    }
}

// Run cleanup every hour
setInterval(cleanExpiredUrls, 60 * 60 * 1000);

// API Routes

// Get CSRF token
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// Register
app.post('/api/register', [
    body('username').isLength({ min: 3, max: 20 }).trim().escape().matches(/^[a-zA-Z0-9_]+$/),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 }).matches(/^(?=.*[A-Za-z])(?=.*\d)/)
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const db = await readDB();
        const { username, email, password } = req.body;

        // Check if user exists
        if (db.users.find(u => u.email === email)) {
            return res.status(400).json({ error: 'Email already registered' });
        }

        if (db.users.find(u => u.username === username)) {
            return res.status(400).json({ error: 'Username already taken' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newUser = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            username,
            email,
            password: hashedPassword,
            role: 'user',
            createdAt: new Date().toISOString(),
            lastLogin: null
        };

        db.users.push(newUser);
        await writeDB(db);

        // Create token
        const token = jwt.sign(
            { 
                id: newUser.id, 
                username: newUser.username, 
                email: newUser.email, 
                role: newUser.role 
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({ 
            success: true, 
            user: { 
                id: newUser.id, 
                username: newUser.username, 
                email: newUser.email, 
                role: newUser.role 
            }
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.status(500).json({ error: 'Server error during registration' });
    }
});

// Login
app.post('/api/login', [
    body('email').isEmail().normalizeEmail(),
    body('password').notEmpty()
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const db = await readDB();
        const { email, password } = req.body;

        // Find user
        const user = db.users.find(u => u.email === email);
        if (!user) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ error: 'Invalid email or password' });
        }

        // Update last login
        user.lastLogin = new Date().toISOString();
        await writeDB(db);

        // Create token
        const token = jwt.sign(
            { 
                id: user.id, 
                username: user.username, 
                email: user.email, 
                role: user.role 
            },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 7 * 24 * 60 * 60 * 1000
        });

        res.json({ 
            success: true, 
            user: { 
                id: user.id, 
                username: user.username, 
                email: user.email, 
                role: user.role 
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Server error during login' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    });
    res.json({ success: true });
});

// Get current user
app.get('/api/user', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const user = db.users.find(u => u.id === req.user.id);
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        res.json({ 
            id: user.id, 
            username: user.username, 
            email: user.email, 
            role: user.role 
        });
    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Create short URL
app.post('/api/urls', authenticateToken, [
    body('url').isURL().withMessage('Invalid URL format'),
    body('customCode').optional().isLength({ min: 4, max: 8 }).matches(/^[a-zA-Z0-9]+$/).withMessage('Custom code must be 4-8 alphanumeric characters')
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
    }

    try {
        const db = await readDB();
        const { url, customCode, expiresIn } = req.body;

        // Validate URL
        if (!isValidUrl(url)) {
            return res.status(400).json({ error: 'Invalid URL format' });
        }

        // Check blacklist if enabled
        if (db.settings.enableBlacklist) {
            if (await isBlacklisted(url)) {
                return res.status(400).json({ error: 'This domain is blacklisted' });
            }
        }

        // Check if user has permission
        if (db.settings.requireLogin && !req.user) {
            return res.status(401).json({ error: 'Please login to shorten URLs' });
        }

        // Generate or use custom code
        let shortCode = customCode;
        if (shortCode) {
            // Check if custom code exists
            if (db.urls.find(u => u.shortCode === shortCode)) {
                return res.status(400).json({ error: 'Custom code already taken' });
            }
        } else {
            // Generate unique code
            let attempts = 0;
            const maxAttempts = 10;
            do {
                shortCode = generateShortCode(db.settings.defaultUrlLength);
                attempts++;
                if (attempts > maxAttempts) {
                    return res.status(500).json({ error: 'Failed to generate unique code' });
                }
            } while (db.urls.find(u => u.shortCode === shortCode));
        }

        // Calculate expiry date
        let expiryDate = null;
        if (expiresIn && expiresIn !== 'never') {
            const now = new Date();
            switch(expiresIn) {
                case '1h': now.setHours(now.getHours() + 1); break;
                case '24h': now.setHours(now.getHours() + 24); break;
                case '7d': now.setDate(now.getDate() + 7); break;
                case '30d': now.setDate(now.getDate() + 30); break;
            }
            expiryDate = now.toISOString();
        }

        // Create URL entry
        const newUrl = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            userId: req.user.id,
            longUrl: url,
            shortCode: shortCode,
            createdAt: new Date().toISOString(),
            expiresAt: expiryDate,
            clicks: 0,
            title: null // Can be fetched from URL metadata
        };

        db.urls.push(newUrl);
        await writeDB(db);

        res.json({
            success: true,
            shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}`,
            shortCode: shortCode,
            id: newUrl.id
        });
    } catch (error) {
        console.error('Create URL error:', error);
        res.status(500).json({ error: 'Server error while creating URL' });
    }
});

// Get user's URLs
app.get('/api/urls', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const userUrls = db.urls
            .filter(u => u.userId === req.user.id)
            .map(url => {
                const clickCount = db.clicks.filter(c => c.urlId === url.id).length;
                return {
                    ...url,
                    shortUrl: `${req.protocol}://${req.get('host')}/${url.shortCode}`,
                    clickCount: clickCount
                };
            })
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json(userUrls);
    } catch (error) {
        console.error('Get URLs error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get all URLs (admin only)
app.get('/api/admin/urls', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const urls = db.urls.map(url => {
            const user = db.users.find(u => u.id === url.userId);
            const clickCount = db.clicks.filter(c => c.urlId === url.id).length;
            return {
                ...url,
                username: user ? user.username : 'Unknown',
                clickCount: clickCount,
                shortUrl: `${req.protocol}://${req.get('host')}/${url.shortCode}`
            };
        }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json(urls);
    } catch (error) {
        console.error('Get all URLs error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Update URL
app.put('/api/urls/:id', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const urlIndex = db.urls.findIndex(u => u.id === req.params.id && u.userId === req.user.id);
        
        if (urlIndex === -1) {
            return res.status(404).json({ error: 'URL not found' });
        }

        const { longUrl, expiresAt } = req.body;
        
        if (longUrl) {
            if (!isValidUrl(longUrl)) {
                return res.status(400).json({ error: 'Invalid URL' });
            }
            db.urls[urlIndex].longUrl = longUrl;
        }
        
        if (expiresAt !== undefined) {
            db.urls[urlIndex].expiresAt = expiresAt || null;
        }

        await writeDB(db);
        res.json({ success: true, url: db.urls[urlIndex] });
    } catch (error) {
        console.error('Update URL error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Delete URL
app.delete('/api/urls/:id', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const urlIndex = db.urls.findIndex(u => u.id === req.params.id && u.userId === req.user.id);
        
        if (urlIndex === -1) {
            return res.status(404).json({ error: 'URL not found' });
        }

        // Delete URL and its clicks
        const urlId = db.urls[urlIndex].id;
        db.urls.splice(urlIndex, 1);
        db.clicks = db.clicks.filter(c => c.urlId !== urlId);

        await writeDB(db);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete URL error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get URL analytics
app.get('/api/urls/:id/analytics', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const url = db.urls.find(u => u.id === req.params.id && u.userId === req.user.id);
        
        if (!url) {
            return res.status(404).json({ error: 'URL not found' });
        }

        const clicks = db.clicks.filter(c => c.urlId === url.id);
        
        // Group by date (last 30 days)
        const clicksByDate = {};
        const clicksByCountry = {};
        const clicksByDevice = {};
        const clicksByBrowser = {};
        const uniqueIPs = new Set();

        clicks.forEach(click => {
            const date = new Date(click.timestamp).toLocaleDateString();
            clicksByDate[date] = (clicksByDate[date] || 0) + 1;
            
            clicksByCountry[click.country] = (clicksByCountry[click.country] || 0) + 1;
            clicksByDevice[click.device] = (clicksByDevice[click.device] || 0) + 1;
            clicksByBrowser[click.browser] = (clicksByBrowser[click.browser] || 0) + 1;
            uniqueIPs.add(click.ip);
        });

        // Sort dates
        const sortedDates = Object.entries(clicksByDate)
            .sort((a, b) => new Date(a[0]) - new Date(b[0]))
            .map(([date, count]) => ({ date, count }));

        res.json({
            totalClicks: clicks.length,
            uniqueIPs: uniqueIPs.size,
            clicksByDate: sortedDates,
            clicksByCountry: Object.entries(clicksByCountry)
                .map(([country, count]) => ({ country, count }))
                .sort((a, b) => b.count - a.count),
            clicksByDevice: Object.entries(clicksByDevice)
                .map(([device, count]) => ({ device, count }))
                .sort((a, b) => b.count - a.count),
            clicksByBrowser: Object.entries(clicksByBrowser)
                .map(([browser, count]) => ({ browser, count }))
                .sort((a, b) => b.count - a.count),
            recentClicks: clicks.slice(-10).reverse().map(click => ({
                country: click.country,
                device: click.device,
                browser: click.browser,
                timestamp: click.timestamp,
                ip: click.ip
            }))
        });
    } catch (error) {
        console.error('Analytics error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Get all users
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const users = db.users.map(u => {
            const userUrls = db.urls.filter(url => url.userId === u.id);
            const totalClicks = userUrls.reduce((sum, url) => {
                return sum + db.clicks.filter(c => c.urlId === url.id).length;
            }, 0);
            
            return {
                id: u.id,
                username: u.username,
                email: u.email,
                role: u.role,
                createdAt: u.createdAt,
                lastLogin: u.lastLogin,
                urlCount: userUrls.length,
                totalClicks: totalClicks
            };
        });
        res.json(users);
    } catch (error) {
        console.error('Get users error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Delete user
app.delete('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const userIndex = db.users.findIndex(u => u.id === req.params.id);
        
        if (userIndex === -1) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Don't allow deleting yourself
        if (req.params.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete yourself' });
        }

        // Delete user's URLs and clicks
        const userUrls = db.urls.filter(u => u.userId === req.params.id);
        userUrls.forEach(url => {
            db.clicks = db.clicks.filter(c => c.urlId !== url.id);
        });
        db.urls = db.urls.filter(u => u.userId !== req.params.id);
        
        // Delete user
        db.users.splice(userIndex, 1);

        await writeDB(db);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete user error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Get system stats
app.get('/api/admin/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await readDB();
        
        const totalUsers = db.users.length;
        const totalUrls = db.urls.length;
        const totalClicks = db.clicks.length;
        
        // Recent activity (last 24h)
        const oneDayAgo = new Date();
        oneDayAgo.setDate(oneDayAgo.getDate() - 1);
        
        const recentUrls = db.urls
            .filter(u => new Date(u.createdAt) > oneDayAgo)
            .length;
        
        const recentClicks = db.clicks
            .filter(c => new Date(c.timestamp) > oneDayAgo)
            .length;
        
        // Recent URLs
        const latestUrls = db.urls
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10)
            .map(url => {
                const user = db.users.find(u => u.id === url.userId);
                return {
                    ...url,
                    username: user ? user.username : 'Unknown'
                };
            });
        
        // Top URLs
        const topUrls = db.urls
            .map(url => {
                const clickCount = db.clicks.filter(c => c.urlId === url.id).length;
                const user = db.users.find(u => u.id === url.userId);
                return {
                    ...url,
                    clickCount: clickCount,
                    username: user ? user.username : 'Unknown'
                };
            })
            .sort((a, b) => b.clickCount - a.clickCount)
            .slice(0, 10);
        
        // Clicks over time (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const clicksByDate = {};
        db.clicks
            .filter(c => new Date(c.timestamp) > thirtyDaysAgo)
            .forEach(click => {
                const date = new Date(click.timestamp).toLocaleDateString();
                clicksByDate[date] = (clicksByDate[date] || 0) + 1;
            });
        
        const clicksOverTime = Object.entries(clicksByDate)
            .sort((a, b) => new Date(a[0]) - new Date(b[0]))
            .map(([date, count]) => ({ date, count }));
        
        res.json({
            totalUsers,
            totalUrls,
            totalClicks,
            recentUrls,
            recentClicks,
            latestUrls,
            topUrls,
            clicksOverTime
        });
    } catch (error) {
        console.error('Stats error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Update blacklist
app.post('/api/admin/blacklist', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const { domain } = req.body;
        
        if (!domain || typeof domain !== 'string') {
            return res.status(400).json({ error: 'Invalid domain' });
        }
        
        const cleanDomain = domain.toLowerCase().trim();
        if (!db.blacklist.includes(cleanDomain)) {
            db.blacklist.push(cleanDomain);
            await writeDB(db);
        }
        
        res.json({ success: true, blacklist: db.blacklist });
    } catch (error) {
        console.error('Add to blacklist error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Remove from blacklist
app.delete('/api/admin/blacklist/:domain', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const domain = req.params.domain.toLowerCase();
        
        db.blacklist = db.blacklist.filter(d => d !== domain);
        await writeDB(db);
        
        res.json({ success: true, blacklist: db.blacklist });
    } catch (error) {
        console.error('Remove from blacklist error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Update settings
app.put('/api/admin/settings', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const { allowCustomUrls, defaultUrlLength, maxUrlLength, requireLogin, enableBlacklist } = req.body;
        
        db.settings = {
            allowCustomUrls: allowCustomUrls ?? db.settings.allowCustomUrls,
            defaultUrlLength: defaultUrlLength || db.settings.defaultUrlLength,
            maxUrlLength: maxUrlLength || db.settings.maxUrlLength,
            requireLogin: requireLogin ?? db.settings.requireLogin,
            enableBlacklist: enableBlacklist ?? db.settings.enableBlacklist
        };
        
        await writeDB(db);
        res.json({ success: true, settings: db.settings });
    } catch (error) {
        console.error('Update settings error:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Redirect short URL
app.get('/:shortCode', async (req, res) => {
    try {
        const db = await readDB();
        const { shortCode } = req.params;

        // Skip if it's a file request
        if (shortCode.includes('.')) {
            return next();
        }

        // Find URL
        const url = db.urls.find(u => u.shortCode === shortCode);
        
        if (!url) {
            return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        }

        // Check expiry
        if (url.expiresAt && new Date(url.expiresAt) < new Date()) {
            return res.status(410).send(`
                <!DOCTYPE html>
                <html>
                <head><title>Link Expired</title></head>
                <body style="font-family: system-ui; text-align: center; padding: 50px;">
                    <h1>🔗 Link Expired</h1>
                    <p>This shortened link has expired.</p>
                    <a href="/" style="color: #6366f1;">Create a new link →</a>
                </body>
                </html>
            `);
        }

        // Track click
        const parser = new UAParser(req.headers['user-agent']);
        const device = parser.getDevice().type || 'desktop';
        const browser = parser.getBrowser().name || 'Unknown';
        const os = parser.getOS().name || 'Unknown';
        
        // Get real IP
        const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
        
        const clickData = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 5),
            urlId: url.id,
            timestamp: new Date().toISOString(),
            ip: ip,
            country: await getCountryFromIP(ip),
            device: device,
            browser: browser,
            os: os,
            referer: req.headers.referer || 'Direct'
        };

        db.clicks.push(clickData);
        
        // Update click count
        url.clicks = (url.clicks || 0) + 1;
        
        await writeDB(db);

        // Redirect
        res.redirect(url.longUrl);
    } catch (error) {
        console.error('Redirect error:', error);
        res.status(500).send('Server error');
    }
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Handle 404 for API routes
app.use('/api/*', (req, res) => {
    res.status(404).json({ error: 'API endpoint not found' });
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Global error:', err);
    
    if (err.code === 'EBADCSRFTOKEN') {
        return res.status(403).json({ error: 'Invalid CSRF token' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
async function startServer() {
    try {
        await initDatabase();
        await cleanExpiredUrls(); // Initial cleanup
        
        const PORT = process.env.PORT || 3000;
        app.listen(PORT, () => {
            console.log(`✅ Server running on port ${PORT}`);
            console.log(`📍 Local: http://localhost:${PORT}`);
            console.log(`👤 Admin: ${process.env.ADMIN_EMAIL || 'admin@example.com'}`);
            console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
        });
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

startServer();
