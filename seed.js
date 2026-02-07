const mongoose = require('mongoose');

// 1. تعريف الموديلات (Schemas)
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    oldPrice: Number,
    brand: { type: String, uppercase: true, default: 'DETAILS' },
    dimensions: String,
    imageUrl: { type: String, required: true }, // الصورة الأساسية (تظهر أولاً)
    images: [String], // مصفوفة الصور (الصورة الثانية index 1 هي التي ستظهر عند الـ Hover)
    isSoldOut: { type: Boolean, default: false },
    category: { type: String, default: 'bags' },
    featured: { type: Boolean, default: false }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

const bannerSchema = new mongoose.Schema({
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    buttonText: { type: String, default: "اكتشف ديتيلز" },
    link: String
});

const Banner = mongoose.model('Banner', bannerSchema);

// 2. رابط الاتصال (MongoDB Atlas)
const dbURI = "mongodb+srv://admin:Details2024Store@detailscluster.qcnnpvw.mongodb.net/?appName=DetailsCluster";

// 3. البيانات التجريبية المطورة (تدعم تأثير الـ Hover)
const products = [
    {
        name: "Vintage Celine Macadam",
        price: 185.0,
        oldPrice: 220.0,
        brand: "Celine",
        description: "حقيبة سيلين فينتاج بنقشة الماكاديم الشهيرة. حالة ممتازة مع حزام جلدي طويل.",
        dimensions: "25cm x 18cm",
        imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=800",
        // صورتان: الأولى للوضع الطبيعي والثانية تظهر عند مرور الماوس (Hover)
        images: [
            "https://images.unsplash.com/photo-1584917865442-de89df76afd3?q=80&w=800",
            "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=800"
        ],
        isSoldOut: false,
        featured: true,
        category: "bags"
    },
    {
        name: "Rolex Oyster Perpetual",
        price: 4500.0,
        brand: "Rolex",
        description: "ساعة رولكس كلاسيكية، إطار فولاذي مع ميناء أزرق ملكي.",
        dimensions: "41mm",
        imageUrl: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?q=80&w=800",
            "https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?q=80&w=800"
        ],
        isSoldOut: false,
        category: "watches"
    },
    {
        name: "Prada Nylon Mini Hobo",
        price: 140.0,
        brand: "Prada",
        description: "القطعة الأكثر طلباً. حقيبة برادا نايلون سوداء، عملية وأنيقة.",
        dimensions: "22cm x 14cm",
        imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?q=80&w=800",
            "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?q=80&w=800"
        ],
        isSoldOut: true,
        category: "bags"
    },
    {
        name: "Classic Leather Belt",
        price: 85.0,
        brand: "Gucci",
        description: "حزام جلد طبيعي أسود مع إبزيم ذهبي مزدوج.",
        imageUrl: "https://images.unsplash.com/photo-1624222247344-550fb8006741?q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1624222247344-550fb8006741?q=80&w=800",
            "https://images.unsplash.com/photo-1550009158-9ebf69173e03?q=80&w=800"
        ],
        isSoldOut: false,
        category: "accessories"
    }
];

// 4. البيانات التجريبية (الإعلانات - Banners) كما هي
const banners = [
    {
        title: "أفخم الحقائب الكلاسيكية",
        imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?q=80&w=1000",
        buttonText: "تسوقي الآن",
        link: "category/bags"
    },
    {
        title: "تشكيلة الساعات الراقية 2026",
        imageUrl: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?q=80&w=1000",
        buttonText: "اكتشف المزيد",
        link: "category/watches"
    }
];

// 5. عملية الحقن (Seeding Process)
async function seedDatabase() {
    try {
        await mongoose.connect(dbURI);
        console.log('✅ Connected to Details Store Database');

        // تنظيف البيانات القديمة
        await Product.deleteMany({});
        await Banner.deleteMany({});
        console.log('🗑️ Old products and banners deleted');

        // حقن المنتجات
        const insertedProducts = await Product.insertMany(products);
        console.log(`✨ Added ${insertedProducts.length} luxury products with Hover support`);

        // حقن الإعلانات
        const insertedBanners = await Banner.insertMany(banners);
        console.log(`📸 Added ${insertedBanners.length} banners for the slider`);

    } catch (err) {
        console.error('❌ Error during seeding:', err);
    } finally {
        mongoose.connection.close();
        console.log('🔌 Database connection closed');
    }
}

seedDatabase();