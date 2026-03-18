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
        },
    },
    crossOriginEmbedderPolicy: false,
}));

app.use(cors({
    origin: process.env.NODE_ENV === 'production' ? 'https://yourdomain.com' : 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(express.static('public'));
app.use(cookieParser());

// CSRF Protection (except for API routes)
const csrfProtection = csrf({ cookie: true });
app.use('/api', csrfProtection);

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
});

const apiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 50,
    message: 'Too many requests from this IP, please try again later.'
});

app.use('/api/', apiLimiter);

// Database file path
const DB_PATH = path.join(__dirname, 'database.json');

// Initialize database
async function initDatabase() {
    try {
        await fs.access(DB_PATH);
    } catch {
        const initialData = {
            users: [
                {
                    id: '1',
                    username: 'admin',
                    email: process.env.ADMIN_EMAIL,
                    password: await bcrypt.hash(process.env.ADMIN_PASSWORD, 10),
                    role: 'admin',
                    createdAt: new Date().toISOString()
                }
            ],
            urls: [],
            clicks: [],
            blacklist: ['malware.com', 'phishing.com', 'spam.net'],
            settings: {
                allowCustomUrls: true,
                defaultUrlLength: 6,
                maxUrlLength: 8
            }
        };
        await fs.writeFile(DB_PATH, JSON.stringify(initialData, null, 2));
    }
}

// Read database
async function readDB() {
    const data = await fs.readFile(DB_PATH, 'utf8');
    return JSON.parse(data);
}

// Write database
async function writeDB(data) {
    await fs.writeFile(DB_PATH, JSON.stringify(data, null, 2));
}

// Middleware: Verify JWT token
function authenticateToken(req, res, next) {
    const token = req.cookies.token || req.headers['authorization']?.split(' ')[1];
    
    if (!token) {
        return res.status(401).json({ error: 'Access denied' });
    }

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            return res.status(403).json({ error: 'Invalid token' });
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

// Validate URL
function isValidUrl(string) {
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
        return false;
    }
}

// Check if URL is in blacklist
async function isBlacklisted(url) {
    const db = await readDB();
    const domain = new URL(url).hostname.replace('www.', '');
    return db.blacklist.some(blocked => domain.includes(blocked));
}

// Get country from IP
async function getCountryFromIP(ip) {
    try {
        const response = await axios.get(`http://ip-api.com/json/${ip}`);
        return response.data.country || 'Unknown';
    } catch {
        return 'Unknown';
    }
}

// API Routes

// Register
app.post('/api/register', [
    body('username').isLength({ min: 3 }).trim().escape(),
    body('email').isEmail().normalizeEmail(),
    body('password').isLength({ min: 6 })
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

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const newUser = {
            id: Date.now().toString(),
            username,
            email,
            password: hashedPassword,
            role: 'user',
            createdAt: new Date().toISOString()
        };

        db.users.push(newUser);
        await writeDB(db);

        // Create token
        const token = jwt.sign(
            { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({ 
            success: true, 
            user: { id: newUser.id, username: newUser.username, email: newUser.email, role: newUser.role }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
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

        // Create token
        const token = jwt.sign(
            { id: user.id, username: user.username, email: user.email, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: '7d' }
        );

        res.cookie('token', token, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.json({ 
            success: true, 
            user: { id: user.id, username: user.username, email: user.email, role: user.role }
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Logout
app.post('/api/logout', (req, res) => {
    res.clearCookie('token');
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
        res.status(500).json({ error: 'Server error' });
    }
});

// Create short URL
app.post('/api/urls', authenticateToken, [
    body('url').isURL().withMessage('Invalid URL'),
    body('customCode').optional().isLength({ min: 4, max: 8 }).matches(/^[a-zA-Z0-9]+$/)
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
            return res.status(400).json({ error: 'Invalid URL' });
        }

        // Check blacklist
        if (await isBlacklisted(url)) {
            return res.status(400).json({ error: 'This URL is blacklisted' });
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
            do {
                shortCode = generateShortCode(db.settings.defaultUrlLength);
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
            id: Date.now().toString(),
            userId: req.user.id,
            longUrl: url,
            shortCode: shortCode,
            createdAt: new Date().toISOString(),
            expiresAt: expiryDate,
            clicks: 0
        };

        db.urls.push(newUrl);
        await writeDB(db);

        res.json({
            success: true,
            shortUrl: `${req.protocol}://${req.get('host')}/${shortCode}`,
            shortCode: shortCode
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({ error: 'Server error' });
    }
});

// Get user's URLs
app.get('/api/urls', authenticateToken, async (req, res) => {
    try {
        const db = await readDB();
        const userUrls = db.urls
            .filter(u => u.userId === req.user.id)
            .map(url => ({
                ...url,
                shortUrl: `${req.protocol}://${req.get('host')}/${url.shortCode}`,
                clickCount: db.clicks.filter(c => c.urlId === url.id).length
            }))
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        
        res.json(userUrls);
    } catch (error) {
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
        
        if (expiresAt) {
            db.urls[urlIndex].expiresAt = expiresAt;
        }

        await writeDB(db);
        res.json({ success: true, url: db.urls[urlIndex] });
    } catch (error) {
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
        db.urls.splice(urlIndex, 1);
        db.clicks = db.clicks.filter(c => c.urlId !== req.params.id);

        await writeDB(db);
        res.json({ success: true });
    } catch (error) {
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
        
        // Group by date
        const clicksByDate = {};
        const clicksByCountry = {};
        const clicksByDevice = {};

        clicks.forEach(click => {
            const date = new Date(click.timestamp).toLocaleDateString();
            clicksByDate[date] = (clicksByDate[date] || 0) + 1;
            
            clicksByCountry[click.country] = (clicksByCountry[click.country] || 0) + 1;
            clicksByDevice[click.device] = (clicksByDevice[click.device] || 0) + 1;
        });

        res.json({
            totalClicks: clicks.length,
            clicksByDate: Object.entries(clicksByDate).map(([date, count]) => ({ date, count })),
            clicksByCountry: Object.entries(clicksByCountry).map(([country, count]) => ({ country, count })),
            clicksByDevice: Object.entries(clicksByDevice).map(([device, count]) => ({ device, count })),
            recentClicks: clicks.slice(-10).reverse()
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Admin: Get all users
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const db = await readDB();
        const users = db.users.map(u => ({
            id: u.id,
            username: u.username,
            email: u.email,
            role: u.role,
            createdAt: u.createdAt,
            urlCount: db.urls.filter(url => url.userId === u.id).length,
            totalClicks: db.clicks.filter(click => 
                db.urls.some(url => url.id === click.urlId && url.userId === u.id)
            ).length
        }));
        res.json(users);
    } catch (error) {
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
        
        // Recent activity
        const recentUrls = db.urls
            .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
            .slice(0, 10)
            .map(url => ({
                ...url,
                user: db.users.find(u => u.id === url.userId)?.username || 'Unknown'
            }));
        
        // Top URLs
        const topUrls = db.urls
            .map(url => ({
                ...url,
                clickCount: db.clicks.filter(c => c.urlId === url.id).length,
                user: db.users.find(u => u.id === url.userId)?.username || 'Unknown'
            }))
            .sort((a, b) => b.clickCount - a.clickCount)
            .slice(0, 10);
        
        // Clicks over time (last 30 days)
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const recentClicks = db.clicks
            .filter(c => new Date(c.timestamp) > thirtyDaysAgo)
            .reduce((acc, click) => {
                const date = new Date(click.timestamp).toLocaleDateString();
                acc[date] = (acc[date] || 0) + 1;
                return acc;
            }, {});
        
        res.json({
            totalUsers,
            totalUrls,
            totalClicks,
            recentUrls,
            topUrls,
            clicksOverTime: Object.entries(recentClicks).map(([date, count]) => ({ date, count }))
        });
    } catch (error) {
        res.status(500).json({ error: 'Server error' });
    }
});

// Redirect short URL
app.get('/:shortCode', async (req, res) => {
    try {
        const db = await readDB();
        const { shortCode } = req.params;

        // Find URL
        const url = db.urls.find(u => u.shortCode === shortCode);
        
        if (!url) {
            return res.status(404).sendFile(path.join(__dirname, 'public', '404.html'));
        }

        // Check expiry
        if (url.expiresAt && new Date(url.expiresAt) < new Date()) {
            return res.status(410).send('This link has expired');
        }

        // Track click
        const parser = new UAParser(req.headers['user-agent']);
        const device = parser.getDevice().type || 'desktop';
        
        const clickData = {
            id: Date.now().toString(),
            urlId: url.id,
            timestamp: new Date().toISOString(),
            ip: req.ip || req.connection.remoteAddress,
            country: await getCountryFromIP(req.ip),
            device: device,
            browser: parser.getBrowser().name || 'Unknown',
            os: parser.getOS().name || 'Unknown',
            referer: req.headers.referer || 'Direct'
        };

        db.clicks.push(clickData);
        
        // Update click count
        url.clicks = (url.clicks || 0) + 1;
        
        await writeDB(db);

        // Redirect
        res.redirect(url.longUrl);
    } catch (error) {
        console.error(error);
        res.status(500).send('Server error');
    }
});

// Get CSRF token
app.get('/api/csrf-token', csrfProtection, (req, res) => {
    res.json({ csrfToken: req.csrfToken() });
});

// Start server
async function startServer() {
    await initDatabase();
    const PORT = process.env.PORT || 3000;
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Admin login: ${process.env.ADMIN_EMAIL}`);
    });
}

startServer();
