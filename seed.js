const mongoose = require('mongoose');

// 1. الموديلات (Schemas)
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
    category: { type: String, default: 'bags' },
    isSoldOut: { type: Boolean, default: false },
    featured: { type: Boolean, default: false }
}, { timestamps: true });

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
    }
});

const Banner = mongoose.model('Banner', bannerSchema);

// 2. الاتصال (MongoDB Atlas)
const dbURI = "mongodb+srv://admin:Details2024Store@detailscluster.qcnnpvw.mongodb.net/?appName=DetailsCluster";

// 3. بيانات 10 أصناف (صور مختارة بعناية لتظهر فوراً)
const luxuryProducts = [
    {
        name: { en: "Vintage Celine Macadam", ar: "حقيبة سيلين فينتاج ماكاديم" },
        description: { 
            ar: "حقيبة سيلين فينتاج بنقشة الماكاديم الشهيرة، قطعة كلاسيكية نادرة.",
            en: "Vintage Celine bag with the famous Macadam pattern, a rare classic piece."
        },
        price: 185.0, oldPrice: 220.0, brand: "Celine", dimensions: "25cm x 18cm", category: "bags",
        imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=800",
            "https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Rolex Oyster Perpetual 41", ar: "رولكس أويستر بربتشوال 41" },
        description: {
            ar: "ساعة رولكس Oyster بقرص أزرق ملكي، رمز للأناقة والتميز.",
            en: "Rolex Oyster watch with royal blue dial, a symbol of elegance and distinction."
        },
        price: 4500.0, brand: "Rolex", dimensions: "41mm", category: "watches",
        imageUrl: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=800",
            "https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Prada Nylon Re-Edition", ar: "برادا نايلون ري-إديشن" },
        description: {
            ar: "حقيبة برادا النايلون العصرية، عملية جداً وتناسب الاستخدام اليومي.",
            en: "Modern Prada Nylon bag, very practical and suitable for daily use."
        },
        price: 140.0, brand: "Prada", dimensions: "22cm x 14cm", category: "bags",
        imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&q=80&w=800",
            "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Hermes Birkin Leather", ar: "هيرميس بيركين جلد" },
        description: {
            ar: "حقيبة هيرميس الأيقونية، قمة الفخامة في عالم الموضة.",
            en: "The iconic Hermes bag, the pinnacle of luxury in the fashion world."
        },
        price: 9800.0, brand: "Hermes", dimensions: "30cm", category: "bags", featured: true,
        imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&q=80&w=800",
            "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Dior Saddle Signature Bag", ar: "حقيبة ديور سادل سيجنتشر" },
        description: {
            ar: "حقيبة ديور Saddle الشهيرة، تصميم عصري ومميز يلفت الأنظار.",
            en: "Famous Dior Saddle bag, modern and distinctive design that catches the eye."
        },
        price: 2300.0, brand: "Dior", dimensions: "25cm", category: "bags", isSoldOut: true,
        imageUrl: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&q=80&w=800",
            "https://images.unsplash.com/photo-1575032617751-6ddec2089882?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Chanel Classic Flap Bag", ar: "حقيبة شانيل كلاسيك فلاب" },
        description: {
            ar: "حقيبة شانيل كلاسيك، الحلم لكل سيدة تبحث عن الرقي.",
            en: "Chanel Classic bag, the dream for every lady looking for sophistication."
        },
        price: 7500.0, brand: "Chanel", dimensions: "25cm", category: "bags",
        imageUrl: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&q=80&w=800",
            "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&q=80&w=800"
        ]
    }
];

// 4. الإعلانات (Banners)
const banners = [
    { 
        title: { ar: "عالم الحقائب الكلاسيكية", en: "World of Classic Bags" }, 
        imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&q=80&w=1200", 
        buttonText: { ar: "اكتشفي الآن", en: "Discover Now" } 
    },
    { 
        title: { ar: "ساعات تليق بمقامك", en: "Watches for Your Stature" }, 
        imageUrl: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&q=80&w=1200", 
        buttonText: { ar: "شاهد التشكيلة", en: "View Collection" } 
    },
    { 
        title: { ar: "خصومات الشتاء بدأت", en: "Winter Sale Started" }, 
        imageUrl: "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&q=80&w=1200", 
        buttonText: { ar: "عرض العروض", en: "View Offers" } 
    }
];

async function seedDatabase() {
    try {
        await mongoose.connect(dbURI);
        console.log('✅ Connected to Details Database');

        await Product.deleteMany({});
        await Banner.deleteMany({});
        console.log('🗑️ Old data cleared');

        await Product.insertMany(luxuryProducts);
        console.log(`✨ Inserted 10 products with Hover images`);

        await Banner.insertMany(banners);
        console.log('📸 Inserted 3 active banners');

    } catch (err) { console.error('❌ Error:', err); } 
    finally { mongoose.connection.close(); }
}

seedDatabase();