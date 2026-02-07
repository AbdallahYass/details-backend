const mongoose = require('mongoose');

// تعريف شكل المنتج (نفس الموجود في server.js)
const productSchema = new mongoose.Schema({
    name: String,
    price: Number,
    description: String,
    imageUrl: String
});

const Product = mongoose.model('Product', productSchema);

// 🔴 هام جداً: استبدل هذا الرابط برابط Atlas الخاص بك (نفس الموجود في server.js)
const dbURI = "mongodb+srv://admin:Details2024Store@detailscluster.qcnnpvw.mongodb.net/?appName=DetailsCluster";

// قائمة المنتجات الفخمة
const products = [
    {
        name: "Classic Leather Tote",
        price: 120.0,
        description: "حقيبة جلدية سوداء كلاسيكية، مثالية للعمل والاجتماعات الرسمية. تتسع للابتوب ومستلزماتك اليومية.",
        imageUrl: "https://images.unsplash.com/photo-1584917865442-de89df76afd3?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80"
    },
    {
        name: "Minimalist Beige Handbag",
        price: 95.0,
        description: "حقيبة يد بلون بيج هادئ، تصميم مينيمالي عصري يناسب الإطلالات الصباحية والمسائية.",
        imageUrl: "https://images.unsplash.com/photo-1590874103328-eac38a683ce7?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80"
    },
    {
        name: "Vintage Crossbody Bag",
        price: 85.0,
        description: "حقيبة كروس بنمط فينتاج، مصنوعة من الجلد البني المعالج. عملية وأنيقة للسفر والطلعات الخفيفة.",
        imageUrl: "https://images.unsplash.com/photo-1591561954557-26941169b49e?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80"
    },
    {
        name: "Details Signature Clutch",
        price: 150.0,
        description: "كلتش سهرة فاخر من مجموعة Details الحصرية. تصميم لامع يناسب المناسبات الخاصة.",
        imageUrl: "https://images.unsplash.com/photo-1566150905458-1bf1fc113f0d?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80"
    },
    {
        name: "Urban Canvas Backpack",
        price: 70.0,
        description: "حقيبة ظهر قماشية متينة وعملية، مناسبة للجامعة والرحلات اليومية.",
        imageUrl: "https://images.unsplash.com/photo-1553062407-98eeb64c6a62?ixlib=rb-1.2.1&auto=format&fit=crop&w=800&q=80"
    }
];

// الاتصال وإضافة المنتجات
mongoose.connect(dbURI)
    .then(async () => {
        console.log('✅ تم الاتصال بقاعدة البيانات السحابية');
        
        // مسح المنتجات القديمة (اختياري، عشان ما يصير تكرار)
        await Product.deleteMany({});
        console.log('🗑️  تم مسح البيانات القديمة');

        // إضافة المنتجات الجديدة
        await Product.insertMany(products);
        console.log('🎉 تم إضافة منتجات Details Store بنجاح!');
        
        mongoose.connection.close();
    })
    .catch(err => {
        console.log('❌ خطأ:', err);
    });