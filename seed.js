const mongoose = require('mongoose');

// 1. تعريف شكل البيانات (نفس الشكل المطور لـ Lady90s)
const productSchema = new mongoose.Schema({
    name: { type: String, required: true },
    description: String,
    price: { type: Number, required: true },
    oldPrice: Number, // السعر قبل الخصم
    brand: String, // الماركة
    dimensions: String, // الأبعاد
    imageUrl: { type: String, required: true },
    isSoldOut: { type: Boolean, default: false }, // هل نفذت؟
    category: { type: String, default: 'bags' }
});

const Product = mongoose.model('Product', productSchema);

// 2. رابط قاعدة البيانات (تأكد أنه نفس الموجود في server.js)
// ملاحظة: لقد استخدمت الرابط الذي أرسلته أنت في الرسالة الأخيرة
const dbURI = "mongodb+srv://admin:Details2024Store@detailscluster.qcnnpvw.mongodb.net/?appName=DetailsCluster";

// 3. بيانات تجريبية فخمة (نسخة ليدي 90s)
const products = [
    {
        name: "Vintage Celine Macadam",
        price: 185.0,
        oldPrice: 220.0, // كان 220 وصار 185
        brand: "Celine",
        description: "حقيبة سيلين فينتاج بنقشة الماكاديم الشهيرة. حالة ممتازة مع حزام جلدي طويل.",
        dimensions: "25cm x 18cm",
        imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?auto=format&fit=crop&w=800&q=80",
        isSoldOut: false,
        category: "bags"
    },
    {
        name: "Prada Nylon Mini Hobo",
        price: 140.0,
        oldPrice: null, // سعر ثابت بدون خصم
        brand: "Prada",
        description: "القطعة الأكثر طلباً. حقيبة برادا نايلون سوداء، عملية وأنيقة لكل المناسبات.",
        dimensions: "22cm x 14cm",
        imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?auto=format&fit=crop&w=800&q=80",
        isSoldOut: true, // نفذت الكمية (عشان نجرب الليبل الأحمر)
        category: "bags"
    },
    {
        name: "Gucci Jackie Vintage",
        price: 210.0,
        oldPrice: 250.0,
        brand: "Gucci",
        description: "أيقونة غوتشي الخالدة. جلد طبيعي أسود مع إبزيم معدني فضي.",
        dimensions: "28cm x 19cm",
        imageUrl: "https://images.unsplash.com/photo-1591561954557-26941169b49e?auto=format&fit=crop&w=800&q=80",
        isSoldOut: false,
        category: "bags"
    },
    {
        name: "YSL Clutch Patent",
        price: 195.0,
        oldPrice: null,
        brand: "YSL",
        description: "كلتش سهرة من إيف سان لوران، جلد لامع (Patent) لون عنابي.",
        dimensions: "24cm x 12cm",
        imageUrl: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?auto=format&fit=crop&w=800&q=80",
        isSoldOut: false,
        category: "accessories"
    },
    {
        name: "Christian Dior Saddle",
        price: 350.0,
        oldPrice: 400.0,
        brand: "Dior",
        description: "حقيبة ديور سادل فينتاج، قماش مونوغرام أزرق. قطعة نادرة.",
        dimensions: "26cm x 20cm",
        imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?auto=format&fit=crop&w=800&q=80",
        isSoldOut: false,
        category: "bags"
    }
];

// 4. التنفيذ
mongoose.connect(dbURI)
    .then(async () => {
        console.log('✅ Connected to MongoDB');
        
        // مسح القديم
        await Product.deleteMany({});
        console.log('🗑️  Old products deleted');

        // إضافة الجديد
        await Product.insertMany(products);
        console.log('✨ New Lady90s-style products added successfully!');
        
        mongoose.connection.close();
    })
    .catch(err => {
        console.log('❌ Error:', err);
    });