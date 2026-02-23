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
app.set('trust proxy', 1); // ثق في البروكسي الأول (ضروري للاستضافة على Render لإصلاح خطأ Rate Limit)
const PORT = process.env.PORT || 3000;

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
        body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; background-color: #f4f4f4; margin: 0; padding: 0; line-height: 1.6; }
        .email-container { max-width: 600px; margin: 20px auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .header { background-color: #000000; color: #ffffff; padding: 30px 20px; text-align: center; }
        .header h1 { margin: 0; font-size: 28px; letter-spacing: 2px; text-transform: uppercase; }
        .content { padding: 40px 30px; color: #333333; text-align: right; }
        .content h2 { color: #000000; margin-top: 0; border-bottom: 2px solid #f4f4f4; padding-bottom: 10px; margin-bottom: 20px; font-size: 20px; }
        .footer { background-color: #f8f9fa; padding: 20px; text-align: center; font-size: 12px; color: #888888; border-top: 1px solid #eeeeee; }
        .info-box { background-color: #f8f9fa; border: 1px solid #e9ecef; border-radius: 4px; padding: 15px; margin: 20px 0; }
        .label { font-weight: bold; color: #555; }
        a { color: #000; text-decoration: underline; }
    </style>
</head>
<body>
    <div class="email-container">
        <div class="header">
            <h1>DETAILS STORE</h1>
        </div>
        <div class="content">
            <h2>${title}</h2>
            ${content}
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} Details Store. جميع الحقوق محفوظة.</p>
            <p>تواصل معنا: <a href="mailto:support@details-store.com">support@details-store.com</a></p>
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
    password: { type: String, required: true },
    phone: String,
    isAdmin: { type: Boolean, default: false }
}, { timestamps: true });

const User = mongoose.model('User', userSchema);

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

// قالب المشتركين في النشرة البريدية (Subscribers)
const subscriberSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true, trim: true }
}, { timestamps: true });

const Subscriber = mongoose.model('Subscriber', subscriberSchema);

// قالب الطلبات (Orders)
const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    products: [{
        id: String,
        title: String,
        quantity: Number,
        price: Number,
        imageUrl: String,
        size: String
    }],//
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

// --- Middleware للحماية (Authentication & Authorization) ---

const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) return res.status(401).json({ message: "يرجى تسجيل الدخول أولاً" });

    jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
        if (err) {
            console.error("JWT Verification Error:", err.message);
            return res.status(403).json({ message: "الجلسة انتهت، يرجى إعادة تسجيل الدخول" });
        }
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


// جلب الكل (مع دعم البحث والتصنيف)
app.get('/api/products', async (req, res) => {
    try {
        const { category, search, minPrice, maxPrice, sort } = req.query;
        let query = {};

        // 1. تصفية حسب التصنيف
        if (category) {
            const categoryDoc = await Category.findOne({ slug: category });
            if (!categoryDoc) return res.status(200).json([]);
            query.category = categoryDoc._id;
        }

        // 2. تصفية حسب البحث (بالاسم العربي أو الإنجليزي)
        if (search) {
            query.$or = [
                { 'name.ar': { $regex: search, $options: 'i' } },
                { 'name.en': { $regex: search, $options: 'i' } }
            ];
        }

        // 3. تصفية حسب السعر (الجديد)
        if (minPrice || maxPrice) {
            query.price = {};
            if (minPrice) query.price.$gte = Number(minPrice);
            if (maxPrice) query.price.$lte = Number(maxPrice);
        }

        // بناء الاستعلام
        let productsQuery = Product.find(query);

        // 4. الترتيب (الجديد)
        if (sort) {
            switch (sort) {
                case 'price_asc': // من الأقل للأعلى
                    productsQuery = productsQuery.sort({ price: 1 });
                    break;
                case 'price_desc': // من الأعلى للأقل
                    productsQuery = productsQuery.sort({ price: -1 });
                    break;
                case 'newest': // الأحدث
                default:
                    productsQuery = productsQuery.sort({ createdAt: -1 });
            }
        } else {
            productsQuery = productsQuery.sort({ createdAt: -1 });
        }

        const products = await productsQuery.populate('category');
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
            const categoryInput = category.trim();

            // أ) التحقق مما إذا كان ID صالح وموجود مسبقاً
            if (mongoose.Types.ObjectId.isValid(categoryInput)) {
                const exists = await Category.exists({ _id: categoryInput });
                if (exists) categoryId = categoryInput;
            }

            // ب) إذا لم يكن ID، نعامله كاسم/Slug وننشئه تلقائياً إذا لم يوجد
            if (!categoryId) {
                const slug = categoryInput.toLowerCase().replace(/\s+/g, '-');
                
                // البحث عن التصنيف بالاسم أو الـ Slug لتجنب التكرار
                let existingCategory = await Category.findOne({
                    $or: [
                        { slug: slug },
                        { 'name.ar': categoryInput },
                        { 'name.en': { $regex: new RegExp(`^${categoryInput}$`, 'i') } }
                    ]
                });
                
                if (existingCategory) {
                    categoryId = existingCategory._id;
                } else {
                    // إنشاء تصنيف جديد تلقائياً
                    const newCategory = new Category({
                        name: { ar: categoryInput, en: categoryInput }, // نستخدم نفس الاسم للغتين مؤقتاً
                        slug: slug,
                        imageUrl: `https://placehold.co/600x400?text=${encodeURIComponent(categoryInput)}`
                    });
                    const savedCategory = await newCategory.save();
                    categoryId = savedCategory._id;
                }
            }
        }

        // تحقق أمان إضافي: التأكد من وجود ID للتصنيف قبل الحفظ
        if (!categoryId) {
            return res.status(400).json({ message: "التصنيف مطلوب (Category is required)" });
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

        const token = jwt.sign({ id: user._id, email: user.email, isAdmin: user.isAdmin }, process.env.JWT_SECRET, { expiresIn: '7d' });

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

// --- روابط النشرة البريدية (Newsletter) ---

app.post('/api/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ message: "البريد الإلكتروني مطلوب" });

        const existing = await Subscriber.findOne({ email });
        if (existing) return res.status(400).json({ message: "هذا البريد مشترك بالفعل" });

        await new Subscriber({ email }).save();
        res.status(201).json({ message: "تم الاشتراك بنجاح" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في الاشتراك" });
    }
});

// جلب المشتركين (للأدمن فقط)
app.get('/api/admin/subscribers', authenticateToken, isAdmin, async (req, res) => {
    try {
        const subscribers = await Subscriber.find().sort({ createdAt: -1 });
        res.status(200).json(subscribers);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب المشتركين" });
    }
});

// إرسال بريد إلكتروني جماعي للمشتركين (للأدمن فقط) عبر Brevo
app.post('/api/admin/send-email', authenticateToken, isAdmin, async (req, res) => {
    try {
        const { subject, message } = req.body;
        
        // التحقق من المدخلات
        if (!subject || !message) {
            return res.status(400).json({ message: "الموضوع والرسالة مطلوبان" });
        }

        // جلب جميع إيميلات المشتركين
        const subscribers = await Subscriber.find({});
        if (subscribers.length === 0) {
            return res.status(400).json({ message: "لا يوجد مشتركين لإرسال الرسالة لهم" });
        }

        // تجهيز قائ//مة المستلمين لـ Brevo (نستخدمها في bcc لإخفاء الإيميلات)
        const bccList = subscribers.map(sub => ({ email: sub.email }));

        // تجهيز البيانات بصيغة يقبلها Brevo API
        const payload = {
            sender: { name: "Details Store", email: "no-reply@details-store.com" },
            to: [{ email: "no-reply@details-store.com", name: "Details Store" }],  
             bcc: bccList, // جميع المشتركين في النسخة المخفية
            subject: subject,
            htmlContent: getEmailTemplate(subject, `<p>${message.replace(/\n/g, '<br>')}</p>`)
        };

        // إرسال الطلب إلى سيرفرات Brevo
        const response = await fetch('https://api.brevo.com/v3/smtp/email', {
            method: 'POST',
            headers: {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'api-key': process.env.BREVO_API_KEY // مفتاح الـ API
            },
            body: JSON.stringify(payload)
        });

        // التحقق من حالة الإرسال
        if (!response.ok) {
            const errorData = await response.json();
            console.error("❌ خطأ من Brevo أثناء إرسال النشرة:", errorData);
            return res.status(500).json({ message: "فشل إرسال النشرة البريدية من الخادم" });
        }

        res.status(200).json({ message: `تم إرسال البريد الإلكتروني إلى ${subscribers.length} مشترك بنجاح` });
        
    } catch (err) {
        console.error("❌ خطأ في السيرفر أثناء إرسال البريد الجماعي:", err);
        res.status(500).json({ message: "حدث خطأ غير متوقع، يرجى مراجعة سجلات السيرفر" });
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
        
        // 4. إرسال بريد تأكيد الطلب للعميل (أولاً)
        // نضعها في try...catch منفصلة حتى إذا فشل الإيميل، لا يفشل الطلب بأكمله
        if (req.user.email) {
            try {
                const productsListHtml = products.map(p => `
                    <tr>
                        <td width="70" style="padding: 10px 0; border-bottom: 1px solid #eee;">
                            <img src="${p.imageUrl}" alt="${p.title}" width="60" height="60" style="display: block; border-radius: 4px; object-fit: cover;">
                        </td>
                        <td style="padding: 10px; border-bottom: 1px solid #eee;">
                            <p style="margin: 0; font-weight: bold; font-size: 14px; color: #333;">${p.title}</p>
                            <p style="margin: 5px 0 0; font-size: 12px; color: #777;">
                                الكمية: ${p.quantity} ${p.size ? `| المقاس: ${p.size}` : ''}
                            </p>
                        </td>
                        <td width="80" style="padding: 10px 0; border-bottom: 1px solid #eee; text-align: left; font-weight: bold; color: #333;">
                            ${p.price} د.أ
                        </td>
                    </tr>
                `).join('');

                const orderContent = `
                    <p>مرحباً بك في ديتيلز،</p>
                    <p>شكراً لطلبك رقم <strong>#${savedOrder._id}</strong>.</p>
                    <p>طلبك الآن قيد التجهيز وسيصلك في أقرب وقت.</p>
                    <div style="background-color: #fff; border: 1px solid #e9ecef; border-radius: 4px; padding: 15px; margin: 20px 0;">
                        <h3 style="margin-top: 0; border-bottom: 2px solid #f4f4f4; padding-bottom: 10px; font-size: 16px;">المنتجات المطلوبة</h3>
                        <table width="100%" cellpadding="0" cellspacing="0" border="0">
                            ${productsListHtml}
                        </table>
                    </div>
                    <div class="info-box">
                        <p><span class="label">المجموع:</span> ${amount} د.أ</p>
                        <p><span class="label">طريقة الدفع:</span> ${payment_method === 'cod' ? 'الدفع عند الاستلام' : 'بطاقة ائتمانية'}</p>
                    </div>
                    <p>شكراً لتسوقك معنا!</p>
                `;
                await sendEmailViaBrevo({
                    to: req.user.email,
                    subject: 'تأكيد طلبك من ديتيلز',
                    htmlContent: getEmailTemplate('تأكيد الطلب', orderContent)
                });
            } catch (emailErr) {
                console.error("⚠️ تم حفظ الطلب ولكن فشل إرسال إيميل التأكيد:", emailErr);
            }
        }

        // 5. إرسال الرد بنجاح العملية (أخيراً)
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
