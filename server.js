const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = 3000;

// 1. إعدادات أساسية (Middleware)
app.use(cors()); // يسمح لتطبيق Flutter بالاتصال بالسيرفر
app.use(express.json()); // يسمح للسيرفر بفهم البيانات بصيغة JSON

// 2. الاتصال بقاعدة البيانات (Details Store DB)
const dbURI = "mongodb+srv://admin:Details2024Store@detailscluster.qcnnpvw.mongodb.net/?appName=DetailsCluster";

mongoose.connect(dbURI)
    .then(() => console.log('✅ تم الاتصال بقاعدة البيانات السحابية (Atlas) بنجاح!'))
    .catch(err => console.log('❌ فشل الاتصال:', err));

// 3. تصميم شكل البيانات (Product Schema)
// هذا يحدد كيف يبدو "المنتج" داخل قاعدة البيانات
const productSchema = new mongoose.Schema({
    name: String,       // اسم المنتج
    price: Number,      // السعر
    description: String,// الوصف
    imageUrl: String    // رابط الصورة
});

const Product = mongoose.model('Product', productSchema);

// 4. الروابط (Routes) - نقاط الاتصال

// رابط تجريبي للتأكد أن السيرفر يعمل
app.get('/', (req, res) => {
    res.send('Welcome to Details Store API 👜');
});

// رابط لجلب جميع المنتجات (هذا الذي سيطلبه Flutter)
app.get('/api/products', async (req, res) => {
    try {
        const products = await Product.find(); // هات كل المنتجات
        res.json(products);
    } catch (err) {
        res.status(500).json({ message: err.message });
    }
});

// رابط لإضافة منتج جديد (سنستخدمه لتعبئة البيانات)
app.post('/api/products', async (req, res) => {
    const product = new Product({
        name: req.body.name,
        price: req.body.price,
        description: req.body.description,
        imageUrl: req.body.imageUrl
    });

    try {
        const newProduct = await product.save(); // حفظ في الداتابيز
        res.status(201).json(newProduct);
    } catch (err) {
        res.status(400).json({ message: err.message });
    }
});

// 5. تشغيل السيرفر
app.listen(PORT, () => {
    console.log(`🚀 السيرفر يعمل الآن على الرابط: http://localhost:${PORT}`);
});