
import  nodemailer from  'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

// Configure email transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    // Gmail App Password or email password
    pass: process.env.EMAIL_PASS
  }
});

// Email template for task notification
const getTaskNotificationEmailTemplate = (data) => {
  return `
    <!DOCTYPE html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>New Task Message</title>
      <style>
        body { font-family: Arial, sans-serif; margin: 0; padding: 0; background-color: #f4f4f4; }
        .container { max-width: 600px; margin: 20px auto; background-color: #ffffff; padding: 20px; border-radius: 8px; box-shadow: 0 4px 8px rgba(0,0,0,0.1); }
        .header { background-color: #3b82f6; color: #ffffff; padding: 15px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { padding: 20px; }
        .button { display: inline-block; padding: 10px 20px; background-color: #3b82f6; color: #ffffff; text-decoration: none; border-radius: 5px; }
        .footer { text-align: center; font-size: 12px; color: #6b7280; margin-top: 20px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>New Task Message</h1>
        </div>
        <div class="content">
          <p>Hello,</p>
          <p>You've received a new message for a task:</p>
          <ul>
            <li><strong>Job ID:</strong> ${data.jobId || 'N/A'}</li>
            <li><strong>Task ID:</strong> ${data.taskId || 'N/A'}</li>
            <li><strong>Message:</strong> ${data.message || 'No message provided'}</li>
            <li><strong>Sender:</strong> ${data.senderName || 'Unknown'}</li>
          </ul>
          <p>Click the button below to view the task:</p>
          <p>
            <a href="${data.url || 'https://your-app.com'}" class="button">View Task</a>
          </p>
        </div>
        <div class="footer">
          <p>This is an automated email from Task Reminder. Please do not reply directly to this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Send email notification
const sendEmailNotification = async (to, subject, data) => {
  try {
    const mailOptions = {
      from: `"Task Reminder" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      html: getTaskNotificationEmailTemplate(data)
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
};
export { sendEmailNotification, getTaskNotificationEmailTemplate };
