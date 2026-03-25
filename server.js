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
const crypto = require('crypto');
const morgan = require('morgan');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.set('trust proxy', 1); // ثق في البروكسي الأول (ضروري للاستضافة على Render لإصلاح خطأ Rate Limit)
const PORT = process.env.PORT || 3000;
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// 1. Middleware
app.use(helmet()); // إضافة ترويسات أمان HTTP لحماية التطبيق
app.use(morgan('dev')); // تسجيل الطلبات (Logging) لمراقبة النشاط وكشف الأخطاء
app.use(cors()); 
app.use(express.json({ limit: '5mb' })); // تحديد حجم البيانات المستقبلة لمنع إغراق السيرفر
app.use(express.urlencoded({ extended: true })); // دعم استقبال البيانات من النماذج التقليدية
app.use(mongoSanitize()); // تنظيف البيانات المدخلة لمنع هجمات NoSQL Injection
app.use(xss()); // تنظيف البيانات من أكواد HTML/JS الخبيثة (XSS)
app.use(hpp()); // منع تلوث المعاملات (HTTP Parameter Pollution)


// حماية عامة: تحديد عدد الطلبات لكل IP (Rate Limiting)
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 دقيقة
    max: 2000, // زيادة الحد إلى 2000 طلب أثناء التطوير
    message: { message: "تم تجاوز عدد الطلبات المسموح به، يرجى المحاولة لاحقاً" }
});
app.use('/api', globalLimiter);

// حماية خاصة لتسجيل الدخول وإنشاء الحساب (Brute Force Protection)
const authLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // ساعة واحدة
    max: 100, // زيادة الحد إلى 100 محاولة
    message: { message: "محاولات دخول كثيرة جداً، يرجى الانتظار لمدة ساعة" }
});
app.use('/api/auth', authLimiter);

// 2. الاتصال بقاعدة البيانات (MongoDB Atlas)
const dbURI = process.env.MONGODB_URI;

mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to Details Store Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// دالة لإنشاء قالب HTML للإيميل بتصميم احترافي
const getEmailTemplate = (title, content) => `
<!DOCTYPE html>
<html dir="rtl" lang="ar">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
        @import url('https://fonts.googleapis.com/css2?family=Tajawal:wght@400;500;700&display=swap');
        body { font-family: 'Tajawal', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f0f2f5; margin: 0; padding: 0; line-height: 1.8; color: #333; }
        .email-container { max-width: 600px; margin: 30px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 8px 30px rgba(0,0,0,0.08); }
        .header { background-color: #ffffff; padding: 40px 20px 20px; text-align: center; border-bottom: 1px solid #f0f0f0; }
        .header h1 { margin: 0; font-size: 26px; letter-spacing: 4px; color: #000; text-transform: uppercase; font-weight: 800; }
        .header p { margin: 5px 0 0; font-size: 12px; color: #888; letter-spacing: 2px; text-transform: uppercase; }
        .content { padding: 40px 30px; text-align: right; background-color: #fff; }
        .content h2 { color: #111; margin-top: 0; font-size: 20px; font-weight: 700; margin-bottom: 20px; position: relative; display: inline-block; }
        .content h2::after { content: ''; display: block; width: 40px; height: 3px; background: #000; margin-top: 8px; border-radius: 2px; }
        .footer { background-color: #f9f9f9; padding: 30px 20px; text-align: center; font-size: 13px; color: #888; border-top: 1px solid #eee; }
        .info-box { background-color: #f8f9fa; border: 1px dashed #ced4da; border-radius: 8px; padding: 20px; margin: 25px 0; }
        .label { font-weight: 700; color: #444; }
        a { color: #000; text-decoration: none; font-weight: 500; }
        .footer a { color: #666; text-decoration: underline; }
        @media only screen and (max-width: 600px) {
            .email-container { margin: 0; border-radius: 0; }
            .content { padding: 30px 20px; }
        }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>DETAILS</h1>
            <p>LUXURY STORE</p>
        </div>
        <div class="content">
            <h2>${title}</h2>
            ${content}
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Details Store. جميع الحقوق محفوظة.</p>
            <p>هل تحتاج مساعدة؟ <a href="mailto:support@details-store.com">تواصل معنا</a></p>
        </div>
    </div>
</body>
</html>
`;

// دالة مساعدة لإرسال الإيميلات عبر Brevo API لتجاوز قيود الاستضافة
const sendEmailViaBrevo = async ({ to, bcc, subject, textContent, htmlContent }) => {
    try {
        const payload = {
            // نستخدم الإيميل الموثق (Gmail) بس الاسم يظهر "Details Store"
            sender: { name: "Details Store", email: "no-reply@details-store.com" },
            subject: subject,
            textContent: textContent,
            htmlContent: htmlContent
        };

        if (to) payload.to = [{ email: to }];
        if (bcc) payload.bcc = bcc.map(email => ({ email }));

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("❌ خطأ من سيرفر Brevo:", errorData);
            return false;
        }
        
        console.log("✅ تم إرسال الإيميل بنجاح عبر Brevo");
        return true;
    } catch (error) {
        console.error("❌ فشل الاتصال بـ Brevo:", error);
        return false;
    }
};

// 3. تعريف الـ Schemas

// قالب الكلمات الأكثر بحثاً (Trending Searches)
const searchKeywordSchema = new mongoose.Schema({
    keyword: { type: String, required: true, unique: true, trim: true },
    count: { type: Number, default: 1 } // كم مرة تم البحث عن هذه الكلمة
}, { timestamps: true });

const SearchKeyword = mongoose.model('SearchKeyword', searchKeywordSchema);

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
    featured: { type: Boolean, default: false },
    popularity: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 }, // الكمية الإجمالية
    sizes: [{
        size: { type: String, required: true },
        quantity: { type: Number, default: 0 }
    }],
    colors: [{
        name: { 
            ar: { type: String },
            en: { type: String }
        },
        hex: String, // كود اللون للعرض في التطبيق
        imageUrl: String // صورة خاصة بهذا اللون
    }]
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
    password: { type: String },
    googleId: { type: String },
    avatar: { type: String }, 
    phone: String,
    addresses: [{
        city: { type: String, required: true },
        street: { type: String, required: true },
        phone: { type: String, required: true }
    }],
    isAdmin: { type: Boolean, default: false },
    passwordResetToken: String,
    passwordResetExpires: Date,
    isVerified: { type: Boolean, default: false }, // هل الحساب مفعل؟
    otp: String, // رمز التحقق للتفعيل
    otpExpires: Date
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

// قالب المستخدمين قيد الانتظار (PendingUser) - تخزين مؤقت حتى التفعيل
const pendingUserSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phone: String,
    otp: String,
    otpExpires: Date
}, { timestamps: true });

const PendingUser = mongoose.model('PendingUser', pendingUserSchema);

// قالب الكوبونات (Coupons)
const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true }, // رمز الكوبون
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true }, // نوع الخصم: نسبة أو مبلغ ثابت
    value: { type: Number, required: true }, // قيمة الخصم
    expirationDate: { type: Date, required: true }, // تاريخ الانتهاء
    isActive: { type: Boolean, default: true }, // هل الكوبون فعال؟
    usageLimit: { type: Number, default: 100 }, // عدد مرات الاستخدام المسموحة
    usedCount: { type: Number, default: 0 } // كم مرة تم استخدامه
}, { timestamps: true });

const Coupon = mongoose.model('Coupon', couponSchema);

// قالب الطلبات (Orders)
const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    products: [{
        id: String,
        title: String,
        quantity: Number,
        price: Number,
        imageUrl: String,
        size: String,
        color: String
    }],
    subtotal: { type: Number, required: true }, // المجموع قبل الخصم
    discountAmount: { type: Number, default: 0 }, // قيمة الخصم
    couponCode: { type: String }, // الكود المستخدم (اختياري)
    amount: { type: Number, required: true }, // المجموع النهائي (تم التعديل ليتطابق مع الفرونت اند)
    shippingAddress: {
        city: String,
        street: String,
        phone: String
    },
    paymentMethod: { 
        type: String, 
        enum: ['cod', 'card'], 
        default: 'cod' 
    },
    status: { 
        type: String, 
        enum: ['قيد التجهيز', 'تم الشحن', 'تم التوصيل', 'ملغي'], 
        default: 'قيد التجهيز' 
    }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

// قالب الإشعارات (Notifications)
const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false }, // هل قرأ المستخدم الإشعار؟
    type: { type: String, default: 'system' } // نوع الإشعار: system, order, promo
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

// --- Middleware للحماية (Authentication & Authorization) ---

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "يرجى تسجيل الدخول أولاً" });

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        if (err) return res.status(403).json({ message: "الجلسة انتهت" });
        
        // فحص إضافي: هل المستخدم ما زال موجوداً في الداتا بيس؟
        const userExists = await User.findById(decoded.id);
        if (!userExists) {
            return res.status(401).json({ message: "هذا الحساب لم يعد موجوداً" });
        }

        req.user = decoded;
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

app.get('/', (req, res) => {
    res.send('Welcome to Details Store API');
});

app.get('/api/health', (req, res) => {
    res.status(200).json({ 
        status: 'UP', 
        timestamp: new Date(),
        uptime: process.uptime() // يعطيك مدة تشغيل السيرفر بالثواني
    });
});

// --- راوت جديد 🔥: الاقتراحات السريعة (Suggestions) ---
app.get('/api/search-suggestions', async (req, res) => {
    try {
        const { q } = req.query;
        if (!q) return res.json([]);

        let pipeline = [
            {
                $search: {
                    index: "product_search",
                    text: {
                        query: q,
                        path: ["name.ar", "name.en"],
                        fuzzy: { maxEdits: 1 } // التسامح مع خطأ واحد فقط للاقتراحات السريعة
                    }
                }
            },
            { $limit: 6 },
            { $project: { _id: 0, "name.ar": 1, "name.en": 1 } } // إرجاع الاسم فقط للحفاظ على الباندويث
        ];

        const products = await Product.aggregate(pipeline);
        res.status(200).json(products);
    } catch (err) {
        console.error("Suggestion Error:", err);
        res.status(500).json([]);
    }
});

// جلب الكلمات الأكثر بحثاً (Trending Searches)
app.get('/api/trending-searches', async (req, res) => {
    try {
        const trending = await SearchKeyword.find()
            .sort({ count: -1 }) // ترتيب تنازلي (الأكثر بحثاً أولاً)
            .limit(6); // جلب أعلى 6 كلمات فقط

        const tags = trending.map(t => t.keyword);

        // إذا كانت قاعدة البيانات جديدة ولا يوجد فيها أبحاث بعد، نرسل قيم افتراضية
        if (tags.length === 0) {
            return res.json(['ساعات', 'عطور', 'حقائب', 'أحذية', 'فساتين', 'هدايا']);
        }

        res.status(200).json(tags);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب الكلمات الشائعة" });
    }
});

// جلب الكل (مع دعم البحث الضبابي الذكي والتصنيف والـ Pagination)
app.get('/api/products', async (req, res) => {
    try {
        // نأخذ page و limit فقط إذا تم إرسالهم، وإلا نتركهم فارغين
        const { category, search, minPrice, maxPrice, sort, page, limit } = req.query;
        let pipeline = [];
        let matchStage = {};

        // 1. مرحلة البحث الذكي (يجب أن تكون أول خطوة في الـ Pipeline إذا كان هناك بحث)
        if (search) {
            SearchKeyword.findOneAndUpdate(
                { keyword: search.trim().toLowerCase() }, 
                { $inc: { count: 1 } },
                { upsert: true, new: true }
            ).catch(err => console.error("Search Tracking Error:", err));
            
            pipeline.push({
                $search: {
                    index: "product_search", 
                    text: {
                        query: search,
                        path: ["name.ar", "name.en", "description.ar", "description.en"],
                        fuzzy: { maxEdits: 2, prefixLength: 1 }
                    }
                }
            });
        }

        // 2. تصفية حسب التصنيف (Category)
        if (category) {
            const categoryDoc = await Category.findOne({ slug: category });
            if (!categoryDoc) return res.status(200).json(page ? { data: [], hasMore: false } : []); 
            matchStage.category = categoryDoc._id;
        }

        // 3. تصفية حسب السعر
        if (minPrice || maxPrice) {
            matchStage.price = {};
            if (minPrice) matchStage.price.$gte = Number(minPrice);
            if (maxPrice) matchStage.price.$lte = Number(maxPrice);
        }

        // إذا كان هناك شروط (تصنيف أو سعر)، نضيف مرحلة $match
        if (Object.keys(matchStage).length > 0) {
            pipeline.push({ $match: matchStage });
        }

        // 4. الترتيب
        let sortStage = { createdAt: -1 }; 
        if (sort === 'price_asc') sortStage = { price: 1 };
        if (sort === 'price_desc') sortStage = { price: -1 };
        
        if (!search) {
            pipeline.push({ $sort: sortStage });
        }

        // 5. إضافة الـ Pagination (فقط إذا طلبت شاشة البحث ذلك)
        if (page && limit) {
            const pageNum = parseInt(page);
            const limitNum = parseInt(limit);
            const skip = (pageNum - 1) * limitNum;
            pipeline.push({ $skip: skip });
            pipeline.push({ $limit: limitNum });
        }

        // 6. دمج التصنيفات
        pipeline.push({
            $lookup: {
                from: "categories", 
                localField: "category",
                foreignField: "_id",
                as: "category"
            }
        });
        pipeline.push({ $unwind: { path: "$category", preserveNullAndEmptyArrays: true } });

        const products = await Product.aggregate(pipeline);
        
        // 💡 الحل السحري هنا: 
        // إذا كان الطلب من شاشة البحث نرجع Object، وإذا من الرئيسية نرجع Array
        if (page && limit) {
            res.status(200).json({
                data: products,
                hasMore: products.length === parseInt(limit) 
            });
        } else {
            res.status(200).json(products);
        }

    } catch (err) {
        console.error("Search Error:", err);
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

// تعديل تصنيف (للأدمن)
app.put('/api/categories/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const updatedCategory = await Category.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedCategory);
    } catch (err) {
        res.status(400).json({ message: "فشل تحديث التصنيف" });
    }
});

// حذف تصنيف (للأدمن)
app.delete('/api/categories/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Category.findByIdAndDelete(req.params.id);
        res.json({ message: "تم حذف التصنيف بنجاح" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في حذف التصنيف" });
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
            await Product.findByIdAndUpdate(productId, { $inc: { popularity: 1 } });
        } else {
            wishlist.products.splice(index, 1);
            await Product.findByIdAndUpdate(productId, { $inc: { popularity: -1 } });
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

        // التأكد من أن البريد غير مسجل كحساب حقيقي
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: "البريد الإلكتروني مسجل مسبقاً" });
        }

        // إنشاء رمز OTP مكون من 6 أرقام
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
        const otpExpires = Date.now() + 10 * 60 * 1000; // صالح لمدة 10 دقائق
        
        const hashedPassword = await bcrypt.hash(password, 10);
        
        // حفظ البيانات في الجدول المؤقت (PendingUser) بدلاً من User
        // نستخدم findOneAndUpdate مع upsert لتحديث البيانات إذا حاول التسجيل مرة أخرى قبل التفعيل
        await PendingUser.findOneAndUpdate(
            { email },
            {
                name, 
                email, 
                password: hashedPassword, 
                phone,
                otp: hashedOtp, 
                otpExpires
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        // إرسال رمز التحقق عبر الإيميل
        const emailContent = `
            <p>مرحباً ${name}،</p>
            <p>شكراً لتسجيلك في Details Store. لتفعيل حسابك، يرجى استخدام رمز التحقق التالي:</p>
            <div style="text-align: center; margin: 30px 0;">
                <span style="background-color: #f0f0f0; color: #000; padding: 15px 30px; font-size: 24px; letter-spacing: 5px; font-weight: bold; border-radius: 8px; border: 1px dashed #333;">${otp}</span>
            </div>
            <p style="color: #666; font-size: 12px;">هذا الرمز صالح لمدة 10 دقائق.</p>
        `;

        await sendEmailViaBrevo({
            to: email,
            subject: 'رمز تفعيل الحساب - Details Store',
            htmlContent: getEmailTemplate('تفعيل الحساب', emailContent)
        });
        
        res.status(200).json({ message: "تم إرسال رمز التحقق إلى بريدك الإلكتروني", email });

    } catch (err) {
        console.error("Register Error:", err); // تسجيل الخطأ في السيرفر فقط للمطور
        res.status(500).json({ message: "خطأ في إنشاء الحساب" }); // حماية: عدم إرسال تفاصيل الخطأ التقنية للمستخدم
    }
});

// تفعيل الحساب باستخدام OTP
app.post('/api/auth/verify-email', async (req, res) => {
    try {
        const { email, otp } = req.body;

        if (!email || !otp) {
            return res.status(400).json({ message: "البيانات ناقصة" });
        }

        // تشفير الرمز المدخل لمقارنته مع المخزن
        const hashedOtp = crypto.createHash('sha256').update(otp.toString()).digest('hex');

        // البحث في الجدول المؤقت (PendingUser)
        const pendingUser = await PendingUser.findOne({
            email,
            otp: hashedOtp,
            otpExpires: { $gt: Date.now() } // التأكد أن الرمز لم تنته صلاحيته
        });

        if (!pendingUser) {
            return res.status(400).json({ message: "رمز التحقق غير صحيح أو منتهي الصلاحية" });
        }

        // نقل البيانات من المؤقت إلى الجدول الأساسي (إنشاء الحساب الحقيقي الآن)
        const newUser = new User({
            name: pendingUser.name,
            email: pendingUser.email,
            password: pendingUser.password,
            phone: pendingUser.phone,
            isVerified: true, // الحساب مفعل وجاهز
            isAdmin: false
        });
        await newUser.save();

        // حذف البيانات من الجدول المؤقت
        await PendingUser.deleteOne({ email });

        // تسجيل الدخول مباشرة بعد التفعيل
        const token = jwt.sign({ id: newUser._id, email: newUser.email, isAdmin: newUser.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({ 
            message: "تم تفعيل الحساب بنجاح",
            token,
            user: { id: newUser._id, name: newUser.name, email: newUser.email, isAdmin: newUser.isAdmin }
        });

    } catch (err) {
        console.error("Verification Error:", err);
        res.status(500).json({ message: "حدث خطأ أثناء التفعيل" });
    }
});

// تسجيل الدخول
app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) return res.status(400).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

        // التحقق من أن الحساب مفعل
        if (!user.isVerified) {
            return res.status(400).json({ message: "يرجى تفعيل الحساب أولاً عبر الرمز المرسل لبريدك الإلكتروني" });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({ 
            token, 
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email, 
                isAdmin: user.isAdmin,
                phone: user.phone,
                avatar: user.avatar
            } 
        });
    } catch (err) {
        res.status(500).json({ message: "خطأ في تسجيل الدخول" });
    }
});

// طلب إعادة تعيين كلمة المرور (نسيت كلمة السر)
app.post('/api/auth/forgot-password', async (req, res) => {
    try {
        // 1. البحث عن المستخدم عن طريق الإيميل
        const user = await User.findOne({ email: req.body.email });
        if (!user) {
            // حماية: حتى لو المستخدم غير موجود، نرسل رسالة نجاح عامة لمنع كشف الإيميلات المسجلة
            return res.status(200).json({ message: "إذا كان بريدك الإلكتروني مسجلاً لدينا، فستصلك رسالة لإعادة تعيين كلمة المرور." });
        }

        // 2. إنشاء توكن إعادة التعيين
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.passwordResetExpires = Date.now() + 10 * 60 * 1000; // صلاحية 10 دقائق
        await user.save();

        // 3. إرسال التوكن إلى إيميل المستخدم
        const resetURL = `https://details-store.com/reset-password/${resetToken}`; 
        
        const emailContent = `
            <p>لقد طلبت إعادة تعيين كلمة المرور الخاصة بك.</p>
            <p>اضغط على الرابط التالي لإعادة تعيينها. هذا الرابط صالح لمدة 10 دقائق فقط.</p>
            <div style="text-align: center; margin: 20px 0;">
                <a href="${resetURL}" style="background-color: #000; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">إعادة تعيين كلمة المرور</a>
            </div>
            <p>إذا لم تطلب ذلك، يرجى تجاهل هذه الرسالة.</p>
        `;

        await sendEmailViaBrevo({
            to: user.email,
            subject: 'إعادة تعيين كلمة المرور - Details Store',
            htmlContent: getEmailTemplate('إعادة تعيين كلمة المرور', emailContent)
        });

        res.status(200).json({ message: "إذا كان بريدك الإلكتروني مسجلاً لدينا، فستصلك رسالة لإعادة تعيين كلمة المرور." });

    } catch (err) {
        console.error("Forgot Password Error:", err);
        res.status(500).json({ message: "حدث خطأ، يرجى المحاولة مرة أخرى." });
    }
});

// إعادة تعيين كلمة المرور باستخدام التوكن
app.post('/api/auth/reset-password/:token', async (req, res) => {
    try {
        // 1. تشفير التوكن القادم من الرابط لمقارنته مع المخزن في قاعدة البيانات
        const hashedToken = crypto.createHash('sha256').update(req.params.token).digest('hex');

        // 2. البحث عن المستخدم بالتوكن والتأكد من أن التوكن لم تنتهِ صلاحيته
        const user = await User.findOne({
            passwordResetToken: hashedToken,
            passwordResetExpires: { $gt: Date.now() } // أكبر من الوقت الحالي
        });

        if (!user) {
            return res.status(400).json({ message: "الرابط غير صالح أو انتهت صلاحيته." });
        }

        const { password } = req.body;
        if (!password || password.length < 6) {
            return res.status(400).json({ message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل." });
        }

        user.password = await bcrypt.hash(password, 10);
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save();

        // 7. إنشاء توكن جديد لتسجيل دخول المستخدم تلقائياً بعد التغيير
        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            message: "تم تغيير كلمة المرور بنجاح.",
            token,
            user: { id: user._id, name: user.name, email: user.email, isAdmin: user.isAdmin }
        });

    } catch (err) {
        console.error("Reset Password Error:", err);
        res.status(500).json({ message: "حدث خطأ أثناء إعادة تعيين كلمة المرور." });
    }
});

// رابط تسجيل الدخول عبر جوجل (جديد)
app.post('/api/auth/google', async (req, res) => {
    try {
        const { idToken } = req.body;
        if (!idToken) return res.status(400).json({ message: "توكن جوجل مفقود" });

        const ticket = await googleClient.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID, 
        });

        const payload = ticket.getPayload();
        const { email, name, picture, sub: googleId } = payload;

        let user = await User.findOne({ email });

        if (user) {
            // 1. إذا المستخدم موجود، نحدث بياناته وندخله
            if (!user.googleId) {
                user.googleId = googleId;
                user.avatar = picture;
                user.isVerified = true;
                await user.save();
            }
        } else {
            // 2. الحل هنا: إذا الحساب مش موجود، ننشئه فوراً (Auto Register)
            user = new User({
                name: name,
                email: email,
                googleId: googleId,
                avatar: picture,
                isVerified: true, // حساب جوجل يعتبر مفعل تلقائياً
                password: await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10) // كلمة سر عشوائية
            });
            await user.save();
            console.log(`✅ حساب جديد تم إنشاؤه عبر جوجل: ${email}`);
        }

        // إنشاء التوكن الخاص بنا
        const token = jwt.sign(
            { id: user._id, email: user.email, isAdmin: user.isAdmin }, 
            process.env.JWT_SECRET, 
            { expiresIn: '7d' }
        );

        res.status(200).json({
            token,
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email, 
                isAdmin: user.isAdmin, 
                avatar: user.avatar,
                phone: user.phone
            }
        });

    } catch (err) {
        console.error("Google Auth Error:", err);
        res.status(401).json({ message: "فشل التحقق من حساب جوجل" });
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

// تحديث الملف الشخصي للمستخدم
app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { name, phone, password } = req.body;
        const updateData = { name, phone };

        if (password) {
            updateData.password = await bcrypt.hash(password, 10);
        }

        const updatedUser = await User.findByIdAndUpdate(
            req.user.id,
            updateData,
            { new: true }
        ).select('-password');

        res.json(updatedUser);
    } catch (err) {
        res.status(500).json({ message: "خطأ في تحديث الملف الشخصي" });
    }
});

// --- روابط العناوين (Addresses) ---

// جلب عناوين المستخدم الحالي
app.get('/api/addresses', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('addresses');
        if (!user) {
            return res.status(404).json({ message: "المستخدم غير موجود" });
        }
        const addresses = user.addresses.map(addr => ({
            id: addr._id,
            city: addr.city,
            street: addr.street,
            phone: addr.phone
        }));
        res.status(200).json(addresses);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب العناوين" });
    }
});

// إضافة عنوان جديد
app.post('/api/addresses', authenticateToken, async (req, res) => {
    try {
        const { city, street, phone } = req.body;
        if (!city || !street || !phone) {
            return res.status(400).json({ message: "جميع الحقول مطلوبة" });
        }

        const user = await User.findById(req.user.id);
        if (!user) {
            return res.status(404).json({ message: "المستخدم غير موجود" });
        }

        const newAddress = { city, street, phone };
        user.addresses.push(newAddress);
        await user.save();

        const addedAddress = user.addresses[user.addresses.length - 1];
        res.status(201).json({
            id: addedAddress._id,
            city: addedAddress.city,
            street: addedAddress.street,
            phone: addedAddress.phone
        });

    } catch (err) {
        res.status(500).json({ message: "خطأ في إضافة العنوان", error: err.message });
    }
});

// حذف عنوان
app.delete('/api/addresses/:addressId', authenticateToken, async (req, res) => {
    try {
        const { addressId } = req.params;
        const result = await User.updateOne(
            { _id: req.user.id },
            { $pull: { addresses: { _id: addressId } } }
        );
        if (result.modifiedCount === 0) {
            return res.status(404).json({ message: "العنوان غير موجود أو لم يتم حذفه" });
        }
        res.status(200).json({ message: "تم حذف العنوان بنجاح" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في حذف العنوان", error: err.message });
    }
});

// --- روابط الطلبات (Orders) ---

// إضافة كوبون جديد (للمسؤولين فقط)
app.post('/api/coupons', authenticateToken, isAdmin, async (req, res) => {
    try {
        const newCoupon = new Coupon(req.body);
        await newCoupon.save();
        res.status(201).json(newCoupon);
    } catch (err) {
        res.status(400).json({ message: "فشل إضافة الكوبون", error: err.message });
    }
});

// جلب كل الكوبونات (للأدمن)
app.get('/api/coupons', authenticateToken, isAdmin, async (req, res) => {
    try {
        const coupons = await Coupon.find().sort({ createdAt: -1 });
        res.json(coupons);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب الكوبونات" });
    }
});

// حذف كوبون (للأدمن)
app.delete('/api/coupons/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await Coupon.findByIdAndDelete(req.params.id);
        res.json({ message: "تم حذف الكوبون بنجاح" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في حذف الكوبون" });
    }
});

// التحقق من صلاحية الكوبون
app.post('/api/coupons/validate', async (req, res) => {
    try {
        const { code } = req.body;
        if (!code) return res.status(400).json({ message: "يرجى إدخال كود الخصم" });

        const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });

        if (!coupon) {
            return res.status(404).json({ message: "كود الخصم غير صحيح" });
        }

        if (new Date() > coupon.expirationDate) {
            return res.status(400).json({ message: "كود الخصم منتهي الصلاحية" });
        }

        if (coupon.usedCount >= coupon.usageLimit) {
            return res.status(400).json({ message: "تم تجاوز الحد الأقصى لاستخدام هذا الكوبون" });
        }

        res.json({
            valid: true,
            code: coupon.code,
            discountType: coupon.discountType,
            value: coupon.value,
            message: "تم تطبيق الخصم بنجاح"
        });
    } catch (err) {
        res.status(500).json({ message: "خطأ في السيرفر" });
    }
});

// نموذج تواصل معنا (يرسل رسالة من العميل إلى الدعم الفني عبر Brevo)
app.post('/api/contact', async (req, res) => {
    try {
        const { name, email, message } = req.body || {};

        if (!name || !email || !message) {
            return res.status(400).json({ message: "جميع الحقول مطلوبة" });
        }

        const payload = {
            // نضع اسم المرسل هنا ليظهر لك في صندوق الوارد، لكن الإيميل يبقى الموثق لتجنب السبام
            sender: { name: name, email: "no-reply@details-store.com" },
            
            // الوجهة هي إيميل الدعم الفني الخاص بك
            to: [{ email: "support@details-store.com" }], 
            
            // هذا هو السطر الأهم: عند الضغط على Reply، سيذهب الرد لهذا الإيميل
            replyTo: { email: email, name: name }, 
            
            subject: `استفسار جديد من: ${name}`,
            htmlContent: getEmailTemplate('رسالة تواصل جديدة', `
                <div class="info-box">
                    <p><span class="label">الاسم:</span> ${name}</p>
                    <p><span class="label">البريد الإلكتروني:</span> ${email}</p>
                </div>
                <p><strong>نص الرسالة:</strong></p>
                <p>${message.replace(/\n/g, '<br>')}</p>
            `)
        };

        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY 
            },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error("❌ خطأ من بريفو:", errorData);
            return res.status(500).json({ message: "فشل إرسال الرسالة" });
        }

        res.status(200).json({ message: "تم إرسال الرسالة بنجاح" });

    } catch (err) {
        console.error("❌ خطأ في السيرفر:", err);
        res.status(500).json({ message: "حدث خطأ غير متوقع" });
    }
});

// إنشاء طلب جديد
app.post('/api/orders', authenticateToken, async (req, res) => {
    try {
        const { products, subtotal, discountAmount, couponCode, amount, shippingAddress, payment_method } = req.body;
        
        // 1. إذا تم استخدام كوبون، نقوم بزيادة عداد استخدامه
        if (couponCode) {
            await Coupon.findOneAndUpdate(
                { code: couponCode }, 
                { $inc: { usedCount: 1 } }
            );
        }

        // 2. خصم الكميات من المخزون
        for (const item of products) {
            const product = await Product.findById(item.id);
            if (product) {
                // خصم من الكمية الكلية
                product.quantity = Math.max(0, product.quantity - item.quantity);
                
                // خصم من المقاس المحدد إذا وجد
                if (item.size && product.sizes && product.sizes.length > 0) {
                    const sizeIndex = product.sizes.findIndex(s => s.size === item.size);
                    if (sizeIndex > -1) {
                        product.sizes[sizeIndex].quantity = Math.max(0, product.sizes[sizeIndex].quantity - item.quantity);
                    }
                }
                
                // تحديث حالة "نفذت الكمية" إذا وصل الصفر
                if (product.quantity === 0) {
                    product.isSoldOut = true;
                }
                
                await product.save();
            }
        }

        // 3. إنشاء الطلب في قاعدة البيانات
        const newOrder = new Order({
            userId: req.user.id,
            products,
            subtotal,
            discountAmount,
            couponCode,
            amount, // المجموع النهائي
            shippingAddress,
            paymentMethod: payment_method
        });

        const savedOrder = await newOrder.save();
        
        // 4. إرسال الرد بنجاح العملية (أخيراً)
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

// --- روابط الإشعارات (Notifications) ---

// جلب إشعارات المستخدم الحالي
app.get('/api/notifications', authenticateToken, async (req, res) => {
    try {
        const notifications = await Notification.find({ userId: req.user.id })
            .sort({ createdAt: -1 }); // الأحدث أولاً
        res.status(200).json(notifications);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب الإشعارات" });
    }
});

// تحديد إشعار كمقروء
app.put('/api/notifications/:id/read', authenticateToken, async (req, res) => {
    try {
        await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
        res.status(200).json({ message: "تم تحديث حالة الإشعار" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في تحديث الإشعار" });
    }
});

// إرسال إشعار عام لجميع المستخدمين (للأدمن فقط)
app.post('/api/admin/notifications/broadcast', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { title, message } = req.body;
        const users = await User.find({}, '_id'); // جلب جميع معرفات المستخدمين

        const notifications = users.map(user => ({
            userId: user._id,
            title,
            message,
            type: 'promo'
        }));

        await Notification.insertMany(notifications);
        res.status(200).json({ message: `تم إرسال الإشعار إلى ${users.length} مستخدم` });
    } catch (err) {
        res.status(500).json({ message: "فشل إرسال الإشعارات" });
    }
});

// --- روابط إدارة الطلبات (Admin Orders) ---

// جلب جميع الطلبات (للأدمن فقط)
app.get('/api/admin/orders', authenticateToken, isAdmin, async (req, res) => {
    try {
        const orders = await Order.find()
            .populate('userId', 'name email')
            .sort({ createdAt: -1 });

        const formattedOrders = orders.map(order => ({
            ...order.toObject(),
            user: order.userId
        }));
        res.status(200).json(formattedOrders);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب الطلبات" });
    }
});

// تحديث حالة الطلب (مثلاً: تم الشحن، تم التوصيل)
app.put('/api/admin/orders/:id/status', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { status } = req.body; // الحالة الجديدة
        const order = await Order.findByIdAndUpdate(
            req.params.id,
            { status: status },
            { new: true }
        );

        // إنشاء إشعار للمستخدم عند تغيير حالة الطلب
        if (order) {
            const notification = new Notification({
                userId: order.userId,
                title: "تحديث حالة الطلب",
                message: `تم تغيير حالة طلبك رقم #${order._id.toString().slice(-6)} إلى: ${status}`,
                type: 'order'
            });
            await notification.save();
        }

        res.json(order);
    } catch (err) {
        res.status(500).json({ message: "فشل تحديث حالة الطلب" });
    }
});

// --- إحصائيات لوحة التحكم ---

app.get('/api/admin/stats', authenticateToken, isAdmin, async (req, res) => {
    try {
        const productsCount = await Product.countDocuments();
        const ordersCount = await Order.countDocuments();
        const usersCount = await User.countDocuments();
        
        // حساب إجمالي المبيعات باستخدام Aggregation
        const salesData = await Order.aggregate([
            { $group: { _id: null, totalSales: { $sum: "$amount" } } }
        ]);
        const totalSales = salesData.length > 0 ? salesData[0].totalSales : 0;

        res.json({
            productsCount,
            ordersCount,
            usersCount,
            totalSales
        });
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب الإحصائيات" });
    }
});

// بيانات الرسم البياني للمبيعات (آخر 7 أيام)
app.get('/api/admin/sales-chart', authenticateToken, isAdmin, async (req, res) => {
    try {
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const salesData = await Order.aggregate([
            { $match: { createdAt: { $gte: sevenDaysAgo }, status: { $ne: 'ملغي' } } },
            {
                $group: {
                    _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                    totalSales: { $sum: "$amount" },
                    count: { $sum: 1 }
                }
            },
            { $sort: { _id: 1 } }
        ]);

        res.json(salesData);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب بيانات الرسم البياني" });
    }
});

// جلب جميع المستخدمين (للأدمن)
app.get('/api/admin/users', authenticateToken, isAdmin, async (req, res) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });
        res.status(200).json(users);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب المستخدمين" });
    }
});

// حذف مستخدم (للأدمن)
app.delete('/api/admin/users/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        await User.findByIdAndDelete(req.params.id);
        res.json({ message: "تم حذف المستخدم بنجاح" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في حذف المستخدم" });
    }
});

// --- رابطة جلب المنتجات الأكثر طلباً (Most Popular Products) ---
app.get('/api/popular-products', async (req, res) => {
    try {
        const products = await Product.find({})
            .sort({ popularity: -1 }) // ترتيب تنازلي حسب الشعبية
            .limit(10) // عرض أول 10 منتجات
            .populate('category');
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب المنتجات الأكثر طلباً", error: err.message });
    }
});

// 5. تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Details Backend is running on port: ${PORT}`);
});