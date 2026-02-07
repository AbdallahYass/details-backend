require('dotenv').config(); 
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// 1. Middleware
app.use(cors()); 
app.use(express.json());

// 2. الاتصال بقاعدة البيانات (MongoDB Atlas)
const dbURI = process.env.MONGODB_URI || "mongodb+srv://admin:Details2024Store@detailscluster.qcnnpvw.mongodb.net/?appName=DetailsCluster";

mongoose.connect(dbURI)
    .then(() => console.log('✅ Connected to Details Store Database'))
    .catch(err => console.error('❌ Database Connection Error:', err));

// 3. تعريف الـ Schemas

// قالب المنتجات (يدعم Hover Effect عبر مصفوفة images)
const productSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    brand: { type: String, uppercase: true, default: 'DETAILS' },
    description: String,
    price: { type: Number, required: true },
    oldPrice: Number,
    dimensions: String,
    imageUrl: { type: String, required: true }, // الصورة الأساسية
    images: [String], // قائمة الصور (الصورة الثانية تستخدم للـ Hover في Flutter)
    category: { type: String, default: 'unlisted' },
    isSoldOut: { type: Boolean, default: false },
    featured: { type: Boolean, default: false }
}, { timestamps: true });

const Product = mongoose.model('Product', productSchema);

// قالب الإعلانات (Banners)
const bannerSchema = new mongoose.Schema({
    title: { type: String, required: true },
    imageUrl: { type: String, required: true },
    buttonText: { type: String, default: "اكتشف ديتيلز" },
    link: String
}, { timestamps: true });

const Banner = mongoose.model('Banner', bannerSchema);

// 4. الروابط (Routes)

// --- روابط المنتجات (CRUD Operations) ---

// جلب الكل
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

// جلب منتج واحد بالتفصيل
app.get('/api/products/:id', async (req, res) => {
    try {
        const product = await Product.findById(req.params.id);
        if (!product) return res.status(404).json({ message: "المنتج غير موجود" });
        res.json(product);
    } catch (err) {
        res.status(500).json({ message: "خطأ في السيرفر" });
    }
});

// إضافة منتج جديد
app.post('/api/products', async (req, res) => {
    try {
        const newProduct = new Product(req.body);
        const savedProduct = await newProduct.save();
        res.status(201).json(savedProduct);
    } catch (err) {
        res.status(400).json({ message: "بيانات غير صالحة", error: err.message });
    }
});

// تعديل منتج (مهم للوحة التحكم)
app.put('/api/products/:id', async (req, res) => {
    try {
        const updatedProduct = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
        res.json(updatedProduct);
    } catch (err) {
        res.status(400).json({ message: "فشل التحديث" });
    }
});

// حذف منتج
app.delete('/api/products/:id', async (req, res) => {
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
        const banners = await Banner.find().sort({ createdAt: -1 });
        res.status(200).json(banners);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب الإعلانات" });
    }
});

app.post('/api/banners', async (req, res) => {
    try {
        const newBanner = new Banner(req.body);
        const savedBanner = await newBanner.save();
        res.status(201).json(savedBanner);
    } catch (err) {
        res.status(400).json({ message: "فشل إضافة الإعلان" });
    }
});

app.delete('/api/banners/:id', async (req, res) => {
    try {
        await Banner.findByIdAndDelete(req.params.id);
        res.json({ message: "تم حذف الإعلان" });
    } catch (err) {
        res.status(500).json({ message: "خطأ في الحذف" });
    }
});

// 5. تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Details Backend is running on port: ${PORT}`);
});