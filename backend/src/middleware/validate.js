// Zod validation wrapper — parses req parts, 400s with machine-readable details.
// Usage: router.post('/x', validate({ body: mySchema }), handler)
const { ZodError } = require('zod');

function validate(schemas = {}) {
  return (req, res, next) => {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      if (schemas.query) req.query = schemas.query.parse(req.query);
      if (schemas.params) req.params = schemas.params.parse(req.params);
      return next();
    } catch (e) {
      if (e instanceof ZodError || e?.name === 'ZodError') {
        return res.status(400).json({ error: 'validation_error', issues: e.issues });
      }
      return next(e);
    }
  };
}

module.exports = { validate };
