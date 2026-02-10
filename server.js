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
app.use(helmet()); // إضافة ترويسات أمان HTTP لحماية التطبيق
app.use(morgan('dev')); // تسجيل الطلبات (Logging) لمراقبة النشاط وكشف الأخطاء
app.use(cors()); 
app.use(express.json({ limit: '10kb' })); // تحديد حجم البيانات المستقبلة لمنع إغراق السيرفر
app.use(mongoSanitize()); // تنظيف البيانات المدخلة لمنع هجمات NoSQL Injection
app.use(xss()); // تنظيف البيانات من أكواد HTML/JS الخبيثة (XSS)
app.use(hpp()); // منع تلوث المعاملات (HTTP Parameter Pollution)

// حماية عامة: تحديد عدد الطلبات لكل IP (Rate Limiting)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 100, // 100 طلب كحد أقصى لكل IP
    message: { message: "تم تجاوز عدد الطلبات المسموح به، يرجى المحاولة لاحقاً" }
});
app.use('/api', globalLimiter);

// حماية خاصة لتسجيل الدخول وإنشاء الحساب (Brute Force Protection)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ساعة واحدة
    max: 10, // 10 محاولات فقط لكل IP
    message: { message: "محاولات دخول كثيرة جداً، يرجى الانتظار لمدة ساعة" }
});
app.use('/api/auth', authLimiter);

// 2. الاتصال بقاعدة البيانات (MongoDB Atlas)
const dbURI = process.env.MONGODB_URI;

mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to Details Store Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// 3. تعريف الـ Schemas

// قالب المنتجات (يدعم Hover Effect عبر مصفوفة images)
const productSchema = new mongoose.Schema({
    name: { 
        ar: { type: String, required: true, trim: true },
        en: { type: String, required: true, trim: true }
    },
    brand: { type: String, uppercase: true, default: 'DETAILS' },
    description: {
        ar: { type: String },
        en: { type: String }
    },
    price: { type: Number, required: true },
    oldPrice: Number,
    dimensions: String,
    imageUrl: { type: String, required: true }, // الصورة الأساسية
    images: [String], // قائمة الصور (الصورة الثانية تستخدم للـ Hover في Flutter)
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    isSoldOut: { type: Boolean, default: false },
    featured: { type: Boolean, default: false }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

// قالب الإعلانات (Banners)
const bannerSchema = new mongoose.Schema({
    title: { 
        ar: { type: String, required: true },
        en: { type: String, required: true }
    },
    imageUrl: { type: String, required: true },
    buttonText: { 
        ar: { type: String, default: "اكتشف ديتيلز" },
        en: { type: String, default: "Discover Details" }
    },
    link: String,
    location: { type: String, enum: ['home', 'category'], default: 'home' }, // 'home' or 'category'
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' } // يربط الإعلان بكاتيجوري معين
}, { timestamps: true });

const Banner = mongoose.model('Banner', bannerSchema);

// قالب التصنيفات (Categories)
const categorySchema = new mongoose.Schema({
    name: { 
        ar: { type: String, required: true },
        en: { type: String, required: true }
    },
    slug: { type: String, required: true, unique: true }, // للربط مع المنتجات (مثلاً: bags)
    imageUrl: { type: String, required: true }
}, { timestamps: true });

const Category = mongoose.model('Category', categorySchema);

// قالب المفضلة (Wishlist)
const wishlistSchema = new mongoose.Schema({
    userId: { type: String, required: true }, // معرف المستخدم أو الجهاز
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
}, { timestamps: true });

const Wishlist = mongoose.model('Wishlist', wishlistSchema);

// قالب المستخدمين (Users)
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: String,
    isAdmin: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// قالب الطلبات (Orders)
const orderSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    products: [{
        id: String,
        title: String,
        quantity: Number,
        price: Number,
        imageUrl: String
    }],
    amount: { type: Number, required: true },
    shippingAddress: {
        city: String,
        street: String,
        phone: String
    },
    status: { 
        type: String, 
        enum: ['قيد التجهيز', 'تم الشحن', 'تم التوصيل', 'ملغي'], 
        default: 'قيد التجهيز' 
    }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

// --- Middleware للحماية (Authentication & Authorization) ---

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "يرجى تسجيل الدخول أولاً" });

    jwt.verify(token, process.env.JWT_SECRET || 'SecretKey123', (err, user) => {
        if (err) return res.status(403).json({ message: "الجلسة انتهت، يرجى إعادة تسجيل الدخول" });
        req.user = user;
        next();
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        res.status(403).json({ message: "هذا الإجراء مخصص للمسؤولين فقط" });
    }
};

// 4. الروابط (Routes)

// --- روابط المنتجات (CRUD Operations) ---

// جلب الكل (مع دعم البحث والتصنيف)
app.get('/api/products', async (req, res) => {
    try {
        const { category, search } = req.query;
        let query = {};

        // تصفية حسب التصنيف
        if (category) {
            const categoryDoc = await Category.findOne({ slug: category });
            if (!categoryDoc) return res.status(200).json([]);
            query.category = categoryDoc._id;
        }

        // تصفية حسب البحث (بالاسم العربي أو الإنجليزي)
        if (search) {
            query.$or = [
                { 'name.ar': { $regex: search, $options: 'i' } },
                { 'name.en': { $regex: search, $options: 'i' } }
            ];
        }

        const products = await Product.find(query)
            .sort({ createdAt: -1 })
            .populate('category');
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب البيانات", error: err.message });
    }
});

// جلب منتج واحد بالتفصيل
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id).populate('category');
        if (!product) return res.status(404).json({ message: "المنتج غير موجود" });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: "خطأ في السيرفر" });
    }
});

// إضافة منتج جديد
app.post('/api/products', authenticateToken, isAdmin, async (req, res) => {
    try {
        let categoryId;
        const { category } = req.body;

        // منطق ذكي للتعامل مع التصنيف (Category)
        if (category && typeof category === 'object' && category.slug) {
            // 1. إذا تم إرسال كائن تصنيف كامل (لإنشاء تصنيف مخصص فوراً)
            let existingCategory = await Category.findOne({ slug: category.slug });
            if (existingCategory) {
                categoryId = existingCategory._id;
            } else {
                const newCategory = new Category({
                    imageUrl: "https://placehold.co/600x400?text=Category", // صورة افتراضية
                    ...category
                });
                const savedCategory = await newCategory.save();
                categoryId = savedCategory._id;
            }
        } else if (typeof category === 'string') {
            // 2. إذا تم إرسال نص (ID أو اسم التصنيف)
            // أ) التحقق مما إذا كان ID صالح وموجود مسبقاً
            if (mongoose.Types.ObjectId.isValid(category)) {
                const exists = await Category.exists({ _id: category });
                if (exists) categoryId = category;
            }

            // ب) إذا لم يكن ID، نعامله كاسم/Slug وننشئه تلقائياً إذا لم يوجد
            if (!categoryId) {
                const slug = category.trim().toLowerCase().replace(/\s+/g, '-');
                let existingCategory = await Category.findOne({ slug });
                
                if (existingCategory) {
                    categoryId = existingCategory._id;
                } else {
                    // إنشاء تصنيف جديد تلقائياً
                    const newCategory = new Category({
                        name: { ar: category, en: category }, // نستخدم نفس الاسم للغتين مؤقتاً
                        slug: slug,
                        imageUrl: "https://placehold.co/600x400?text=New+Category"
                    });
                    const savedCategory = await newCategory.save();
                    categoryId = savedCategory._id;
                }
            }
        }

        // إنشاء المنتج مع ربط الـ ID الصحيح للتصنيف
        const newProduct = new Product({ ...req.body, category: categoryId });
        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (err) {
        res.status(400).json({ message: "بيانات غير صالحة", error: err.message });
    }
});

// تعديل منتج (مهم للوحة التحكم)
app.put('/api/products/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedProduct);
    } catch (err) {
        res.status(400).json({ message: "فشل التحديث" });
    }
});

// حذف منتج
app.delete('/api/products/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Product.findByIdAndDelete(req.params.id);
        res.json({ message: "تم حذف المنتج بنجاح" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في الحذف" });
    }
});

// --- روابط الإعلانات (Banners) ---

app.get('/api/banners', async (req, res) => {
    try {
        const { location, category } = req.query;
        let query = {};

        if (location) query.location = location;

        if (category) {
            // البحث عن الكاتيجوري باستخدام الـ slug
            const categoryDoc = await Category.findOne({ slug: category });
            if (categoryDoc) {
                query.category = categoryDoc._id;
            }
        }

        const banners = await Banner.find(query).sort({ createdAt: -1 });
        res.status(200).json(banners);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب الإعلانات" });
    }
});

app.post('/api/banners', authenticateToken, isAdmin, async (req, res) => {
    try {
        const newBanner = new Banner(req.body);
        const savedBanner = await newBanner.save();
        res.status(201).json(savedBanner);
    } catch (err) {
        res.status(400).json({ message: "فشل إضافة الإعلان" });
    }
});

app.delete('/api/banners/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Banner.findByIdAndDelete(req.params.id);
        res.json({ message: "تم حذف الإعلان" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في الحذف" });
    }
});

// --- روابط التصنيفات (Categories) ---

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.status(200).json(categories);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب التصنيفات" });
    }
});

app.post('/api/categories', authenticateToken, isAdmin, async (req, res) => {
    try {
        const newCategory = new Category(req.body);
        const savedCategory = await newCategory.save();
        res.status(201).json(savedCategory);
    } catch (err) {
        res.status(400).json({ message: "فشل إضافة التصنيف" });
    }
});

// --- روابط المفضلة (Wishlist) ---

// جلب قائمة المفضلة للمستخدم الحالي (المسجل دخوله)
app.get('/api/wishlist', authenticateToken, async (req, res) => {
    try {
        const wishlist = await Wishlist.findOne({ userId: req.user.id }).populate('products');
        res.status(200).json(wishlist ? wishlist.products : []);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب المفضلة" });
    }
});

// إضافة أو إزالة منتج من المفضلة (Toggle)
app.post('/api/wishlist', authenticateToken, async (req, res) => {
    try {
        const { productId } = req.body;
        const userId = req.user.id; // الحصول على معرف المستخدم من التوكن
        
        let wishlist = await Wishlist.findOne({ userId });
        if (!wishlist) {
            wishlist = new Wishlist({ userId, products: [] });
        }

        // التحقق: إذا كان المنتج موجوداً نحذفه، وإذا لم يكن موجوداً نضيفه
        const index = wishlist.products.indexOf(productId);
        if (index === -1) {
            wishlist.products.push(productId);
        } else {
            wishlist.products.splice(index, 1);
        }

        await wishlist.save();
        
        // إرجاع القائمة المحدثة بالكامل
        const updatedWishlist = await wishlist.populate('products');
        res.status(200).json(updatedWishlist.products);
    } catch (err) {
        res.status(400).json({ message: "فشل تحديث المفضلة" });
    }
});

// --- روابط المصادقة (Authentication) ---

// تسجيل حساب جديد
app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password, phone } = req.body;
        
        // حماية: التحقق من قوة كلمة المرور (مثلاً 6 أحرف على الأقل)
        if (!password || password.length < 6) return res.status(400).json({ message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" });

        const existingUser = await User.findOne({ email });
        if (existingUser) return res.status(400).json({ message: "البريد الإلكتروني مسجل مسبقاً" });

        const hashedPassword = await bcrypt.hash(password, 10);
        
        const newUser = new User({
            name, 
            email, 
            password: hashedPassword, 
            phone
        });
        
        await newUser.save();
        res.status(201).json({ message: "تم إنشاء الحساب بنجاح" });
    } catch (err) {
        console.error("Register Error:", err); // تسجيل الخطأ في السيرفر فقط للمطور
        res.status(500).json({ message: "خطأ في إنشاء الحساب" }); // حماية: عدم إرسال تفاصيل الخطأ التقنية للمستخدم
    }
});

// تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

        const token = jwt.sign({ id: user._id, isAdmin: user.isAdmin }, process.env.JWT_SECRET || 'SecretKey123', { expiresIn: '7d' });

        res.json({ 
            token, 
            user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin } 
        });
    } catch (err) {
        res.status(500).json({ message: "خطأ في تسجيل الدخول" });
    }
});

// التحقق من صحة التوكن (للدخول التلقائي)
app.get('/api/auth/validate-token', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
        
        res.json({ 
            valid: true, 
            user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin } 
        });
    } catch (err) {
        res.status(500).json({ message: "خطأ في التحقق" });
    }
});

// --- روابط الطلبات (Orders) ---

// إنشاء طلب جديد
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
        res.status(201).json(savedOrder);
    } catch (err) {
        res.status(500).json({ message: "خطأ في إنشاء الطلب", error: err.message });
    }
});

// جلب طلبات المستخدم
app.get('/api/orders', authenticateToken, async (req, res) => {
    try {
        const orders = await Order.find({ userId: req.user.id }).sort({ createdAt: -1 });
        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب الطلبات" });
    }
});

// 5. تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Details Backend is running on port: ${PORT}`);
});