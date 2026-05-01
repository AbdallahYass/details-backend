require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// قالب متغيرات المنتج (Variants)
const variantSchema = new mongoose.Schema({
    colorHex: { type: String, default: null },
    size: { type: String, default: null },
    quantity: { type: Number, required: true, default: 0 }
}, { _id: false });
//
// 1. الموديلات (Schemas) - مطابقة تماماً لملف server.js
const productSchema = new mongoose.Schema({
    name: { 
        ar: { type: String, required: true },
        en: { type: String, required: true }
    },
    description: {
        ar: { type: String },
        en: { type: String }
    },
    price: { type: Number, required: true },
    oldPrice: Number,
    brand: { type: String, uppercase: true, default: 'DETAILS' },
    dimensions: String,
    imageUrl: { type: String, required: true },
    images: [String],
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    isSoldOut: { type: Boolean, default: false },
    featured: { type: Boolean, default: false },
    popularity: { type: Number, default: 0 },
    quantity: { type: Number, default: 0 }, // الكمية الإجمالية
    sizes: [String],
    colors: [{
        hex: String,
        images: [String]
    }],
    variants: [variantSchema]
}, { timestamps: true });

productSchema.pre('save', function(next) {
    if (this.variants && this.variants.length > 0) {
        this.quantity = this.variants.reduce((total, v) => total + (Number(v.quantity) || 0), 0);
    } else {
        this.quantity = Number(this.quantity) || 0;
    }
    this.isSoldOut = this.quantity <= 0;
    next();
});

const Product = mongoose.model('Product', productSchema);

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
    location: { type: String, enum: ['home', 'category'], default: 'home' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category' }
}, { timestamps: true });

const Banner = mongoose.model('Banner', bannerSchema);

const categorySchema = new mongoose.Schema({
    name: { 
        ar: { type: String, required: true },
        en: { type: String, required: true }
    },
    slug: { type: String, required: true, unique: true },
    imageUrl: { type: String, required: true }
}, { timestamps: true });

categorySchema.set('toJSON', {
    transform: function(doc, ret, options) {
        const lang = options.lang || 'ar';
        if (ret.name && typeof ret.name === 'object') {
            ret.name = ret.name[lang] || ret.name['ar'];
        }
        return ret;
    }
});

const Category = mongoose.model('Category', categorySchema);

const wishlistSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
});
const Wishlist = mongoose.model('Wishlist', wishlistSchema);

// قالب المستخدمين (Users)
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
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

// قالب الكوبونات (Coupons)
const couponSchema = new mongoose.Schema({
    code: { type: String, required: true, unique: true, uppercase: true },
    discountType: { type: String, enum: ['percentage', 'fixed'], required: true },
    value: { type: Number, required: true },
    expirationDate: { type: Date, required: true },
    isActive: { type: Boolean, default: true },
    usageLimit: { type: Number, default: 100 },
    usedCount: { type: Number, default: 0 }
}, { timestamps: true });

const Coupon = mongoose.model('Coupon', couponSchema);

// قالب الطلبات (Orders)
const orderSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    products: [Object], // تبسيط للهيكل في الـ Seed
    subtotal: Number,
    discountAmount: Number,
    couponCode: String,
    amount: Number,
    shippingAddress: Object,
    paymentMethod: String,
    status: { type: String, default: 'قيد التجهيز' }
}, { timestamps: true });

const Order = mongoose.model('Order', orderSchema);

// قالب الإشعارات (Notifications)
const notificationSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    isRead: { type: Boolean, default: false },
    type: { type: String, default: 'system' } // system, order, promo
}, { timestamps: true });

const Notification = mongoose.model('Notification', notificationSchema);

// 2. الاتصال (MongoDB Atlas)
const dbURI = process.env.MONGODB_URI;

// 4. الإعلانات (Banners)
const banners = [
    { 
        title: { ar: "عالم الحقائب الكلاسيكية", en: "World of Classic Bags" }, 
        imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&q=80&w=1200", 
        buttonText: { ar: "اكتشفي الآن", en: "Discover Now" },
        location: 'home'
    },
    { 
        title: { ar: "ساعات تليق بمقامك", en: "Watches for Your Stature" }, 
        imageUrl: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&q=80&w=1200", 
        buttonText: { ar: "شاهد التشكيلة", en: "View Collection" },
        location: 'home'
    },
    { 
        title: { ar: "خصومات الشتاء بدأت", en: "Winter Sale Started" }, 
        imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1200", 
        buttonText: { ar: "عرض العروض", en: "View Offers" },
        location: 'home'
    }
];

async function seedDatabase() {
    try {
        await mongoose.connect(dbURI);
        console.log('✅ Connected to Details Database');

        await Product.deleteMany({});
        await Banner.deleteMany({});
        await Category.deleteMany({});
        await Wishlist.deleteMany({});
        await User.deleteMany({});
        await Coupon.deleteMany({});
        await Order.deleteMany({});
        await Notification.deleteMany({});
        console.log('🗑️ Old data cleared');

        // 3. إدراج الإعلانات
        await Banner.insertMany(banners);
        console.log(`📸 Inserted ${banners.length} banners (Home specific)`);

        // 4. إضافة مستخدم أدمن
        const hashedPassword = await bcrypt.hash("123456", 10);
        const adminUser = new User({
            name: "Admin User",
            email: "admin@details.com",
            password: hashedPassword,
            phone: "0790000000",
            isAdmin: true,
            isVerified: true // تفعيل حساب الأدمن تلقائياً
        });
        await adminUser.save();

        const normalUser = new User({
            name: "Test User",
            email: "user@details.com",
            password: hashedPassword,
            phone: "0780000000",
            addresses: [
                {
                    city: "Amman",
                    street: "Mecca St, Bldg 12",
                    phone: "0780000000"
                }
            ],
            isAdmin: false,
            isVerified: true // تفعيل حساب التجربة تلقائياً
        });
        await normalUser.save();
        console.log('👤 Users created: (admin@details.com) & (user@details.com) / Pass: 123456');

        // 5. إدراج الكوبونات
        const coupons = [
            { code: "WELCOME10", discountType: "percentage", value: 10, expirationDate: new Date("2030-01-01") },
            { code: "SAVE50", discountType: "fixed", value: 50, expirationDate: new Date("2030-01-01") },
            { code: "EXPIRED", discountType: "percentage", value: 20, expirationDate: new Date("2020-01-01") } // منتهي
        ];
        await Coupon.insertMany(coupons);
        console.log('🎟️ Coupons created: WELCOME10, SAVE50');

    } catch (err) { console.error('❌ Error:', err); } finally { mongoose.connection.close(); }
}
seedDatabase();