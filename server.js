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

// Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    message: { message: "تم تجاوز عدد الطلبات المسموح به" }
});
app.use('/api', globalLimiter);

const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 100,
    message: { message: "محاولات دخول كثيرة جداً" }
});
app.use('/api/auth', authLimiter);

// 2. Database
const dbURI = process.env.MONGODB_URI;
mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to Details Store Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// 3. Schemas

// ✅ تعديل: إضافة حقل popularity لتتبع الشعبية
const productSchema = new mongoose.Schema({
    name: { 
        ar: { type: String, required: true, trim: true },
        en: { type: String, required: true, trim: true }
    },
    brand: { type: String, uppercase: true, default: 'DETAILS' },
    description: { ar: String, en: String },
    price: { type: Number, required: true },
    oldPrice: Number,
    dimensions: String,
    imageUrl: { type: String, required: true },
    images: [String],
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    isSoldOut: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    popularity: { type: Number, default: 0 } // ✅ الحقل الجديد
}, { timestamps: true });

// تحسين الأداء: إضافة فهارس (Indexes) لتسريع عمليات البحث والترتيب
productSchema.index({ popularity: -1 }); // تسريع الترتيب حسب الأكثر شعبية
productSchema.index({ createdAt: -1 });  // تسريع الترتيب حسب الأحدث
productSchema.index({ category: 1 });    // تسريع الفلترة حسب القسم

const Product = mongoose.model('Product', productSchema);

// ... (باقي الـ Schemas كما هي: Banner, Category, Wishlist, User) ...
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

// Middleware Auth
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "يرجى تسجيل الدخول أولاً" });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) return res.status(403).json({ message: "الجلسة انتهت" });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) next();
    else res.status(403).json({ message: "للمسؤولين فقط" });
};

// 4. Routes

// ✅ تعديل: دمج منطق الترتيب (Sort) هنا ليتوافق مع الفرونت إند
app.get('/api/products', async (req, res) => {
    try {
        const { category, search, sort } = req.query;
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

        let productsQuery = Product.find(query).populate('category');

        // منطق الترتيب
        if (sort === 'popular') {
            productsQuery = productsQuery.sort({ popularity: -1 }).limit(10);
        } else {
            productsQuery = productsQuery.sort({ createdAt: -1 });
        }

        const products = await productsQuery;
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ message: "Error", error: err.message });
    }
});

app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category');
        if (!product) return res.status(404).json({ message: "Not Found" });
        res.json(product);
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

// ... (POST/PUT/DELETE Products - نفس الكود السابق) ...
app.post('/api/products', authenticateToken, isAdmin, async (req, res) => {
    try {
        // (نفس منطق إضافة المنتج الخاص بك)
        // ... اختصاراً للكود ...
        let categoryId;
        const { category } = req.body;
        if (mongoose.Types.ObjectId.isValid(category)) {
             categoryId = category;
        } else {
             // منطق إنشاء الكاتيجوري
             const slug = category.trim().toLowerCase().replace(/\s+/g, '-');
             let existingCategory = await Category.findOne({ slug });
             if (existingCategory) categoryId = existingCategory._id;
             else {
                 const newCat = new Category({ name: { ar: category, en: category }, slug, imageUrl: "https://placehold.co/600" });
                 const saved = await newCat.save();
                 categoryId = saved._id;
             }
        }
        const newProduct = new Product({ ...req.body, category: categoryId });
        await newProduct.save();
        res.status(201).json(newProduct);
    } catch (err) { res.status(400).json({ message: "Error" }); }
});
// ...

// Banners & Categories & Wishlist (نفس الكود السابق)
app.get('/api/banners', async (req, res) => { /* ... */ });
app.get('/api/categories', async (req, res) => { 
    try {
        const categories = await Category.find();
        res.json(categories);
    } catch (err) { res.status(500).json({ message: "Error" }); }
});
app.get('/api/wishlist', authenticateToken, async (req, res) => { /* ... */ });
app.post('/api/wishlist', authenticateToken, async (req, res) => { /* ... */ });

// Auth (نفس الكود السابق)
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) return res.status(400).json({ message: "Email exists" });
        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = new User({ name, email: email.toLowerCase(), password: hashedPassword, phone });
        await newUser.save();
        res.status(201).json({ message: "Created" });
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email: email.toLowerCase() });
        if (!user || !(await bcrypt.compare(password, user.password))) {
            return res.status(400).json({ message: "Invalid credentials" });
        }
        const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });
        res.json({ token, user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
    } catch (err) { res.status(500).json({ message: "Error" }); }
});

// ✅ تعديل: تحديث الشعبية عند إنشاء الطلب
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const { products, amount, shippingAddress } = req.body;
        
        const newOrder = new Order({
            userId: req.user.id,
            products,
            amount,
            shippingAddress
        });

        const savedOrder = await newOrder.save();

        // تحديث عداد الشعبية لكل منتج في الطلب
        for (const item of products) {
            // نفترض أن item يحتوي على id و quantity
            await Product.findByIdAndUpdate(item.id, { 
                $inc: { popularity: item.quantity || 1 } 
            });
        }

        res.status(201).json(savedOrder);
    } catch (err) {
        res.status(500).json({ message: "خطأ في إنشاء الطلب", error: err.message });
    }
});

app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب الطلبات" });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Details Backend is running on port: ${PORT}`);
});
