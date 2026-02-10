require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xss = require('xss-clean');
const hpp = require('hpp');
const morgan = require('morgan');

const app = express();
// تعريف المنفذ مرة واحدة فقط لضمان عمله على Render
const PORT = process.env.PORT || 3000;

// --- 1. طبقات الحماية والأمان (Middleware) ---
app.use(helmet()); 
app.use(morgan('dev')); 
app.use(cors()); 

// محولات البيانات (تأتي قبل المنظفات)
app.use(express.json({ limit: '10kb' })); 
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// حل مشكلة التوافق مع Node 22 (تجنب خطأ الـ Getter)
app.use(mongoSanitize({
    replaceWith: '_',
    allowDots: true
}));

app.use(xss()); 
app.use(hpp()); 

// حماية عدد الطلبات لمنع هجمات الإغراق
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "تم تجاوز عدد الطلبات المسموح به، يرجى المحاولة لاحقاً" }
});
app.use('/api', globalLimiter);

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 15,
    message: { message: "محاولات دخول كثيرة، يرجى الانتظار لمدة ساعة" }
});
app.use('/api/auth', authLimiter);

// --- 2. الاتصال بقاعدة البيانات ---
const dbURI = process.env.MONGODB_URI;

mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to Details Store Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// --- 3. المسارات الترحيبية (إصلاح Cannot GET) ---
app.get('/', (req, res) => {
    res.send('🚀 Welcome to Details Store Server - Production Mode');
});

app.get('/api', (req, res) => {
    res.json({ 
        status: "success", 
        message: "Details API is Live", 
        endpoints: ["/api/products", "/api/banners", "/api/categories"] 
    });
});

// --- 4. قوالب البيانات (Schemas) ---

const categorySchema = new mongoose.Schema({
    name: { ar: { type: String, required: true }, en: { type: String, required: true } },
    slug: { type: String, required: true, unique: true },
    imageUrl: { type: String, required: true }
}, { timestamps: true });
const Category = mongoose.model('Category', categorySchema);

const productSchema = new mongoose.Schema({
    name: { ar: { type: String, required: true }, en: { type: String, required: true } },
    brand: { type: String, uppercase: true, default: 'DETAILS' },
    description: { ar: { type: String }, en: { type: String } },
    price: { type: Number, required: true },
    oldPrice: Number,
    dimensions: String,
    imageUrl: { type: String, required: true },
    images: [String],
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    isSoldOut: { type: Boolean, default: false },
    featured: { type: Boolean, default: false }
}, { timestamps: true });
const Product = mongoose.model('Product', productSchema);

const bannerSchema = new mongoose.Schema({
    title: { ar: { type: String, required: true }, en: { type: String, required: true } },
    imageUrl: { type: String, required: true },
    buttonText: { ar: { type: String, default: "اكتشف ديتيلز" }, en: { type: String, default: "Discover Details" } },
    location: { type: String, enum: ['home', 'category'], default: 'home' }
}, { timestamps: true });
const Banner = mongoose.model('Banner', bannerSchema);

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    isAdmin: { type: Boolean, default: false }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const wishlistSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, { timestamps: true });
const Wishlist = mongoose.model('Wishlist', wishlistSchema);

const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    products: [{ id: String, title: String, quantity: Number, price: Number, imageUrl: String }],
    amount: { type: Number, required: true },
    status: { type: String, default: 'قيد التجهيز' }
}, { timestamps: true });
const Order = mongoose.model('Order', orderSchema);

// --- 5. منطق الحماية والمصادقة ---

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "يرجى تسجيل الدخول أولاً" });

    jwt.verify(token, process.env.JWT_SECRET || 'SecretKey123', (err, user) => {
        if (err) return res.status(403).json({ message: "الجلسة انتهت" });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) next();
    else res.status(403).json({ message: "هذا الإجراء مخصص للمسؤولين فقط" });
};

// --- 6. الروابط (Routes) ---

app.get('/api/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = {};
        if (category) {
            const catDoc = await Category.findOne({ slug: category });
            if (catDoc) query.category = catDoc._id;
        }
        if (search) {
            query.$or = [{ 'name.ar': { $regex: search, $options: 'i' } }, { 'name.en': { $regex: search, $options: 'i' } }];
        }
        const products = await Product.find(query).sort({ createdAt: -1 }).populate('category');
        res.status(200).json(products);
    } catch (err) { res.status(500).json({ message: err.message }); }
});

app.get('/api/banners', async (req, res) => {
    try {
        const banners = await Banner.find().sort({ createdAt: -1 });
        res.status(200).json(banners);
    } catch (err) { res.status(500).json({ message: "خطأ في جلب الإعلانات" }); }
});

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.status(200).json(categories);
    } catch (err) { res.status(500).json({ message: "خطأ في جلب التصنيفات" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: "البيانات غير صحيحة" });
        }
        const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET || 'SecretKey123', { expiresIn: '7d' });
        res.json({ token, user: { name: user.name, email: user.email, isAdmin: user.isAdmin } });
    } catch (err) { res.status(500).json({ message: "خطأ في تسجيل الدخول" }); }
});

// --- 7. تشغيل السيرفر ---
// الاستماع على 0.0.0.0 ضروري لبيئة Render
app.listen(PORT, () => {
    console.log(`🚀 Details Backend is Live on Port: ${PORT}`);
});