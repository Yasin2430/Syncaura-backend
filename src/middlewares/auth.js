import jwt from 'jsonwebtoken';
import User from '../models/User.js'; // make sure path is correct

export const auth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    let token = null;

    // 1. Extract the token from either the Authorization Header or Cookies
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies && req.cookies.accessToken) {
      token = req.cookies.accessToken;
    }

    // 2. Check if a token actually exists
    if (!token) {
      return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    // 3. Verify the token payload using your JWT Secret
    const payload = jwt.verify(token, process.env.JWT_ACCESS_SECRET);

    // 4. Fetch the real, up-to-date user from your MongoDB database
    const user = await User.findById(payload.sub || payload.id); 
    if (!user) {
      return res.status(401).json({ message: 'User not found' });
    }

    // 5. Attach the dynamic data to the request object
    req.user = user; 
    req.googleTokens = user.googleTokens || {};

    // 6. Role Authorization Guard (Dynamically evaluates the DB value!)
    if (req.user.role !== 'admin') {
      return res.status(403).json({ message: "Forbidden: Admin access required." });
    }

    // 7. Proceed to the next controller function if the user is an admin
    next();

  } catch (err) {
    console.error('Auth error:', err);
    return res.status(401).json({ message: 'Invalid or expired token' });
  }
};