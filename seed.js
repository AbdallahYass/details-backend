const mongoose = require('mongoose');

// تعريف الـ Schema
const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    description: String,
    imageUrl: String
});

const Product = mongoose.model('Product', productSchema);

// البيانات
const products = [
    {
        name: "Classic Leather Totebag",
        price: 120.00,
        description: "حقيبة جلدية فاخرة.",
        imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80"
    },
    {
        name: "Golden Elegance Watch",
        price: 250.50,
        description: "ساعة ذهبية عصرية.",
        imageUrl: "https://images.unsplash.com/photo-1524592094714-0f0654e20314?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80"
    }
];

// دالة التشغيل الرئيسية
const seedDB = async () => {
    try {
        // 1. الاتصال (نستخدم 127.0.0.1 بدلاً من localhost)
        await mongoose.connect('mongodb://127.0.0.1:27017/details_store');
        console.log('✅ تم الاتصال بقاعدة البيانات');

        // 2. مسح القديم
        await Product.deleteMany({});
        console.log('🗑️ تم مسح البيانات القديمة');

        // 3. إضافة الجديد
        await Product.insertMany(products);
        console.log('✨ تم إضافة المنتجات الجديدة بنجاح!');

    } catch (err) {
        console.log('❌ حدث خطأ:', err);
    } finally {
        // 4. إغلاق الاتصال
        await mongoose.connection.close();
        console.log('👋 تم إغلاق الاتصال');
    }
};

seedDB();