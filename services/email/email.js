import nodemailer from 'nodemailer';
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import handlebars from 'handlebars';

config();

// Get directory name in ES module
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

try {
    const baseTemplate = fs.readFileSync(path.join(__dirname, '../../src/templates/emails/base.html'), 'utf-8');
    handlebars.registerPartial('base', baseTemplate);
  } catch (error) {
    console.error('Error registering email template partials:', error);
  }
/**
 * Creates a configured email transporter based on environment
 * @returns {object} Nodemailer transporter
 */
const createTransporter = async () => {
  const authUser = process.env.NODEMAILER_ADDRESS || process.env.EMAIL_USER;
  const authPass = process.env.NODEMAILER_APP_PASSWORD || process.env.EMAIL_PASS;
  const hasAuth = Boolean(authUser && authPass);

  // Prefer explicit SMTP host if provided
  if (process.env.EMAIL_HOST) {
    return nodemailer.createTransport({
      host: process.env.EMAIL_HOST,
      port: process.env.EMAIL_PORT ? Number(process.env.EMAIL_PORT) : 587,
      secure: process.env.EMAIL_SECURE === 'true',
      ...(hasAuth ? { auth: { user: authUser, pass: authPass } } : {}),
    });
  }

  // Use Gmail (or provided service) when credentials exist, regardless of NODE_ENV
  if (hasAuth) {
    return nodemailer.createTransport({
      service: process.env.EMAIL_SERVICE || 'gmail',
      auth: {
        user: authUser,
        pass: authPass,
      },
    });
  }

  // For development - use Ethereal test account if requested
  if (process.env.EMAIL_TEST_SERVICE === 'ethereal') {
    const account = await nodemailer.createTestAccount();
    console.log('Ethereal Email Account:', account);
    return nodemailer.createTransport({
      host: account.smtp.host,
      port: account.smtp.port,
      secure: account.smtp.secure,
      auth: {
        user: account.user,
        pass: account.pass,
      },
    });
  }

  // Default to Mailtrap when credentials exist
  if (process.env.MAILTRAP_USER && process.env.MAILTRAP_PASS) {
    return nodemailer.createTransport({
      host: process.env.MAILTRAP_HOST || 'smtp.mailtrap.io',
      port: process.env.MAILTRAP_PORT ? Number(process.env.MAILTRAP_PORT) : 2525,
      auth: {
        user: process.env.MAILTRAP_USER,
        pass: process.env.MAILTRAP_PASS,
      },
    });
  }

  console.warn('Email credentials are missing. Using jsonTransport for dev.');
  return nodemailer.createTransport({ jsonTransport: true });
};

/**
 * Loads an email template and compiles it with Handlebars
 * @param {string} templateName - Name of the template file (without extension)
 * @param {object} data - Data to inject into the template
 * @returns {string} Compiled HTML
 */
const loadTemplate = (templateName, data) => {
  try {
    const templatePath = path.join(__dirname, '../templates/emails', `${templateName}.html`);
    const source = fs.readFileSync(templatePath, 'utf-8');
    const template = handlebars.compile(source);
    return template(data);
  } catch (error) {
    console.error(`Error loading email template ${templateName}:`, error);
    // Fallback to basic template if file not found
    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
        <h2 style="color: #333;">${data.subject || 'Notification'}</h2>
        <p>${data.message}</p>
        <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
        <p style="color: #777; font-size: 12px;">© ${new Date().getFullYear()} All rights reserved.</p>
      </div>
    `;
  }
};

/**
 * Sends an email
 * @param {object} options - Email options
 * @param {string} options.email - Recipient email
 * @param {string} options.subject - Email subject
 * @param {string} options.message - Email message (plain text)
 * @param {string} options.template - Template name (optional)
 * @param {object} options.templateData - Data for template (optional)
 * @param {array} options.attachments - Array of attachments (optional)
 * @returns {Promise} Result of sending email
 */
export const sendEmail = async (options) => {
  try {
    const transporter = await createTransporter();
    
    // Prepare email content
    let html;
    if (options.template) {
      html = loadTemplate(options.template, {
        ...options.templateData,
        subject: options.subject,
        message: options.message,
      });
    } else if (options.html) {
      html = options.html;
    } else {
      // Basic HTML wrapper for plain text message
      html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #eee;">
          <h2 style="color: #333;">${options.subject}</h2>
          <p>${options.message.replace(/\n/g, '<br>')}</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #777; font-size: 12px;">© ${new Date().getFullYear()} All rights reserved.</p>
        </div>
      `;
    }

    // Configure email options
    const mailOptions = {
      from: options.from || process.env.EMAIL_FROM,
      to: options.email,
      subject: options.subject,
      text: options.message, // Plain text version
      html: html, // HTML version
    };

    // Add attachments if provided
    if (options.attachments && Array.isArray(options.attachments)) {
      mailOptions.attachments = options.attachments;
    }

    // Send email
    const info = await transporter.sendMail(mailOptions);
    
    // Log preview URL in development
    if (process.env.NODE_ENV !== 'production' && process.env.EMAIL_TEST_SERVICE === 'ethereal') {
      console.log('Email Preview URL:', nodemailer.getTestMessageUrl(info));
    }
    
    return info;
  } catch (error) {
    console.error('Error sending email:', error);
    throw new Error(`Could not send email: ${error.message}`);
  }
};

/**
 * Sends a welcome email to a new user
 * @param {object} user - User object with email and name
 * @returns {Promise} Result of sending email
 */
export const sendWelcomeEmail = async (user) => {
  return sendEmail({
    email: user.email,
    subject: 'Welcome',
    template: 'welcome',
    templateData: {
      name: user.firstName || 'Traveler',
      loginUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/auth/login`,
    },
  });
};

/**
 * Sends a password reset email
 * @param {object} user - User object with email and name
 * @param {string} resetToken - Password reset token
 * @param {string} userType - Type of user ('user' or 'admin')
 * @returns {Promise} Result of sending email
 */
export const sendPasswordResetEmail = async (user, resetToken, userType = 'user') => {
  const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/${userType === 'admin' ? 'admin/' : ''}reset-password/${resetToken}`;
  
  return sendEmail({
    email: user.email,
    subject: 'Password Reset Request',
    template: 'password-reset',
    templateData: {
      name: user.firstName || 'User',
      resetUrl,
      expiryTime: '10 minutes',
    },
  });
};

/**
 * Sends a booking confirmation email
 * @param {object} booking - Booking details
 * @param {object} user - User who made the booking
 * @param {object} packageDetails - Package details
 * @returns {Promise} Result of sending email
 */
export const sendBookingConfirmationEmail = async (booking, user, packageDetails) => {
  return sendEmail({
    email: user.email,
    subject: 'Booking Confirmation',
    template: 'booking-confirmation',
    templateData: {
      name: user.firstName || 'Traveler',
      bookingId: booking._id,
      packageName: packageDetails.title || 'Travel Package',
      bookingDate: new Date(booking.createdAt).toLocaleDateString(),
      dashboardUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/user/applications`,
    },
  });
};

/**
 * Sends a notification email to admins about a new booking
 * @param {object} booking - Booking details
 * @param {object} user - User who made the booking
 * @param {object} packageDetails - Package details
 * @returns {Promise} Result of sending email
 */
export const sendAdminBookingNotification = async (booking, user, packageDetails) => {
  const adminEmails = process.env.ADMIN_NOTIFICATION_EMAILS?.split(',') || [];
  if (adminEmails.length === 0) return null;
  
  return sendEmail({
    email: adminEmails.join(','),
    subject: 'New Booking Notification',
    template: 'admin-booking-notification',
    templateData: {
      bookingId: booking._id,
      packageName: packageDetails.title || 'Travel Package',
      customerName: `${user.firstName} ${user.lastName}`,
      customerEmail: user.email,
      bookingDate: new Date(booking.createdAt).toLocaleDateString(),
      adminUrl: `${process.env.FRONTEND_URL || 'http://localhost:3000'}/admin/bookings/${booking._id}`,
    },
  });
};

export default {
  sendEmail,
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendBookingConfirmationEmail,
  sendAdminBookingNotification,
};
