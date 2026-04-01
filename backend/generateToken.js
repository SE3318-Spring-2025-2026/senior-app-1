const jwt = require('jsonwebtoken');
require('dotenv').config();

const payload = { id: '69cce9bbb78e5bea8cbb6348', role: 'ADMIN' };
const token = jwt.sign(payload, process.env.JWT_SECRET);
console.log('Admin JWT Token:', token);