/** True when deployed (Railway, Vercel, or NODE_ENV=production). */
function isProductionRuntime() {
  return (
    process.env.NODE_ENV === 'production' ||
    Boolean(process.env.VERCEL) ||
    Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_PROJECT_ID)
  );
}

module.exports = { isProductionRuntime };
