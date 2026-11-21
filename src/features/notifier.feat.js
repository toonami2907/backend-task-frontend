import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: process.env.EMAIL_PORT,
  secure: false, // Use TLS
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

export const sendUserAgentChangeNotification = async (email, newUserAgent, oldUserAgent, ipAddress) => {
  try {
    await transporter.sendMail({
      from: process.env.EMAIL_USER,
      to: process.env.NOTIFY_EMAIL,
      subject: `Suspicious Login Attempt for ${email}`,
      text: `
        A login attempt was made for ${email} with a different UserAgent.
        New UserAgent: ${newUserAgent}
        Previous UserAgent: ${oldUserAgent}
        IP Address: ${ipAddress}
        Time: ${new Date().toISOString()}
      `,
    });
    console.log(`Notification sent for UserAgent change: ${email}`);
  } catch (err) {
    console.error(`Failed to send notification for ${email}:`, err);
  }
};