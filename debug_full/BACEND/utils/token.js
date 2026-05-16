const jwt = require('jsonwebtoken');

function generateToken(user) {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not defined in the environment variables');
  }

  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      isAdmin: Boolean(user.is_admin)
    },
    process.env.JWT_SECRET,
    { expiresIn: '7d' }
  );
}

module.exports = { generateToken };