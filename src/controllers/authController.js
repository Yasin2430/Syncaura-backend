import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { validationResult } from 'express-validator';
import User from '../models/User.js';
import { generateAccessToken, generateRefreshToken, assignRefreshId } from '../utils/generateTokens.js';
import { sendEmail, sendResetEmail } from '../utils/email.js';
import { generateOtp } from '../utils/otp.js';
import ROLES from "../config/roles.js";


const handleValidation = (req) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const err = new Error('Validation error');
    err.status = 422;
    err.details = errors.array();
    throw err;
  }
};

export const register = async (req, res, next) => {
  try {
    handleValidation(req);
    const { name, email, password, role } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ message: 'Email already registered' });

    const passwordHash = await User.hashPassword(password);
    const allowedRoles = Object.values(ROLES);
    const finalRole = allowedRoles.includes(role) ? role : ROLES.USER;

    const user = await User.create({
      name,
      email,
      passwordHash,
      role: finalRole
    });

    const rid = assignRefreshId(user);
    await user.save();
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user, rid);

    // 🔥 SMTP ALERT TRIGGER
    await sendEmail(
      email,
      "Welcome to Syncaura 🎉",
      `<h2>Welcome ${name}</h2>`
    );

    res.status(201).json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      tokens: { accessToken, refreshToken }
    });
  } catch (err) { next(err); }
};

export const login = async (req, res, next) => {
  try {
    handleValidation(req);
    const { email, password } = req.body;

    const user = await User.findOne({ email, isActive: true });
    if (!user) return res.status(401).json({ message: 'Invalid credentials' });

    const ok = await user.comparePassword(password);
    if (!ok) return res.status(401).json({ message: 'Invalid credentials' });

    const rid = assignRefreshId(user);
    await user.save();
    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user, rid);

    res.json({
      user: { id: user._id, name: user.name, email: user.email, role: user.role },
      tokens: { accessToken, refreshToken }
    });
  } catch (err) { next(err); }
};

export const refresh = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) return res.status(400).json({ message: 'Missing refreshToken' });

    const payload = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const userId = payload.sub;
    const rid = payload.rid;

    const user = await User.findById(userId);
    if (!user || user.refreshTokenId !== rid) {
      return res.status(401).json({ message: 'Invalid refresh token' });
    }

    const accessToken = generateAccessToken(user);
    res.json({ accessToken });
  } catch (err) {
    return res.status(401).json({ message: 'Invalid or expired refresh token' });
  }
};

export const changePassword = async (req, res, next) => {
  try {
    handleValidation(req);
    const userId = req.user?.id;
    const { currentPassword, newPassword } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const ok = await user.comparePassword(currentPassword);
    if (!ok) return res.status(400).json({ message: 'Current password is incorrect' });

    user.passwordHash = await User.hashPassword(newPassword);
    user.refreshTokenId = null;
    await user.save();

    res.json({ message: 'Password changed successfully' });
  } catch (err) { next(err); }
};

export const requestPasswordOtp = async (req, res, next) => {
  try {
    const userId = req.user?.id;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const otp = generateOtp();
    user.otpCode = otp;
    user.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes
    await user.save();

    console.log(`Generated OTP for ${user.email}: ${otp}`);

    res.json({ message: 'OTP generated (printed in server console)' });

    // 🔥 SMTP ALERT
    await sendPasswordOtpEmail({
      to: user.email,
      name: user.name,
      otp
    });
  } catch (err) { next(err); }
};

export const changePasswordWithOtp = async (req, res, next) => {
  try {
    handleValidation(req);
    const { otp, newPassword } = req.body;
    const userId = req.user?.id;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (!user.otpCode || user.otpCode !== otp) {
      return res.status(400).json({ message: 'Invalid OTP' });
    }
    if (!user.otpExpiresAt || user.otpExpiresAt < new Date()) {
      return res.status(400).json({ message: 'OTP expired' });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    user.otpCode = null;
    user.otpExpiresAt = null;
    user.refreshTokenId = null; // invalidate refresh
    await user.save();
    // after password updated

    await sendPasswordChangedEmail({
      to: user.email,
      name: user.name
    });

    res.json({ message: 'Password changed successfully' });
  } catch (err) { next(err); }
};

export const forgotPassword = async (req, res, next) => {
  try {
    handleValidation(req);
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.json({ message: 'If that email exists, a reset link has been sent' });
    }

    const resetPayload = { sub: String(user._id) };
    const token = jwt.sign(
      resetPayload,
      process.env.RESET_TOKEN_SECRET,
      { expiresIn: `${process.env.RESET_TOKEN_EXPIRES_MIN || 15}m` }
    );

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    user.resetTokenHash = tokenHash;
    user.resetTokenExpiresAt = new Date(Date.now() + Number(process.env.RESET_TOKEN_EXPIRES_MIN) * 60_000);
    await user.save();

    await sendResetEmail({ to: user.email, name: user.name, token });

    res.json({ message: 'If that email exists, a reset link has been sent' });
  } catch (err) { next(err); }
};

export const resetPassword = async (req, res, next) => {
  try {
    handleValidation(req);
    const { token, newPassword } = req.body;

    const payload = jwt.verify(token, process.env.RESET_TOKEN_SECRET);
    const user = await User.findById(payload.sub);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    if (!user.resetTokenHash || user.resetTokenHash !== tokenHash) {
      return res.status(400).json({ message: 'Invalid reset token' });
    }
    if (!user.resetTokenExpiresAt || user.resetTokenExpiresAt < new Date()) {
      return res.status(400).json({ message: 'Reset token expired' });
    }

    user.passwordHash = await User.hashPassword(newPassword);
    user.resetTokenHash = null;
    user.resetTokenExpiresAt = null;
    user.refreshTokenId = null;
    await user.save();

    res.json({ message: 'Password reset successful' });
  } catch (err) {
    if (err.name === 'JsonWebTokenError' || err.name === 'TokenExpiredError') {
      return res.status(400).json({ message: 'Invalid or expired reset token' });
    }
    next(err);
  }
};

export const adminOnly = async (req, res) => {
  res.json({ message: 'Hello Admin!' });
};
