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
const { body, validationResult } = require('express-validator');
const { OAuth2Client } = require('google-auth-library');

const app = express();
app.set('trust proxy', 1); // ثق في البروكسي الأول (ضروري للاستضافة على Render لإصلاح خطأ Rate Limit)
const PORT = process.env.PORT || 3000;
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// قاموس الترجمة للرسائل الثابتة
const translations = {
    ar: {
        auth_required: "يرجى تسجيل الدخول أولاً",
        session_expired: "الجلسة انتهت، يرجى تسجيل الدخول مجدداً",
        user_not_found: "هذا الحساب لم يعد موجوداً",
        admin_only: "هذا الإجراء مخصص للمسؤولين فقط",
        login_error: "البريد الإلكتروني أو كلمة المرور غير صحيحة"
    },
    en: {
        auth_required: "Please login first",
        session_expired: "Session expired, please login again",
        user_not_found: "User no longer exists",
        admin_only: "This action is for admins only",
        login_error: "Invalid email or password"
    }
};

// 1. Middleware
app.use(helmet()); // إضافة ترويسات أمان HTTP لحماية التطبيق
app.use(morgan('dev')); // تسجيل الطلبات (Logging) لمراقبة النشاط وكشف الأخطاء
app.use(cors()); 
app.use(express.json({ limit: '5mb' })); // تحديد حجم البيانات المستقبلة لمنع إغراق السيرفر
app.use(express.urlencoded({ extended: true })); // دعم استقبال البيانات من النماذج التقليدية
app.use(mongoSanitize()); // تنظيف البيانات المدخلة لمنع هجمات NoSQL Injection
app.use(xss()); // تنظيف البيانات من أكواد HTML/JS الخبيثة (XSS)
app.use(hpp()); // منع تلوث المعاملات (HTTP Parameter Pollution)

// Middleware لتحديد اللغة المطلوبة من الـ Headers
app.use((req, res, next) => {
    // نأخذ اللغة من الهيدر 'accept-language' أو نستخدم 'ar' كافتراضية
    const lang = req.headers['accept-language']?.split(',')[0].split('-')[0] || 'ar';
    req.lang = (lang === 'en' || lang === 'ar') ? lang : 'ar';
    req.t = (key) => translations[req.lang][key] || key;
    next();
});

// 1. دالة لتغليف العمليات غير المتزامنة (بديلة لـ try/catch في كل راوت)
const asyncHandler = fn => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// 2. دالة لفحص وتجميع أخطاء express-validator وإرسالها للمستخدم
const validateRequest = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ 
            message: errors.array()[0].msg, 
            details: errors.array() 
        });
    }
    next();
};

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
// تطبيق الحماية على المسارات الحساسة فقط وتجنب مسار validate-token
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/register', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/verify-email', authLimiter);

// 2. الاتصال بقاعدة البيانات (MongoDB Atlas)
const dbURI = process.env.MONGODB_URI;

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
            return false;
        }
        
        return true;
    } catch (error) {
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

// قالب متغيرات المنتج (Variants)
const variantSchema = new mongoose.Schema({
    colorHex: { type: String, default: null },
    size: { type: String, default: null },
    quantity: { type: Number, required: true, default: 0 }
}, { _id: false });

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
    sizes: [String], // لعرض خيارات المقاسات في واجهة المتجر
    colors: [{
        hex: String,      // كود اللون للعرض في التطبيق
        images: [String] // قائمة صور خاصة بهذا اللون
    }],
    variants: [variantSchema] // المخزون الفعلي للمنتج
}, { timestamps: true });

// Middleware لحساب الكمية الإجمالية تلقائياً قبل الحفظ
productSchema.pre('save', function() {
    if (this.variants && this.variants.length > 0) {
        // إذا وجد متغيرات، فالكمية الإجمالية هي مجموعها حصراً
        this.quantity = this.variants.reduce((total, v) => total + (Number(v.quantity) || 0), 0);
    } else {
        // إذا لم توجد متغيرات، نعتمد على الكمية المباشرة
        this.quantity = Number(this.quantity) || 0;
    }

    // إذا كانت الكمية الإجمالية 0، نحدّث حالة "نفذت الكمية"
    this.isSoldOut = this.quantity <= 0;
});

// تحويل تلقائي للبيانات لتعيد اللغة المختارة فقط عند إرسالها للفرونت اند (اختياري)
productSchema.set('toJSON', {
    transform: function(doc, ret, options) {
        const lang = options.lang || 'ar';

        // 🌟 الحل لتجنب NoSuchMethodError في فلاتر:
        // لا نقم بتغيير الحقول الأصلية (name, description) لأن التطبيق الحالي يتوقعها كـ Map
        // بدلاً من ذلك، نضيف حقولاً جديدة تحتوي على النص المترجم جاهزاً للمستقبل
        ret.displayName = (ret.name && typeof ret.name === 'object') ? (ret.name[lang] || ret.name['ar'] || ret.name['en']) : ret.name;
        ret.displayDescription = (ret.description && typeof ret.description === 'object') ? (ret.description[lang] || ret.description['ar'] || ret.description['en']) : ret.description;

        return ret;
    }
});

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
    imageUrl: { type: String, required: true },
    allowOriginalBox: { type: Boolean, default: false } // 🌟 الحقل الجديد
}, { timestamps: true });

categorySchema.set('toJSON', {
    transform: function(doc, ret, options) {
        const lang = options.lang || 'ar';
        // نترك الحقل الأصلي كما هو ونضيفdisplayName للمساعدة في الترجمة دون كسر التطبيق
        ret.displayName = (ret.name && typeof ret.name === 'object') ? (ret.name[lang] || ret.name['ar'] || ret.name['en']) : ret.name;
        return ret;
    }
});

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
    fcmTokens: [String], // 🌟 الحقل الجديد لحفظ توكنات الإشعارات
    receiveNotifications: { type: Boolean, default: true }, // 🌟 حقل جديد لإعدادات الإشعارات
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
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // إزالة required لدعم الزوار
    isGuest: { type: Boolean, default: false }, // حقل لتمييز طلبات الزوار
    products: [{
        id: String,
        title: String,
        quantity: Number,
        price: Number,
        imageUrl: String,
        size: String,
        color: String,
        withBox: { type: Boolean, default: false }, // لدعم خيار تغليف الهدايا
        withOriginalBox: { type: Boolean, default: false } // 🌟 علبة أصلية (10 شيكل)
    }],
    subtotal: { type: Number, required: true }, // المجموع قبل الخصم
    discountAmount: { type: Number, default: 0 }, // قيمة الخصم
    couponCode: { type: String }, // الكود المستخدم (اختياري)
    deliveryFee: { type: Number, default: 0 }, // رسوم التوصيل
    amount: { type: Number, required: true }, // المجموع النهائي (تم التعديل ليتطابق مع الفرونت اند)
    shippingAddress: {
        name: String, // إضافة حقل الاسم لاستقبال اسم الزائر
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
    },
    notes: { type: String, default: "" },
    withGiftBox: { type: Boolean, default: false } // 🌟 إضافة الحقل الجديد في المخطط
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

// قالب العناوين (Addresses)
const addressSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true }, // اسم المستلم
    phone: { type: String, required: true },
    city: { type: String, required: true },
    street: { type: String, required: true },
    building: String, // رقم المبنى/الفيلا
    floor: String,    // رقم الطابق
    apartment: String, // رقم الشقة
    notes: String,    // ملاحظات إضافية
    isDefault: { type: Boolean, default: false }, // هل هو العنوان الافتراضي؟
    latitude: Number, // إحداثيات الخريطة
    longitude: Number,
}, { timestamps: true });

const Address = mongoose.model('Address', addressSchema);

// --- Middleware للحماية (Authentication & Authorization) ---

const authenticateToken = async (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: req.t('auth_required') });

    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
        // تم تعديل 403 إلى 401 ليقوم تطبيق فلاتر بتسجيل الخروج التلقائي فوراً
        if (err) return res.status(401).json({ message: req.t('session_expired') });
        
        try {
            // فحص إضافي: هل المستخدم ما زال موجوداً في الداتا بيس؟
            const userExists = await User.findById(decoded.id);
            if (!userExists) {
                return res.status(401).json({ message: req.t('user_not_found') });
            }

            req.user = decoded;
            next();
        } catch (dbErr) {
            console.error("Auth DB Error:", dbErr);
            return res.status(500).json({ message: "خطأ في السيرفر أثناء التحقق من المستخدم" });
        }
    });
};

const isAdmin = (req, res, next) => {
    if (req.user && req.user.isAdmin) {
        next();
    } else {
        res.status(403).json({ message: req.t('admin_only') });
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
                data: products.map(p => Product.hydrate(p).toJSON({ lang: req.lang })),
                hasMore: products.length === parseInt(limit) 
            });
        } else {
            res.status(200).json(products.map(p => Product.hydrate(p).toJSON({ lang: req.lang })));
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

// إضافة منتج جديد (للأدمن)
app.post('/api/products', authenticateToken, isAdmin, async (req, res) => {
    try {
        // ملاحظة: يفترض أن الفرونت اند يرسل category ID صحيح
        const newProduct = new Product(req.body);
        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (err) {
        console.error("❌ Add Product Error:", err);
        res.status(400).json({ message: "فشل إضافة المنتج", error: err.message });
    }
});

// تعديل منتج (مهم للوحة التحكم)
app.put('/api/products/:id', authenticateToken, isAdmin, async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) {
            return res.status(404).json({ message: "المنتج غير موجود" });
        }

        // تنظيف البيانات القادمة لمنع محاولة تعديل الـ ID
        const updateData = { ...req.body };
        delete updateData._id;
        delete updateData.__v;
        delete updateData.createdAt;
        delete updateData.updatedAt;

        // التعامل مع الحقول التي قد تكون null وتسبب مشاكل في الأنواع الرقمية
        if (updateData.oldPrice === null) {
            updateData.oldPrice = undefined;
        }

        // التحقق من صحة معرف التصنيف (Category) قبل الحفظ
        if (updateData.category) {
            if (typeof updateData.category === 'object' && updateData.category._id) {
                updateData.category = updateData.category._id;
            }
            
            // التأكد أن الـ ID المرسل هو ObjectId صحيح لتجنب خطأ CastError
            if (!mongoose.Types.ObjectId.isValid(updateData.category)) {
                return res.status(400).json({ message: "معرف التصنيف (Category ID) غير صحيح" });
            }
        }

        // استخدام set() بدلاً من Object.assign لضمان تتبع التغييرات بشكل صحيح في Mongoose
        product.set(updateData);

        await product.save(); // هنا سيتم تفعيل الـ pre('save') hook

        // 🌟 الحل هنا: إعادة جلب المنتج مع عمل populate للكاتيجوري ليتوافق مع الفرونت اند
        const finalProduct = await Product.findById(product._id).populate('category');
        
        res.json(finalProduct);
    } catch (err) {
        console.error("❌ Update Product Error:", err);
        // إرسال تفاصيل الخطأ بدقة لنعرف أي حقل هو السبب (مثل الاسم أو السعر)
        res.status(400).json({ 
            message: "فشل التحديث: البيانات المرسلة غير صالحة", 
            error: err.message,
            validationErrors: err.errors 
        });
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
        // 🌟 التحسين هنا: كشف خطأ الاسم المكرر وإرسال رسالة واضحة
        if (err.code === 11000) {
            return res.status(400).json({ message: "فشل إضافة التصنيف: الاسم أو الرابط (slug) موجود مسبقاً." });
        }
        res.status(400).json({ message: "فشل إضافة التصنيف", error: err.message });
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
app.post('/api/auth/register', [
    body('name').trim().notEmpty().withMessage('الاسم مطلوب'),
    body('email').isEmail().withMessage('البريد الإلكتروني غير صحيح'),
    body('password').isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
    validateRequest
], asyncHandler(async (req, res) => {
    const { name, email, password, phone } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) {
        return res.status(400).json({ message: "البريد الإلكتروني مسجل مسبقاً" });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedOtp = crypto.createHash('sha256').update(otp).digest('hex');
    const otpExpires = Date.now() + 10 * 60 * 1000; 
    
    const hashedPassword = await bcrypt.hash(password, 10);
    
    await PendingUser.findOneAndUpdate(
        { email },
        { name, email, password: hashedPassword, phone, otp: hashedOtp, otpExpires },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

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
}));

// تفعيل الحساب باستخدام OTP
app.post('/api/auth/verify-email', [
    body('email').isEmail().withMessage('البريد الإلكتروني غير صحيح'),
    body('otp').notEmpty().withMessage('رمز التحقق مطلوب'),
    validateRequest
], asyncHandler(async (req, res) => {
    const { email, otp } = req.body;

    const hashedOtp = crypto.createHash('sha256').update(otp.toString()).digest('hex');

    const pendingUser = await PendingUser.findOne({
        email,
        otp: hashedOtp,
        otpExpires: { $gt: Date.now() } 
    });

    if (!pendingUser) {
        return res.status(400).json({ message: "رمز التحقق غير صحيح أو منتهي الصلاحية" });
    }

    const newUser = new User({
        name: pendingUser.name,
        email: pendingUser.email,
        password: pendingUser.password,
        phone: pendingUser.phone,
        isVerified: true,
        isAdmin: false,
        fcmTokens: req.body.fcmToken ? [req.body.fcmToken] : []
    });
    await newUser.save();
    await PendingUser.deleteOne({ email });

    if (newUser.phone) {
        await Order.updateMany(
            { "shippingAddress.phone": newUser.phone, userId: null },
            { userId: newUser._id }
        );
    }

    const expiresIn = newUser.isAdmin ? '7d' : '30d';
    const token = jwt.sign({ id: newUser._id, email: newUser.email, isAdmin: newUser.isAdmin }, process.env.JWT_SECRET, { expiresIn });

    res.status(200).json({ 
        message: "تم تفعيل الحساب بنجاح",
        token,
        user: { id: newUser._id, name: newUser.name, email: newUser.email, isAdmin: newUser.isAdmin }
    });
}));

// تسجيل الدخول
app.post('/api/auth/login', [
    body('email').isEmail().withMessage('البريد الإلكتروني غير صحيح'),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة'),
    validateRequest
], asyncHandler(async (req, res) => {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

    if (!user.isVerified) {
        return res.status(400).json({ message: "يرجى تفعيل الحساب أولاً عبر الرمز المرسل لبريدك الإلكتروني" });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ message: "البريد الإلكتروني أو كلمة المرور غير صحيحة" });

    if (req.body.fcmToken && !user.fcmTokens.includes(req.body.fcmToken)) {
        user.fcmTokens.push(req.body.fcmToken);
        await user.save();
    }

    if (user.phone) {
        await Order.updateMany(
            { "shippingAddress.phone": user.phone, userId: null },
            { userId: user._id }
        );
    }

    const expiresIn = user.isAdmin ? '7d' : '30d';
    const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn });

    res.json({ token, user });
}));

// طلب إعادة تعيين كلمة المرور (نسيت كلمة السر)
app.post('/api/auth/forgot-password', [
    body('email').isEmail().withMessage('البريد الإلكتروني غير صحيح'),
    validateRequest
], asyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    if (!user) {
        return res.status(200).json({ message: "إذا كان بريدك الإلكتروني مسجلاً لدينا، فستصلك رسالة لإعادة تعيين كلمة المرور." });
    }

    const resetToken = crypto.randomBytes(32).toString('hex');
    user.passwordResetToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    user.passwordResetExpires = Date.now() + 10 * 60 * 1000;
    await user.save();

    const resetURL = `https://details-store.com/reset-password/${resetToken}`; 
    
    const emailContent = `
        <p>لقد طلبت إعادة تعيين كلمة المرور الخاصة بك.</p>
        <p>اضغط على الرابط التالي لإعادة تعيينها. هذا الرابط صالح لمدة 10 دقائق فقط.</p>
        <div style="text-align: center; margin: 20px 0;">
            <a href="${resetURL}" style="background-color: #000; color: #fff; padding: 12px 25px; text-decoration: none; border-radius: 5px; font-weight: bold;">إعادة تعيين كلمة المرور</a>
        </div>
    `;

    await sendEmailViaBrevo({
        to: user.email,
        subject: 'إعادة تعيين كلمة المرور - Details Store',
        htmlContent: getEmailTemplate('إعادة تعيين كلمة المرور', emailContent)
    });

    res.status(200).json({ message: "إذا كان بريدك الإلكتروني مسجلاً لدينا، فستصلك رسالة لإعادة تعيين كلمة المرور." });
}));

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
        const expiresIn = user.isAdmin ? '7d' : '30d';
        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn });

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

        if (req.body.fcmToken && !user.fcmTokens.includes(req.body.fcmToken)) {
            user.fcmTokens.push(req.body.fcmToken);
            await user.save();
        }

        // 🌟 مزامنة طلبات الزوار عند الدخول عبر جوجل
        if (user.phone) {
            await Order.updateMany(
                { "shippingAddress.phone": user.phone, userId: null },
                { userId: user._id }
            );
        }

        // إنشاء التوكن الخاص بنا
        const expiresIn = user.isAdmin ? '7d' : '30d';
        const token = jwt.sign(
            { id: user._id, email: user.email, isAdmin: user.isAdmin }, 
            process.env.JWT_SECRET, 
            { expiresIn }
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

// --- روابط العناوين (Addresses) ---
app.get('/api/addresses', authenticateToken, async (req, res) => {
    try {
        const addresses = await Address.find({ userId: req.user.id }).sort({ isDefault: -1, createdAt: -1 });
        res.status(200).json(addresses);
    } catch (err) {
        console.error("❌ Fetch Addresses Error:", err);
        res.status(500).json({ message: "فشل في جلب العناوين" });
    }
});

app.post('/api/addresses', authenticateToken, async (req, res) => {
    try {
        const { name, phone, city, street } = req.body;

        // 1. تحقق يدوي سريع للحقول الأساسية لإعطاء رسالة واضحة
        if (!name || !phone || !city || !street) {
            return res.status(400).json({ 
                message: "يرجى ملء جميع الحقول المطلوبة: الاسم، الهاتف، المدينة، والشارع" 
            });
        }

        // 2. تجهيز البيانات والتأكد من ربطها بالمستخدم الصحيح
        const addressData = { ...req.body };
        delete addressData._id; // منع إرسال ID يدوي من الفرونت اند
        addressData.userId = req.user.id;

        const newAddress = new Address(addressData);

        // إذا كان هذا هو العنوان الأول أو تم تعيينه كافتراضي، اجعله الافتراضي الوحيد
        if (newAddress.isDefault) {
            await Address.updateMany({ userId: req.user.id }, { isDefault: false });
        }

        const savedAddress = await newAddress.save();
        res.status(201).json(savedAddress);
    } catch (err) {
        console.error("❌ Add Address Error:", err);
        res.status(400).json({ 
            message: "فشل في إضافة العنوان: تأكد من صحة البيانات المرسلة", 
            error: err.message,
            details: err.errors // هذا سيظهر لك بالضبط أي حقل فيه المشكلة
        });
    }
});

app.put('/api/addresses/:id', authenticateToken, async (req, res) => {
    try {
        const addressId = req.params.id;
        const updateData = { ...req.body };
        delete updateData._id; // منع تحديث الـ ID

        // إذا تم تعيينه كافتراضي، اجعله الافتراضي الوحيد
        if (updateData.isDefault) {
            await Address.updateMany({ userId: req.user.id }, { isDefault: false });
        }

        const updatedAddress = await Address.findOneAndUpdate(
            { _id: addressId, userId: req.user.id },
            updateData,
            { new: true, runValidators: true }
        );

        if (!updatedAddress) {
            return res.status(404).json({ message: "العنوان غير موجود أو لا تملك صلاحية تعديله" });
        }
        res.status(200).json(updatedAddress);
    } catch (err) {
        console.error("❌ Update Address Error:", err);
        res.status(400).json({ message: "فشل في تحديث العنوان", error: err.message });
    }
});

app.delete('/api/addresses/:id', authenticateToken, async (req, res) => {
    try {
        const deletedAddress = await Address.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        if (!deletedAddress) {
            return res.status(404).json({ message: "العنوان غير موجود أو لا تملك صلاحية حذفه" });
        }
        res.status(200).json({ message: "تم حذف العنوان بنجاح" });
    } catch (err) {
        console.error("❌ Delete Address Error:", err);
        res.status(500).json({ message: "فشل في حذف العنوان" });
    }
});

// التحقق من صحة التوكن (للدخول التلقائي)
app.get('/api/auth/validate-token', authenticateToken, async (req, res) => {
    try {
        const user = await User.findById(req.user.id).select('-password');
        if (!user) return res.status(404).json({ message: "المستخدم غير موجود" });
        
        res.json({ 
            valid: true, 
            user: { 
                id: user._id, 
                name: user.name, 
                email: user.email, 
                isAdmin: user.isAdmin,
                avatar: user.avatar,
                phone: user.phone,
                receiveNotifications: user.receiveNotifications,
                createdAt: user.createdAt
            } 
        });
    } catch (err) {
        res.status(500).json({ message: "خطأ في التحقق" });
    }
});

// تحديث الملف الشخصي للمستخدم
app.put('/api/profile', authenticateToken, async (req, res) => {
    try {
        const { name, phone, email, avatar, password, receiveNotifications } = req.body;
        const updateData = { name, phone, avatar, receiveNotifications };

        if (email && email !== req.user.email) { // إذا كان الإيميل مختلفاً، تحقق منه
            const existingUser = await User.findOne({ email });
            if (existingUser && existingUser._id.toString() !== req.user.id) {
                return res.status(400).json({ message: "البريد الإلكتروني مسجل مسبقاً لمستخدم آخر" });
            }
            updateData.email = email;
        }

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

// حذف الحساب
app.delete('/api/profile', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;

        // 1. حذف المستخدم نفسه
        await User.findByIdAndDelete(userId);
        // 2. حذف جميع الطلبات المرتبطة بالمستخدم
        await Order.deleteMany({ userId: userId });
        // 3. حذف جميع الإشعارات المرتبطة بالمستخدم
        await Notification.deleteMany({ userId: userId });
        // 4. حذف قائمة المفضلة للمستخدم
        await Wishlist.deleteOne({ userId: userId });
        // 5. حذف العناوين المرتبطة
        await Address.deleteMany({ userId: userId });

        res.status(200).json({ message: "تم حذف الحساب وجميع البيانات المرتبطة بنجاح" });
    } catch (err) {
        console.error("❌ Delete Account Error:", err);
        res.status(500).json({ message: "فشل في حذف الحساب" });
    }
});

// إحصائيات المستخدم (طلبات، مفضلة)
app.get('/api/profile/stats', authenticateToken, async (req, res) => {
    try {
        const userId = req.user.id;
        const ordersCount = await Order.countDocuments({ userId: userId });
        
        const wishlist = await Wishlist.findOne({ userId });
        const wishlistCount = wishlist ? wishlist.products.length : 0;

        res.status(200).json({
            ordersCount: ordersCount,
            wishlistCount: wishlistCount
        });
    } catch (err) {
        console.error("❌ User Stats Error:", err);
        res.status(500).json({ message: "فشل في جلب إحصائيات المستخدم" });
    }
});

// --- روابط الطلبات (Orders) ---

// رابط فحص المخزون قبل الانتقال للدفع (Validation)
app.post('/api/cart/validate-inventory', async (req, res) => {
    try {
        const { items } = req.body; // مصفوفة تحتوي على {productId, size, color, requestedQuantity, cartKey}
        const updates = [];

        for (const item of items) {
            const product = await Product.findById(item.productId);
            if (!product) {
                updates.push({ cartKey: item.cartKey, currentStock: 0 });
                continue;
            }

            let availableQty = 0;
            if (product.variants && product.variants.length > 0) {
                const variant = product.variants.find(v => 
                    (v.size === item.size || (!v.size && !item.size)) && 
                    (v.colorHex === item.color || (!v.colorHex && !item.color))
                );
                availableQty = variant ? variant.quantity : 0;
            } else {
                availableQty = product.quantity;
            }

            if (availableQty < item.requestedQuantity) {
                updates.push({
                    cartKey: item.cartKey,
                    currentStock: availableQty
                });
            }
        }

        res.status(200).json({ updates });
    } catch (err) {
        res.status(500).json({ message: "خطأ في فحص المخزون" });
    }
});

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

// إنشاء طلب جديد (معدل باحترافية لتجنب أخطاء المخزون باستخدام Transactions)
app.post('/api/orders', async (req, res) => {
    // 1. بدء Session لضمان أن كل العمليات تتم بنجاح أو تُلغى بالكامل
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        // محاولة التعرف على المستخدم إذا كان التوكن موجوداً (اختياري)
        let userId = null;
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                userId = decoded.id;
            } catch (err) {
                // إذا كان التوكن خاطئاً، نكمل كزائر ولا نوقف العملية
            }
        }

        const { products: incomingProducts, couponCode, deliveryFee, shippingAddress, payment_method, name, isGuest, notes, withGiftBox } = req.body; // استقبل withOriginalBox و notes و withGiftBox

        let calculatedSubtotal = 0;
        let calculatedAdditionalFees = 0; // 🌟 تغيير الاسم ليكون أشمل
        const finalProducts = [];

        // 🌟 تأكد من وجود اسم المستلم داخل كائن العنوان (مفيد جداً لطلبات الزوار)
        if (shippingAddress && name && !shippingAddress.name) {
            shippingAddress.name = name;
        }

        // 2. معالجة الكوبون (التحقق الأولي)
        let couponDoc = null;
        let finalDiscount = 0;
        if (couponCode) {
            couponDoc = await Coupon.findOne({ code: couponCode.toUpperCase(), isActive: true }).session(session);
            if (couponDoc && (new Date() > couponDoc.expirationDate || couponDoc.usedCount >= couponDoc.usageLimit)) {
                couponDoc = null; // الكوبون غير صالح حالياً
            }
        }

        // 3. خصم الكميات من المخزون بطريقة آمنة
        for (const item of incomingProducts) {
            // جلب المنتج مع الكاتيجوري لمعرفة ما إذا كان مسموحاً بالعلبة الأصلية
            const product = await Product.findById(item.id).populate('category').session(session);
            
            if (!product) {
                throw new Error(`المنتج ${item.title} غير موجود.`);
            }

            // 🌟 حساب الرسوم الإضافية بأمان في السيرفر (5 شيكل للتغليف، 10 شيكل للعلبة الأصلية)
            let itemAdditionalFees = 0;
            
            // 1. رسوم تغليف الهدايا (5 شيكل)
            if (item.withBox === true) {
                itemAdditionalFees += 5;
            }

            // 2. رسوم العلبة الأصلية (10 شيكل) - نتحقق أن القسم يسمح بذلك
            const categoryAllowsOriginalBox = product.category && product.category.allowOriginalBox === true;
            if (item.withOriginalBox === true && categoryAllowsOriginalBox) {
                itemAdditionalFees += 10;
            } else if (item.withOriginalBox === true && !categoryAllowsOriginalBox) {
                // إذا حاول العميل طلب علبة أصلية لمنتج لا يدعمها، نعدل القيمة لتجنب المشاكل في لوحة التحكم
                console.warn(`Client tried to order original box for product ${item.id} in category ${product.category?.name?.ar} which does not allow it.`);
                item.withOriginalBox = false; 
            }

            calculatedSubtotal += product.price * item.quantity;
            calculatedAdditionalFees += itemAdditionalFees * item.quantity;

            // بناء كائن المنتج النهائي للطلب بالأسعار الموثوقة من السيرفر
            finalProducts.push({
                id: product._id,
                title: product.name.ar,
                quantity: item.quantity,
                price: product.price + itemAdditionalFees, // السعر النهائي المخزن يشمل الرسوم
                imageUrl: product.imageUrl,
                size: item.size,
                color: item.color,
                withBox: item.withBox,
                withOriginalBox: item.withOriginalBox // حفظ الحالة للوحة الإدارة
            });

            // خصم من المخزون الفعلي (Variants)
            if (product.variants && product.variants.length > 0) {
                const variantIndex = product.variants.findIndex(v => 
                    (v.size === item.size || (!v.size && !item.size)) && 
                    (v.colorHex === item.color || (!v.colorHex && !item.color))
                );
                
                if (variantIndex > -1) {
                    if (product.variants[variantIndex].quantity < item.quantity) {
                         throw new Error(`الكمية المطلوبة من ${item.title} غير متوفرة.`);
                    }
                    product.variants[variantIndex].quantity -= item.quantity;
                }
            } else {
                // التوافق مع المنتجات القديمة
                if (product.quantity < item.quantity) {
                    throw new Error(`الكمية المطلوبة من ${item.title} غير متوفرة.`);
                }
                product.quantity -= item.quantity;
            }
            
            await product.save({ session }); // سيقوم الـ pre-save بحساب الكمية الإجمالية وتحديث isSoldOut
        }

        // 4. حساب الخصم النهائي بعد التأكد من المجموع
        if (couponDoc) {
            if (couponDoc.discountType === 'percentage') {
                finalDiscount = (calculatedSubtotal * (couponDoc.value / 100));
            } else {
                finalDiscount = Math.min(couponDoc.value, calculatedSubtotal); // لا يمكن أن يكون الخصم أكبر من المجموع
            }
            
            // تحديث عداد استخدام الكوبون
            couponDoc.usedCount += 1;
            await couponDoc.save({ session });
        }

        const finalAmount = (calculatedSubtotal + calculatedAdditionalFees + (Number(deliveryFee) || 0)) - finalDiscount;

        // 5. إنشاء الطلب في قاعدة البيانات
        const newOrder = new Order({
            userId: userId, // سيأخذ القيمة أو يبقى null إذا كان زائراً
            isGuest: isGuest || (userId ? false : true), // تحديد حالة الزائر تلقائياً
            products: finalProducts,
            subtotal: calculatedSubtotal + calculatedAdditionalFees,
            discountAmount: finalDiscount,
            couponCode,
            deliveryFee,
            amount: finalAmount, 
            shippingAddress,
            paymentMethod: payment_method || 'cod',
            notes: notes || "",
            withGiftBox: withGiftBox || false // حفظ حالة تغليف الهدايا للطلب
        });

        const savedOrder = await newOrder.save({ session });
        
        // 5. تأكيد كل التعديلات وحفظها بشكل نهائي في قاعدة البيانات
        await session.commitTransaction();
        session.endSession();

        res.status(201).json(savedOrder);
        
    } catch (err) {
        // في حال حدوث أي خطأ (مثلاً منتج نفذت كميته)، سيتم التراجع عن كل شيء أوتوماتيكياً!
        await session.abortTransaction();
        session.endSession();
        res.status(400).json({ message: err.message || "خطأ في إنشاء الطلب", error: err.toString() });
    }
});

// حذف إشعار معين
app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
    try {
        await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        res.status(200).json({ message: "تم حذف الإشعار بنجاح" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في حذف الإشعار" });
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

// جلب طلبات الزوار بناءً على قائمة معرفات (IDs) مخزنة محلياً في التطبيق
app.get('/api/orders/guest', async (req, res) => {
    try {
        const { ids } = req.query;
        if (!ids) return res.json([]);

        // تحويل النص القادم (ID1,ID2) إلى مصفوفة وفلترة المعرفات غير الصحيحة
        const orderIds = ids.split(',').map(id => id.trim()).filter(id => mongoose.Types.ObjectId.isValid(id));
        const orders = await Order.find({ _id: { $in: orderIds } }).sort({ createdAt: -1 });

        res.status(200).json(orders);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب بيانات طلبات الزوار" });
    }
});

// السماح للمستخدم بإلغاء طلبه (إذا كان لا يزال قيد التجهيز)
app.patch('/api/orders/:id/status', async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();
    try {
        const { status } = req.body;
        if (status !== 'ملغي') {
            return res.status(400).json({ message: "غير مسموح للمستخدم بتغيير الحالة لغير الإلغاء" });
        }

        // محاولة التعرف على المستخدم إذا كان التوكن موجوداً (اختياري)
        let requesterId = null;
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];
        if (token) {
            try {
                const decoded = jwt.verify(token, process.env.JWT_SECRET);
                requesterId = decoded.id;
            } catch (err) {}
        }

        const order = await Order.findById(req.params.id).session(session);
        
        if (!order) throw new Error("الطلب غير موجود");

        // التحقق من الملكية: إذا كان الطلب مربوطاً بحساب، نمنع الإلغاء إلا لصاحب الحساب
        if (order.userId && (!requesterId || order.userId.toString() !== requesterId)) {
            return res.status(403).json({ message: "غير مسموح لك بإلغاء هذا الطلب" });
        }

        if (order.status === 'ملغي') throw new Error("الطلب ملغي بالفعل");
        if (order.status !== 'قيد التجهيز') throw new Error("لا يمكن إلغاء الطلب بعد شحنه أو توصيله");

        // 🌟 إرجاع الكميات للمخزون
        for (const item of order.products) {
            const product = await Product.findById(item.id).session(session);
            if (product) {
                if (product.variants && product.variants.length > 0) {
                    const vIdx = product.variants.findIndex(v => 
                        (v.size === item.size || (!v.size && !item.size)) && 
                        (v.colorHex === item.color || (!v.colorHex && !item.color))
                    );
                    if (vIdx > -1) product.variants[vIdx].quantity += item.quantity;
                } else {
                    product.quantity += item.quantity;
                }
                await product.save({ session });
            }
        }

        order.status = 'ملغي';
        await order.save({ session });

        await session.commitTransaction();
        res.json({ message: "تم إلغاء الطلب بنجاح وإعادة المنتجات للمخزون", order });
    } catch (err) {
        await session.abortTransaction();
        res.status(400).json({ message: err.message });
    } finally {
        session.endSession();
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

// حذف إشعار معين
app.delete('/api/notifications/:id', authenticateToken, async (req, res) => {
    try {
        await Notification.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
        res.status(200).json({ message: "تم حذف الإشعار بنجاح" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في حذف الإشعار" });
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
// دعم كل من PUT و PATCH لضمان التوافق التام مع تطبيق فلاتر
app.route('/api/admin/orders/:id/status').all(authenticateToken, isAdmin).put(async (req, res) => {
    try {
        const { status } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: "الطلب غير موجود" });

        // 🌟 إذا تم تغيير الحالة إلى "ملغي" ولم يكن ملغياً من قبل، نرجع المخزون
        if (status === 'ملغي' && order.status !== 'ملغي') {
            for (const item of order.products) {
                const product = await Product.findById(item.id);
                if (product) {
                    if (product.variants && product.variants.length > 0) {
                        const vIdx = product.variants.findIndex(v => 
                            (v.size === item.size || (!v.size && !item.size)) && 
                            (v.colorHex === item.color || (!v.colorHex && !item.color))
                        );
                        if (vIdx > -1) product.variants[vIdx].quantity += item.quantity;
                    } else {
                        product.quantity += item.quantity;
                    }
                    await product.save();
                }
            }
        }

        order.status = status;
        await order.save();

        // جلب بيانات المستخدم للتأكد من رغبته في استلام الإشعارات
        const user = await User.findById(order.userId);
        if (user && user.receiveNotifications !== false) {
            // إنشاء إشعار فقط إذا كان هناك مستخدم مربوط بالطلب
            if (order.userId) {
                const notification = new Notification({
                    userId: order.userId,
                    title: "تحديث حالة الطلب",
                    message: `تم تغيير حالة طلبك رقم #${order._id.toString().slice(-6)} إلى: ${status}`,
                    type: 'order'
                });
                await notification.save();
            }
        }

        res.json(order);
    } catch (err) {
        res.status(500).json({ message: "فشل تحديث حالة الطلب" });
    }
}).patch(async (req, res) => {
    // نستخدم نفس المنطق في PATCH أيضاً
    try {
        const { status } = req.body;
        const order = await Order.findById(req.params.id);
        if (!order) return res.status(404).json({ message: "الطلب غير موجود" });

        if (status === 'ملغي' && order.status !== 'ملغي') {
            for (const item of order.products) {
                const product = await Product.findById(item.id);
                if (product) {
                    if (product.variants && product.variants.length > 0) {
                        const vIdx = product.variants.findIndex(v => 
                            (v.size === item.size || (!v.size && !item.size)) && 
                            (v.colorHex === item.color || (!v.colorHex && !item.color))
                        );
                        if (vIdx > -1) product.variants[vIdx].quantity += item.quantity;
                    } else {
                        product.quantity += item.quantity;
                    }
                    await product.save();
                }
            }
        }

        order.status = status;
        await order.save();

        const user = await User.findById(order.userId);
        if (user && user.receiveNotifications !== false) {
            if (order.userId) {
                const notification = new Notification({
                    userId: order.userId,
                    title: "تحديث حالة الطلب",
                    message: `تم تغيير حالة طلبك رقم #${order._id.toString().slice(-6)} إلى: ${status}`,
                    type: 'order'
                });
                await notification.save();
            }
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
        const ordersCount = await Order.countDocuments({ status: { $ne: 'ملغي' } });
        const usersCount = await User.countDocuments();
        
        // حساب إجمالي المبيعات باستخدام Aggregation مع استثناء الطلبات الملغية
        const salesData = await Order.aggregate([
            { $match: { status: { $ne: 'ملغي' } } },
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

// --- Middleware مركزي لمعالجة الأخطاء (Global Error Handler) ---
app.use((err, req, res, next) => {
    console.error("❌ Global Error Handler:", err);
    const statusCode = err.statusCode || 500;
    res.status(statusCode).json({
        message: err.message || "حدث خطأ غير متوقع في السيرفر",
        error: process.env.NODE_ENV === 'development' ? err.stack : {}
    });
});

// 5. تشغيل السيرفر
mongoose.connect(dbURI, {
    family: 4 // 💡 إجبار Node.js على استخدام IPv4 لحل مشكلة الاتصال في منصة Render
}) 
    .then(() => {
        console.log('✅ Connected to Details Store Database');
        app.listen(PORT, () => {
            console.log(`🚀 Details Backend is running on port: ${PORT}`);
        });
    })
    .catch((err) => { // 🌟 الحماية من فشل الاتصال
        console.error('❌ Failed to connect to Database:', err.message);
        process.exit(1);
    });