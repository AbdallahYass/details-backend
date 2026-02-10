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
const PORT = process.env.PORT || 3000;

// 1. Middleware
app.use(helmet());
app.use(morgan('dev'));
app.use(cors()); 
app.use(express.json({ limit: '10kb' }));
app.use(mongoSanitize());
app.use(xss());
app.use(hpp());

// حماية عامة
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "تم تجاوز عدد الطلبات المسموح به" }
});
app.use(globalLimiter); // تطبيق على كل الروابط

// حماية خاصة لتسجيل الدخول (تم رفع الحد إلى 100 للتجربة)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100, // ✅ تعديل: زيادة العدد للتجربة
    message: { message: "محاولات دخول كثيرة جداً، يرجى الانتظار" }
});
app.use('/auth', authLimiter); // ✅ تعديل: إزالة /api

// 2. الاتصال بقاعدة البيانات
const dbURI = process.env.MONGODB_URI;
mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to Details Store Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// 3. تعريف الـ Schemas (كما هي في كودك الأصلي)
// ... (Product, Banner, Category, Wishlist, User, Order Schemas) ...
// سأختصرها هنا لأنها صحيحة في كودك، فقط تأكد من نسخها كما هي.
const productSchema = new mongoose.Schema({
    name: { ar: { type: String, required: true }, en: { type: String, required: true } },
    brand: { type: String, default: 'DETAILS' },
    description: { ar: String, en: String },
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
    title: { ar: String, en: String },
    imageUrl: String,
    buttonText: { ar: String, en: String },
    link: String,
    location: { type: String, default: 'home' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }
}, { timestamps: true });
const Banner = mongoose.model('Banner', bannerSchema);

const categorySchema = new mongoose.Schema({
    name: { ar: String, en: String },
    slug: { type: String, unique: true },
    imageUrl: String
}, { timestamps: true });
const Category = mongoose.model('Category', categorySchema);

const wishlistSchema = new mongoose.Schema({
    userId: String,
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, { timestamps: true });
const Wishlist = mongoose.model('Wishlist', wishlistSchema);

const userSchema = new mongoose.Schema({
    name: String,
    email: { type: String, unique: true },
    password: String,
    phone: String,
    isAdmin: { type: Boolean, default: false }
}, { timestamps: true });
const User = mongoose.model('User', userSchema);

const orderSchema = new mongoose.Schema({
    userId: String,
    products: Array,
    amount: Number,
    shippingAddress: Object,
    status: { type: String, default: 'قيد التجهيز' }
}, { timestamps: true });
const Order = mongoose.model('Order', orderSchema);

// Middleware Authentication
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
    else res.status(403).json({ message: "للمسؤولين فقط" });
};

// 4. الروابط (Routes) - ✅ تم إزالة /api من جميع الروابط

// Products
app.get('/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = {};
        if (category) {
            const categoryDoc = await Category.findOne({ slug: category });
            if (!categoryDoc) return res.status(200).json([]);
            query.category = categoryDoc._id;
        }
        if (search) {
            query.$or = [
                { 'name.ar': { $regex: search, $options: 'i' } },
                { 'name.en': { $regex: search, $options: 'i' } }
            ];
        }
        const products = await Product.find(query).sort({ createdAt: -1 }).populate('category');
        res.status(200).json(products);
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.get('/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category');
        if (!product) return res.status(404).json({ message: "Not Found" });
        res.json(product);
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/products', authenticateToken, isAdmin, async (req, res) => {
    // ... (نفس منطق إضافة المنتج الخاص بك) ...
    try {
        const newProduct = new Product(req.body); // اختصاراً، استخدم الكود الكامل الخاص بك هنا
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) { res.status(400).json({ message: "Error" }); }
});

// Banners
app.get('/banners', async (req, res) => {
    try {
        const { location, category } = req.query;
        let query = {};
        if (location) query.location = location;
        if (category) {
            const cat = await Category.findOne({ slug: category });
            if (cat) query.category = cat._id;
        }
        const banners = await Banner.find(query).sort({ createdAt: -1 });
        res.json(banners);
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

// Categories
app.get('/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

// Wishlist
app.get('/wishlist', authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ userId: req.user.id }).populate('products');
        res.json(wishlist ? wishlist.products : []);
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/wishlist', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.user.id;
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) wishlist = new Wishlist({ userId, products: [] });
        
        const index = wishlist.products.indexOf(productId);
        if (index === -1) wishlist.products.push(productId);
        else wishlist.products.splice(index, 1);
        
        await wishlist.save();
        const updated = await wishlist.populate('products');
        res.json(updated.products);
    } catch (err) { res.status(400).json({ message: "Error" }); }
});

// Auth
app.post('/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        if (!password || password.length < 6) return res.status(400).json({ message: "كلمة المرور قصيرة" });
        
        // ✅ تعديل: تحويل الإيميل لحروف صغيرة
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) return res.status(400).json({ message: "الإيميل مسجل مسبقاً" });

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email: email.toLowerCase(), password: hashedPassword, phone });
        await newUser.save();
        res.status(201).json({ message: "تم التسجيل" });
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        // ✅ تعديل: تحويل الإيميل لحروف صغيرة
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user) return res.status(400).json({ message: "خطأ في البيانات" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "خطأ في البيانات" });

        const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET || 'SecretKey123', { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

// Orders
app.post('/orders', authenticateToken, async (req, res) => {
    try {
        const newOrder = new Order({ userId: req.user.id, ...req.body });
        await newOrder.save();
        res.status(201).json(newOrder);
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
