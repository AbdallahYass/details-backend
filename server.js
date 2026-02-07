require('dotenv').config(); // حماية البيانات الحساسة مثل رابط قاعدة البيانات
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Middleware
app.use(cors()); 
app.use(express.json());

// 2. الاتصال بقاعدة البيانات (MongoDB Atlas)
// نصيحة: استبدل الرابط في ملف .env لحمايته عند الرفع عبر GitHub Actions
const dbURI = process.env.MONGODB_URI || "mongodb+srv://admin:Details2024Store@detailscluster.qcnnpvw.mongodb.net/?appName=DetailsCluster";

mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to Details Store Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// 3. Schema المطور (لدعم "تفاصيل" موقع Lady90s)
const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    brand: { type: String, uppercase: true }, // الماركة دائماً Capital للفخامة
    description: String,
    price: { type: Number, required: true },
    oldPrice: Number,
    dimensions: String,
    // تغيير imageUrl لمصفوفة ليدعم تأثير الـ Hover (صورتين أو أكثر)
    images: [{ type: String, required: true }], 
    category: { type: String, default: 'unlisted' },
    isSoldOut: { type: Boolean, default: false },
    featured: { type: Boolean, default: false } // للمنتجات التي تظهر في الـ Hero Section
}, { timestamps: true }); // يضيف تلقائياً وقت الإنشاء والتحديث

const Product = mongoose.model('Product', productSchema);

// 4. الروابط (Routes)

// جلب المنتجات مع إمكانية الفلترة حسب التصنيف
app.get('/api/products', async (req, res) => {
    try {
        const { category } = req.query;
        const query = category ? { category } : {};
        const products = await Product.find(query).sort({ createdAt: -1 });
        res.status(200).json(products);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب البيانات", error: err.message });
    }
});

// جلب تفاصيل منتج معين (مهم جداً لصفحة Details)
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: "المنتج غير موجود" });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب تفاصيل المنتج" });
    }
});

// إضافة منتج جديد
app.post('/api/products', async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (err) {
        res.status(400).json({ message: "تأكد من إدخال البيانات بشكل صحيح", error: err.message });
    }
});

// 5. تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Server is running on port: ${PORT}`);
});