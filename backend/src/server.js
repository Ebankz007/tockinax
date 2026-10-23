const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { buildApp } = require('./app');

const app = buildApp();

const PORT = Number(process.env.PORT || 5070);
app.listen(PORT, () => console.log(`[tockinax] api on :${PORT} (${process.env.NODE_ENV || 'development'})`));
