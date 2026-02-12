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
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    isSoldOut: { type: Boolean, default: false },
    popularity: { type: Number, default: 0 }, // عدد مرات الإضافة لقائمة المفضلة
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
    },
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

const Category = mongoose.model('Category', categorySchema);

const wishlistSchema = new mongoose.Schema({
    userId: { type: String, required: true },
    products: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }]
});
const Wishlist = mongoose.model('Wishlist', wishlistSchema);

// 2. الاتصال (MongoDB Atlas)
const dbURI = "mongodb+srv://admin:Details2024Store@detailscluster.qcnnpvw.mongodb.net/DetailsStoreDB?appName=DetailsCluster";

// 3. بيانات 50 صنف (صور مختارة بعناية لتظهر فوراً)
const luxuryProducts = [
    // Bags
    {
        name: { en: "Vintage Celine Macadam", ar: "حقيبة سيلين فينتاج ماكاديم" },
        description: { 
            ar: "حقيبة سيلين فينتاج بنقشة الماكاديم الشهيرة.",
            en: "Vintage Celine bag with Macadam pattern."
        },
        price: 185.0, oldPrice: 220.0, brand: "Celine", dimensions: "25cm x 18cm", category: "bags",
        imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=800",
            "https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Prada Nylon Re-Edition", ar: "برادا نايلون ري-إديشن" },
        description: {
            ar: "حقيبة برادا النايلون العصرية.",
            en: "Modern Prada Nylon bag."
        },
        price: 140.0, brand: "Prada", dimensions: "22cm x 14cm", category: "bags",
        imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Hermes Birkin Leather", ar: "هيرميس بيركين جلد" },
        description: {
            ar: "حقيبة هيرميس الأيقونية.",
            en: "The iconic Hermes bag."
        },
        price: 9800.0, brand: "Hermes", dimensions: "30cm", category: "bags", featured: true,
        imageUrl: "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1548036328-c9fa89d128fa?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Dior Saddle Signature Bag", ar: "حقيبة ديور سادل سيجنتشر" },
        description: {
            ar: "حقيبة ديور Saddle الشهيرة.",
            en: "Famous Dior Saddle bag."
        },
        price: 2300.0, brand: "Dior", dimensions: "25cm", category: "bags", isSoldOut: true,
        imageUrl: "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1594223274512-ad4803739b7c?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Chanel Classic Flap Bag", ar: "حقيبة شانيل كلاسيك فلاب" },
        description: {
            ar: "حقيبة شانيل كلاسيك.",
            en: "Chanel Classic bag."
        },
        price: 7500.0, brand: "Chanel", dimensions: "25cm", category: "bags",
        imageUrl: "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1598033129183-c4f50c736f10?auto=format&fit=crop&q=80&w=800"
        ]
    },
    // Watches
    {
        name: { en: "Rolex Oyster Perpetual 41", ar: "رولكس أويستر بربتشوال 41" },
        description: {
            ar: "ساعة رولكس Oyster بقرص أزرق.",
            en: "Rolex Oyster watch with blue dial."
        },
        price: 4500.0, brand: "Rolex", dimensions: "41mm", category: "watches",
        imageUrl: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Cartier Tank Solo", ar: "كارتييه تانك سولو" },
        description: { ar: "ساعة كارتييه الكلاسيكية.", en: "Classic Cartier Tank watch." },
        price: 3100.0, brand: "Cartier", dimensions: "31mm", category: "watches",
        imageUrl: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1524592094714-0f0654e20314?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Omega Speedmaster", ar: "أوميغا سبيدماستر" },
        description: { ar: "ساعة القمر الشهيرة.", en: "The famous Moonwatch." },
        price: 5200.0, brand: "Omega", dimensions: "42mm", category: "watches",
        imageUrl: "https://images.unsplash.com/photo-1622434641406-a158123450f9?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1622434641406-a158123450f9?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Patek Philippe Nautilus", ar: "باتيك فيليب نوتيلوس" },
        description: { ar: "قمة الساعات الرياضية الفاخرة.", en: "The pinnacle of luxury sports watches." },
        price: 35000.0, brand: "Patek Philippe", dimensions: "40mm", category: "watches", featured: true,
        imageUrl: "https://images.unsplash.com/photo-1619134778706-7015533a6150?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1619134778706-7015533a6150?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Audemars Piguet Royal Oak", ar: "أوديمار بيغيه رويال أوك" },
        description: { ar: "تصميم ثماني الأضلاع المميز.", en: "Distinctive octagonal design." },
        price: 28000.0, brand: "Audemars Piguet", dimensions: "41mm", category: "watches",
        imageUrl: "https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1612817288484-6f916006741a?auto=format&fit=crop&q=80&w=800"]
    },
    // Shoes
    {
        name: { en: "Gucci Leather Loafers", ar: "حذاء غوتشي جلدي" },
        description: {
            ar: "حذاء لوفر كلاسيكي.",
            en: "Classic leather loafers."
        },
        price: 950.0, brand: "Gucci", dimensions: "Size 42", category: "shoes",
        imageUrl: "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1614252235316-8c857d38b5f4?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Balenciaga Triple S", ar: "بالنسياغا تريبل إس" },
        description: {
            ar: "حذاء رياضي ضخم.",
            en: "Oversized sneaker."
        },
        price: 1100.0, brand: "Balenciaga", dimensions: "Size 43", category: "shoes",
        imageUrl: "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1595950653106-6c9ebd614d3a?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Nike Air Jordan 1", ar: "نايك إير جوردان 1" },
        description: { ar: "حذاء كرة السلة الكلاسيكي.", en: "Classic basketball shoe." },
        price: 170.0, brand: "Nike", dimensions: "Size 44", category: "shoes",
        imageUrl: "https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1552346154-21d32810aba3?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Christian Louboutin Heels", ar: "كعب كريستيان لوبوتان" },
        description: { ar: "الكعب الأحمر الشهير.", en: "Famous red sole heels." },
        price: 895.0, brand: "Christian Louboutin", dimensions: "Size 38", category: "shoes",
        imageUrl: "https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1543163521-1bf539c55dd2?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Adidas Yeezy Boost", ar: "أديداس ييزي بوست" },
        description: { ar: "تصميم مريح وعصري.", en: "Comfortable and modern design." },
        price: 220.0, brand: "Adidas", dimensions: "Size 41", category: "shoes",
        imageUrl: "https://images.unsplash.com/photo-1584735175315-9d5df23860e6?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1584735175315-9d5df23860e6?auto=format&fit=crop&q=80&w=800"]
    },
    // Jewelry
    {
        name: { en: "Cartier Love Bracelet", ar: "سوار كارتييه لوف" },
        description: {
            ar: "رمز للحب الأبدي.",
            en: "Symbol of eternal love."
        },
        price: 6500.0, brand: "Cartier", dimensions: "Size 17", category: "jewelry",
        imageUrl: "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1611591437281-460bfbe1220a?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Van Cleef Alhambra", ar: "فان كليف ألهامبرا" },
        description: { ar: "تصميم البرسيم الرباعي.", en: "Four-leaf clover design." },
        price: 3200.0, brand: "Van Cleef & Arpels", dimensions: "Standard", category: "jewelry",
        imageUrl: "https://images.unsplash.com/photo-1599643478518-17488fbbcd75?auto=format&fit=crop&q=80&w=800",
        images: [
            "https://images.unsplash.com/photo-1599643478518-17488fbbcd75?auto=format&fit=crop&q=80&w=800"
        ]
    },
    {
        name: { en: "Tiffany & Co Ring", ar: "خاتم تيفاني آند كو" },
        description: { ar: "خاتم الخطوبة الكلاسيكي.", en: "Classic engagement ring." },
        price: 4500.0, brand: "Tiffany & Co", dimensions: "Size 6", category: "jewelry",
        imageUrl: "https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1605100804763-247f67b3557e?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Bvlgari Serpenti", ar: "بولغاري سيربنتي" },
        description: { ar: "تصميم الثعبان الجذاب.", en: "Alluring serpent design." },
        price: 12000.0, brand: "Bvlgari", dimensions: "Standard", category: "jewelry",
        imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Swarovski Earrings", ar: "أقراط سواروفسكي" },
        description: { ar: "كريستال لامع.", en: "Sparkling crystal." },
        price: 150.0, brand: "Swarovski", dimensions: "Standard", category: "jewelry",
        imageUrl: "https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1535632066927-ab7c9ab60908?auto=format&fit=crop&q=80&w=800"]
    },
    // Accessories
    {
        name: { en: "Ray-Ban Aviator", ar: "نظارات راي بان أفياتور" },
        description: { ar: "تصميم الطيار الكلاسيكي.", en: "Classic aviator design." },
        price: 160.0, brand: "Ray-Ban", dimensions: "Standard", category: "accessories",
        imageUrl: "https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1572635196237-14b3f281503f?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Gucci Belt", ar: "حزام غوتشي" },
        description: { ar: "حزام جلدي بشعار GG.", en: "Leather belt with GG logo." },
        price: 450.0, brand: "Gucci", dimensions: "90cm", category: "accessories",
        imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Hermes Silk Scarf", ar: "وشاح هيرميس حريري" },
        description: { ar: "وشاح حريري بنقوش فنية.", en: "Silk scarf with artistic patterns." },
        price: 480.0, brand: "Hermes", dimensions: "90x90cm", category: "accessories",
        imageUrl: "https://images.unsplash.com/photo-1584030373081-f37b7bb4fa8e?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1584030373081-f37b7bb4fa8e?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Louis Vuitton Wallet", ar: "محفظة لويس فويتون" },
        description: { ar: "محفظة كلاسيكية بنقشة المونوغرام.", en: "Classic wallet with monogram pattern." },
        price: 550.0, brand: "Louis Vuitton", dimensions: "Standard", category: "accessories",
        imageUrl: "https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1627123424574-724758594e93?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Tom Ford Tie", ar: "ربطة عنق توم فورد" },
        description: { ar: "ربطة عنق حريرية أنيقة.", en: "Elegant silk tie." },
        price: 250.0, brand: "Tom Ford", dimensions: "Standard", category: "accessories",
        imageUrl: "https://images.unsplash.com/photo-1589756823695-278bc923f962?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1589756823695-278bc923f962?auto=format&fit=crop&q=80&w=800"]
    },
    // Perfumes
    {
        name: { en: "Chanel No. 5", ar: "شانيل رقم 5" },
        description: { ar: "العطر الأكثر شهرة في العالم.", en: "The most famous perfume in the world." },
        price: 135.0, brand: "Chanel", dimensions: "100ml", category: "perfumes",
        imageUrl: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Dior Sauvage", ar: "ديور سوفاج" },
        description: { ar: "عطر رجالي منعش وقوي.", en: "Fresh and strong men's fragrance." },
        price: 110.0, brand: "Dior", dimensions: "100ml", category: "perfumes",
        imageUrl: "https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1523293182086-7651a899d37f?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Tom Ford Black Orchid", ar: "توم فورد بلاك أوركيد" },
        description: { ar: "عطر فاخر وغامض.", en: "Luxurious and mysterious fragrance." },
        price: 150.0, brand: "Tom Ford", dimensions: "100ml", category: "perfumes",
        imageUrl: "https://images.unsplash.com/photo-1594035910387-fea4779426e9?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1594035910387-fea4779426e9?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Creed Aventus", ar: "كريد أفينتوس" },
        description: { ar: "عطر النخبة.", en: "The fragrance of the elite." },
        price: 350.0, brand: "Creed", dimensions: "100ml", category: "perfumes",
        imageUrl: "https://images.unsplash.com/photo-1592914610354-fd354ea45e48?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1592914610354-fd354ea45e48?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "YSL Libre", ar: "إيف سان لوران ليبر" },
        description: { ar: "عطر الحرية.", en: "The fragrance of freedom." },
        price: 120.0, brand: "Yves Saint Laurent", dimensions: "90ml", category: "perfumes",
        imageUrl: "https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1620916566398-39f1143ab7be?auto=format&fit=crop&q=80&w=800"]
    },
    // Clothing
    {
        name: { en: "Burberry Trench Coat", ar: "معطف بربري" },
        description: { ar: "المعطف الكلاسيكي البيج.", en: "Classic beige trench coat." },
        price: 2200.0, brand: "Burberry", dimensions: "Size M", category: "clothing",
        imageUrl: "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Ralph Lauren Polo", ar: "قميص بولو رالف لورين" },
        description: { ar: "قميص بولو أيقوني.", en: "Iconic polo shirt." },
        price: 95.0, brand: "Ralph Lauren", dimensions: "Size L", category: "clothing",
        imageUrl: "https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1576566588028-4147f3842f27?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Versace Evening Dress", ar: "فستان سهرة فيرساتشي" },
        description: { ar: "فستان أسود أنيق.", en: "Elegant black dress." },
        price: 3500.0, brand: "Versace", dimensions: "Size 38", category: "clothing",
        imageUrl: "https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1539008835657-9e8e9680c956?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Armani Suit", ar: "بدلة أرماني" },
        description: { ar: "بدلة رسمية فاخرة.", en: "Luxurious formal suit." },
        price: 2800.0, brand: "Armani", dimensions: "Size 50", category: "clothing",
        imageUrl: "https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1594938298603-c8148c4dae35?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Levi's Denim Jacket", ar: "جاكيت جينز ليفايز" },
        description: { ar: "جاكيت جينز كلاسيكي.", en: "Classic denim jacket." },
        price: 120.0, brand: "Levi's", dimensions: "Size L", category: "clothing",
        imageUrl: "https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1576871337632-b9aef4c17ab9?auto=format&fit=crop&q=80&w=800"]
    },
    // Home Decor
    {
        name: { en: "Diptyque Candle", ar: "شمعة ديبتيك" },
        description: { ar: "شمعة معطرة فاخرة.", en: "Luxurious scented candle." },
        price: 70.0, brand: "Diptyque", dimensions: "190g", category: "home-decor",
        imageUrl: "https://images.unsplash.com/photo-1602825266988-75001771d276?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1602825266988-75001771d276?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Baccarat Vase", ar: "مزهريّة باكارات" },
        description: { ar: "مزهريّة كريستالية.", en: "Crystal vase." },
        price: 850.0, brand: "Baccarat", dimensions: "20cm", category: "home-decor",
        imageUrl: "https://images.unsplash.com/photo-1580480055273-228ff5388ef8?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1580480055273-228ff5388ef8?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Hermes Blanket", ar: "بطانية هيرميس" },
        description: { ar: "بطانية صوفية أيقونية.", en: "Iconic wool blanket." },
        price: 1500.0, brand: "Hermes", dimensions: "135x170cm", category: "home-decor",
        imageUrl: "https://images.unsplash.com/photo-1580587771525-78b9dba3b91d?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1580587771525-78b9dba3b91d?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Fornasetti Plate", ar: "صحن فورناسيتي" },
        description: { ar: "صحن ديكور فني.", en: "Artistic decorative plate." },
        price: 180.0, brand: "Fornasetti", dimensions: "26cm", category: "home-decor",
        imageUrl: "https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1610701596007-11502861dcfa?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Jo Malone Diffuser", ar: "معطر جو مالون" },
        description: { ar: "موزع عطر منزلي.", en: "Home fragrance diffuser." },
        price: 95.0, brand: "Jo Malone", dimensions: "165ml", category: "home-decor",
        imageUrl: "https://images.unsplash.com/photo-1616604847460-e85a9651256e?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1616604847460-e85a9651256e?auto=format&fit=crop&q=80&w=800"]
    },
    // Electronics
    {
        name: { en: "Apple AirPods Max", ar: "أبل إيربودز ماكس" },
        description: { ar: "سماعات رأس عالية الجودة.", en: "High-fidelity headphones." },
        price: 549.0, brand: "Apple", dimensions: "Standard", category: "electronics",
        imageUrl: "https://images.unsplash.com/photo-1613040809024-b4ef7ba99bc3?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1613040809024-b4ef7ba99bc3?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Sony WH-1000XM4", ar: "سوني WH-1000XM4" },
        description: { ar: "سماعات مانعة للضوضاء.", en: "Noise cancelling headphones." },
        price: 348.0, brand: "Sony", dimensions: "Standard", category: "electronics",
        imageUrl: "https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1618366712010-f4ae9c647dcb?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Leica Q2 Camera", ar: "كاميرا لايكا Q2" },
        description: { ar: "كاميرا مدمجة احترافية.", en: "Professional compact camera." },
        price: 5500.0, brand: "Leica", dimensions: "Standard", category: "electronics",
        imageUrl: "https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Marshall Speaker", ar: "مكبر صوت مارشال" },
        description: { ar: "مكبر صوت بتصميم كلاسيكي.", en: "Classic design speaker." },
        price: 250.0, brand: "Marshall", dimensions: "Standard", category: "electronics",
        imageUrl: "https://images.unsplash.com/photo-1623998021450-85c29c644e0d?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1623998021450-85c29c644e0d?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Bang & Olufsen Beoplay", ar: "بانغ آند أولوفسن" },
        description: { ar: "سماعة بلوتوث محمولة.", en: "Portable bluetooth speaker." },
        price: 500.0, brand: "Bang & Olufsen", dimensions: "Standard", category: "electronics",
        imageUrl: "https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1545454675-3531b543be5d?auto=format&fit=crop&q=80&w=800"]
    },
    // Gifts
    {
        name: { en: "Luxury Gift Box", ar: "صندوق هدايا فاخر" },
        description: { ar: "مجموعة مختارة من الهدايا.", en: "Curated selection of gifts." },
        price: 150.0, brand: "Details", dimensions: "Standard", category: "gifts",
        imageUrl: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&q=80&w=800", 
        imageUrl: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Chocolate Hamper", ar: "سلة شوكولاتة" },
        description: { ar: "أجود أنواع الشوكولاتة.", en: "Finest chocolates." },
        price: 80.0, brand: "Godiva", dimensions: "Standard", category: "gifts",
        imageUrl: "https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1549007994-cb92caebd54b?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Flower Bouquet", ar: "باقة زهور" },
        description: { ar: "زهور موسمية طازجة.", en: "Fresh seasonal flowers." },
        price: 60.0, brand: "Details", dimensions: "Standard", category: "gifts",
        imageUrl: "https://images.unsplash.com/photo-1562690868-60bbe7293e94?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1562690868-60bbe7293e94?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Personalized Pen", ar: "قلم مخصص" },
        description: { ar: "قلم محفور بالاسم.", en: "Engraved pen." },
        price: 120.0, brand: "Montblanc", dimensions: "Standard", category: "gifts",
        imageUrl: "https://images.unsplash.com/photo-1585336261022-680e295ce3fe?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1585336261022-680e295ce3fe?auto=format&fit=crop&q=80&w=800"]
    },
    {
        name: { en: "Spa Voucher", ar: "قسيمة سبا" },
        description: { ar: "يوم كامل من الاسترخاء.", en: "Full day of relaxation." },
        price: 200.0, brand: "Details", dimensions: "Standard", category: "gifts",
        imageUrl: "https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&q=80&w=800",
        images: ["https://images.unsplash.com/photo-1540555700478-4be289fbecef?auto=format&fit=crop&q=80&w=800"]
    }
];

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
    },
    // إعلانات خاصة بالكاتيجوري (سنربطها بالكود لاحقاً)
    {
        title: { ar: "أحدث موديلات الحقائب", en: "Latest Bag Models" },
        imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&q=80&w=1200",
        buttonText: { ar: "تسوقي الحقائب", en: "Shop Bags" },
        location: 'category',
        categorySlug: 'bags',
    },
    {
        title: { ar: "ساعات فاخرة", en: "Luxury Watches" },
        imageUrl: "https://images.unsplash.com/photo-1614164185128-e4ec99c436d7?auto=format&fit=crop&q=80&w=1200",
        buttonText: { ar: "تصفح الساعات", en: "Browse Watches" },
        location: 'category',
        categorySlug: 'watches'
    }
];

// 5. التصنيفات (Categories)
const categories = [
    {
        name: { ar: "حقائب", en: "Bags" },
        slug: "bags",
        imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&q=80&w=800"
    },
    {
        name: { ar: "ساعات", en: "Watches" },
        slug: "watches",
        imageUrl: "https://images.unsplash.com/photo-1523170335258-f5ed11844a49?auto=format&fit=crop&q=80&w=800"
    },
    {
        name: { ar: "أحذية", en: "Shoes" },
        slug: "shoes",
        imageUrl: "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&q=80&w=800"
    },
    {
        name: { ar: "مجوهرات", en: "Jewelry" },
        slug: "jewelry",
        imageUrl: "https://images.unsplash.com/photo-1515562141207-7a88fb7ce338?auto=format&fit=crop&q=80&w=800"
    },
    {
        name: { ar: "إكسسوارات", en: "Accessories" },
        slug: "accessories",
        imageUrl: "https://images.unsplash.com/photo-1576053139778-7e32f2ae3cfd?auto=format&fit=crop&q=80&w=800"
    },
    {
        name: { ar: "عطور", en: "Perfumes" },
        slug: "perfumes",
        imageUrl: "https://images.unsplash.com/photo-1541643600914-78b084683601?auto=format&fit=crop&q=80&w=800"
    },
    {
        name: { ar: "ملابس", en: "Clothing" },
        slug: "clothing",
        imageUrl: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?auto=format&fit=crop&q=80&w=800"
    },
    {
        name: { ar: "ديكور منزلي", en: "Home Decor" },
        slug: "home-decor",
        imageUrl: "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&q=80&w=800"
    },
    {
        name: { ar: "إلكترونيات", en: "Electronics" },
        slug: "electronics",
        imageUrl: "https://images.unsplash.com/photo-1468495244123-6c6ef332ad63?auto=format&fit=crop&q=80&w=800"
    },
    {
        name: { ar: "هدايا", en: "Gifts" },
        slug: "gifts",
        imageUrl: "https://images.unsplash.com/photo-1549465220-1a8b9238cd48?auto=format&fit=crop&q=80&w=800"
    },
];

async function seedDatabase() {
    try {
        await mongoose.connect(dbURI);
        console.log('✅ Connected to Details Database');

        await Product.deleteMany({});
        await Banner.deleteMany({});
        await Category.deleteMany({});
        await Wishlist.deleteMany({});
        console.log('🗑️ Old data cleared');

        let createdCategories = [];
        // 1. إدراج التصنيفات الأساسية (المعرفة مسبقاً)
        for (const catData of categories) {
            const cat = await new Category(catData).save();
            createdCategories.push(cat);
        }
        console.log('📂 Inserted predefined categories');

        // 2. إدراج المنتجات (15 صنف لكل قسم)
        const productsToInsert = [];
        
        // تجميع القوالب حسب الكاتيجوري
        const productsByCategory = {};
        for (const p of luxuryProducts) {
            if (!productsByCategory[p.category]) {
                productsByCategory[p.category] = [];
            }
            productsByCategory[p.category].push(p);
        }
        
        for (const cat of createdCategories) {
            const templates = productsByCategory[cat.slug] || [];
            
            if (templates.length > 0) {
                // توليد 15 منتج لكل قسم
                for (let i = 0; i < 15; i++) {
                    const template = templates[i % templates.length];
                    const suffix = i >= templates.length ? ` ${Math.floor(i / templates.length) + 1}` : "";
                    
                    const newProduct = {
                        ...template,
                        name: {
                            ar: template.name.ar + suffix,
                            en: template.name.en + suffix
                        },
                        price: i >= templates.length ? template.price + (i * 2) : template.price,
                        category: cat._id,
                        featured: i === 0 ? true : (template.featured && i < templates.length),
                        popularity: Math.floor(Math.random() * 500) // إضافة شعبية عشوائية للعرض
                    };
                    
                    productsToInsert.push(newProduct);
                }
            }
        }

        await Product.insertMany(productsToInsert);
        console.log(`✨ Inserted ${productsToInsert.length} products (15 per category)`);

        // 3. إدراج الإعلانات (مع ربط إعلانات الكاتيجوري)
        const bannersToInsert = banners.map(b => {
            if (b.location === 'category' && b.categorySlug) {
                const cat = createdCategories.find(c => c.slug === b.categorySlug);

                if (cat) return { ...b, category: cat._id };
            }
            return b;
        });

        await Banner.insertMany(bannersToInsert);
        console.log(`📸 Inserted ${bannersToInsert.length} banners (Home & Category specific)`);

    } catch (err) { console.error('❌ Error:', err); } finally { mongoose.connection.close(); }
}
seedDatabase();