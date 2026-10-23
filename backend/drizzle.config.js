require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
module.exports = {
  dialect: 'postgresql',
  schema: './db/schema.js',
  out: './db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL || 'postgresql://tockinax_user:CHANGE_ME_DEV_ONLY@localhost:5434/tockinax_dev' },
  strict: true,
  verbose: true,
};
