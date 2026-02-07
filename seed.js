const mongoose = require('mongoose');

// 1. تعريف الموديلات (Schemas)
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    oldPrice: Number,
    brand: { type: String, uppercase: true },
    dimensions: String,
    imageUrl: { type: String, required: true },
    images: [String],
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

// 2. رابط الاتصال
const dbURI = "mongodb+srv://admin:Details2024Store@detailscluster.qcnnpvw.mongodb.net/?appName=DetailsCluster";

// 3. البيانات التجريبية (المنتجات)
const products = [
    {
        name: "Vintage Celine Macadam",
        price: 185.0,
        oldPrice: 220.0,
        brand: "Celine",
        description: "حقيبة سيلين فينتاج بنقشة الماكاديم الشهيرة. حالة ممتازة مع حزام جلدي طويل.",
        dimensions: "25cm x 18cm",
        imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=80",
        images: ["https://images.unsplash.com/photo-1584917865442-de89df76afd3", "https://images.unsplash.com/photo-1548036328-c9fa89d128fa"],
        isSoldOut: false,
        featured: true,
        category: "bags"
    },
    {
        name: "Prada Nylon Mini Hobo",
        price: 140.0,
        brand: "Prada",
        description: "القطعة الأكثر طلباً. حقيبة برادا نايلون سوداء، عملية وأنيقة لكل المناسبات.",
        dimensions: "22cm x 14cm",
        imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=800&q=80",
        images: ["https://images.unsplash.com/photo-1590874103328-eac38a683ce7"],
        isSoldOut: true,
        category: "bags"
    }
];

// 4. البيانات التجريبية (الإعلانات - Banners)
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
    },
    {
        title: "خصومات حصرية لفترة محدودة",
        imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?q=80&w=1000",
        buttonText: "شاهد العروض",
        link: "offers"
    }
];

// 5. عملية الحقن (Seeding Process)
async function seedDatabase() {
    try {
        await mongoose.connect(dbURI);
        console.log('✅ Connected to Details Store Database');

        // تنظيف البيانات القديمة (منتجات وإعلانات)
        await Product.deleteMany({});
        await Banner.deleteMany({});
        console.log('🗑️ Old products and banners deleted');

        // حقن المنتجات
        const insertedProducts = await Product.insertMany(products);
        console.log(`✨ Added ${insertedProducts.length} luxury products`);

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