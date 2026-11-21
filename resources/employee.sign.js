import jwt from 'jsonwebtoken'
import {config} from 'dotenv';
config();


const SECRET_ACCESS_KEY = process.env.EMPLOYEE_JWT_SECRET || 'access_secret';
const SECRET_REFRESH_KEY = process.env.EMPLOYEE_JWT_SECRET_REFRESH || 'refresh_secret';

// Generate Access Token
export const EmgenerateAccessToken = (user) => {
  return jwt.sign(user, SECRET_ACCESS_KEY, { expiresIn: '7d' }); 
};

// Generate Refresh Token
export const EmgenerateRefreshToken = (user) => {
  return jwt.sign(user, SECRET_REFRESH_KEY, { expiresIn: '30d' }); 
};