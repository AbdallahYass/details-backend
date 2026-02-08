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
    featured: { type: Boolean, default: false }
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
    link: String
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

// 4. الروابط (Routes)

// --- روابط المنتجات (CRUD Operations) ---

// جلب الكل
app.get('/api/products', async (req, res) => {
    try {
        const { category } = req.query;
        let query = {};

        if (category) {
            const categoryDoc = await Category.findOne({ slug: category });
            if (!categoryDoc) return res.status(200).json([]); // إذا لم يوجد التصنيف، أعد قائمة فارغة
            query.category = categoryDoc._id;
        }

        const products = await Product.find(query)
            .sort({ createdAt: -1 })
            .populate('category'); // جلب تفاصيل التصنيف مع المنتج
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
app.post('/api/products', async (req, res) => {
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
            // أ) التحقق مما إذا كان ID صالح وموجود مسبقاً
            if (mongoose.Types.ObjectId.isValid(category)) {
                const exists = await Category.exists({ _id: category });
                if (exists) categoryId = category;
            }

            // ب) إذا لم يكن ID، نعامله كاسم/Slug وننشئه تلقائياً إذا لم يوجد
            if (!categoryId) {
                const slug = category.trim().toLowerCase().replace(/\s+/g, '-');
                let existingCategory = await Category.findOne({ slug });
                
                if (existingCategory) {
                    categoryId = existingCategory._id;
                } else {
                    // إنشاء تصنيف جديد تلقائياً
                    const newCategory = new Category({
                        name: { ar: category, en: category }, // نستخدم نفس الاسم للغتين مؤقتاً
                        slug: slug,
                        imageUrl: "https://placehold.co/600x400?text=New+Category"
                    });
                    const savedCategory = await newCategory.save();
                    categoryId = savedCategory._id;
                }
            }
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

// --- روابط التصنيفات (Categories) ---

app.get('/api/categories', async (req, res) => {
    try {
        const categories = await Category.find();
        res.status(200).json(categories);
    } catch (err) {
        res.status(500).json({ message: "خطأ في جلب التصنيفات" });
    }
});

app.post('/api/categories', async (req, res) => {
    try {
        const newCategory = new Category(req.body);
        const savedCategory = await newCategory.save();
        res.status(201).json(savedCategory);
    } catch (err) {
        res.status(400).json({ message: "فشل إضافة التصنيف" });
    }
});

// 5. تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 Details Backend is running on port: ${PORT}`);
});