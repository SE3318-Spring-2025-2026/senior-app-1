require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./models/User');

async function createAdmin() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/senior-app');
  
  const admin = new User({
    email: 'admin@example.com',
    fullName: 'Admin User',
    role: 'ADMIN',
    status: 'ACTIVE',
  });
  
  await admin.save();
  console.log('Admin user created with id:', admin._id);
  mongoose.connection.close();
}

createAdmin().catch(console.error);