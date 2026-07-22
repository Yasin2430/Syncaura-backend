import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // make sure path is correct

export const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) return res.status(401).json({ message: 'Unauthorized' });

    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // Fetch full user from DB to get Google tokens
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ message: 'User not found' });

    req.user = user;                  // full user object
    req.googleTokens = user.googleTokens; // attach Google tokens for meetings

    next();
  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};
