const nodemailer = require('nodemailer');
const crypto = require('crypto');

// Email transporter configuration
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.NODEMAILER_EMAIL,
      pass: process.env.NODEMAILER_PASSWORD,
    },
  });
};

// Generate verification token
const generateVerificationToken = () => {
  return crypto.randomBytes(3).toString('hex').toUpperCase(); // 6-character hex string
};

// Generate password reset token
const generatePasswordResetToken = () => {
  return crypto.randomBytes(12).toString('hex'); // 24-character hex string
};

// Send email helper function
const sendEmail = async (options) => {
  try {
    const transporter = createTransporter();

    const mailOptions = {
      from: `"CampusConnect" <${process.env.NODEMAILER_EMAIL}>`,
      to: options.to,
      subject: options.subject,
      html: options.html,
      text: options.text
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', result.messageId);
    return true;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw new Error('Failed to send email');
  }
};

// Send welcome email
const sendWelcomeEmail = async (user) => {
  const subject = 'Welcome to CampusConnect!';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Welcome to CampusConnect</title>
      <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #253B5B; color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #253B5B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; color: #666; margin-top: 30px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Welcome to CampusConnect, ${user.name}!</h1>
        </div>
        <div class="content">
          <p>Thank you for joining CampusConnect! We're excited to help you discover amazing events and clubs on your campus.</p>

          <h3>What you can do next:</h3>
          <ul>
            <li>📅 Browse upcoming events</li>
            <li>🏫 Join interesting clubs</li>
            <li>🤝 Connect with fellow students</li>
            <li>🎯 Get personalized recommendations</li>
          </ul>

          <p>Your journey starts here. Explore everything CampusConnect has to offer!</p>

          <a href="${process.env.FRONTEND_URL}/events" class="button">Start Exploring</a>

          <p>If you have any questions, feel free to reach out to our support team.</p>

          <p>Best regards,<br>The CampusConnect Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${user.email}. If you didn't create an account, please ignore this email.</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `Welcome to CampusConnect, ${user.name}! Thank you for joining our platform. Visit ${process.env.FRONTEND_URL} to start exploring events and clubs on your campus.`
  });
};

// Send email verification with OTP
const sendEmailVerificationOTP = async (user, otp) => {
  const subject = 'Verify Your Email - CampusConnect';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification</title>
      <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #253B5B; color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .otp { background: #e3f2fd; font-size: 24px; font-weight: bold; letter-spacing: 5px; padding: 20px; text-align: center; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; color: #666; margin-top: 30px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Verify Your Email Address</h1>
        </div>
        <div class="content">
          <p>Hi ${user.name},</p>
          <p>Thank you for registering with CampusConnect! To complete your registration, please use the following OTP to verify your email address:</p>

          <div class="otp">${otp}</div>

          <p><strong>This OTP will expire in 10 minutes.</strong></p>

          <p>If you didn't request this verification, please ignore this email.</p>

          <p>Best regards,<br>The CampusConnect Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${user.email}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.name}, Your CampusConnect verification code is: ${otp}. This code will expire in 10 minutes.`
  });
};

// Send email verification with magic link
const sendEmailVerificationLink = async (user, verificationToken) => {
  const verificationUrl = `${process.env.FRONTEND_URL}/verify-email?verificationToken=${verificationToken}&email=${user.email}`;
  const subject = 'Verify Your Email - CampusConnect';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Email Verification</title>
      <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #253B5B; color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #253B5B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; color: #666; margin-top: 30px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Verify Your Email Address</h1>
        </div>
        <div class="content">
          <p>Hi ${user.name},</p>
          <p>Thank you for registering with CampusConnect! Click the button below to verify your email address and activate your account:</p>

          <a href="${verificationUrl}" class="button">Verify Email Address</a>

          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${verificationUrl}</p>

          <p><strong>This link will expire in 24 hours.</strong></p>

          <p>If you didn't request this verification, please ignore this email.</p>

          <p>Best regards,<br>The CampusConnect Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${user.email}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.name}, Verify your CampusConnect account by visiting: ${verificationUrl}. This link will expire in 24 hours.`
  });
};

// Send password reset email
const sendPasswordResetEmail = async (user, token) => {
  const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;
  const subject = 'Reset Your Password - CampusConnect';
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Password Reset</title>
      <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #253B5B; color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .button { display: inline-block; background: #dc3545; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; color: #666; margin-top: 30px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Reset Your Password</h1>
        </div>
        <div class="content">
          <p>Hi ${user.name},</p>
          <p>We received a request to reset your password for your CampusConnect account. Click the button below to set a new password:</p>

          <a href="${resetUrl}" class="button">Reset Password</a>

          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetUrl}</p>

          <p><strong>This link will expire in 15 minutes.</strong></p>

          <p>If you didn't request a password reset, please ignore this email. Your password won't be changed.</p>

          <p>Best regards,<br>The CampusConnect Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${user.email}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.name}, Reset your CampusConnect password by visiting: ${resetUrl}. This link will expire in 15 minutes.`
  });
};

// Send event registration confirmation
const sendEventRegistrationConfirmation = async (user, event) => {
  const eventUrl = `${process.env.FRONTEND_URL}/events/${event._id}`;
  const subject = `Registration Confirmed - ${event.title}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Event Registration Confirmed</title>
      <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .event-details { background: #e9ecef; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .button { display: inline-block; background: #253B5B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; color: #666; margin-top: 30px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>🎉 Registration Confirmed!</h1>
        </div>
        <div class="content">
          <p>Hi ${user.name},</p>
          <p>You have successfully registered for the following event:</p>

          <div class="event-details">
            <h3>${event.title}</h3>
            <p><strong>Date:</strong> ${new Date(event.startDate).toLocaleDateString()} at ${new Date(event.startDate).toLocaleTimeString()}</p>
            <p><strong>Location:</strong> ${event.location}</p>
            <p><strong>Category:</strong> ${event.category}</p>
            ${event.price > 0 ? `<p><strong>Price:</strong> ₹${event.price/100}</p>` : '<p><strong>Price:</strong> Free</p>'}
          </div>

          <a href="${eventUrl}" class="button">View Event Details</a>

          <p>We'll send you a reminder 24 hours before the event starts. Make sure to mark your calendar!</p>

          <p>Best regards,<br>The CampusConnect Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${user.email}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.name}, You're registered for ${event.title} on ${new Date(event.startDate).toLocaleDateString()}. View details: ${eventUrl}`
  });
};

// Send payment confirmation
const sendPaymentConfirmation = async (user, event, payment) => {
  const eventUrl = `${process.env.FRONTEND_URL}/events/${event._id}`;
  const subject = `Payment Confirmed - ${event.title}`;
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Confirmation</title>
      <style>
        body { font-family: 'Arial', sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #28a745; color: white; padding: 20px; border-radius: 10px 10px 0 0; text-align: center; }
        .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 10px 10px; }
        .payment-details { background: #d4edda; border: 1px solid #c3e6cb; padding: 20px; border-radius: 5px; margin: 20px 0; }
        .button { display: inline-block; background: #253B5B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; margin: 20px 0; }
        .footer { text-align: center; color: #666; margin-top: 30px; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>💳 Payment Confirmed!</h1>
        </div>
        <div class="content">
          <p>Hi ${user.name},</p>
          <p>Your payment has been successfully processed. Here are your payment details:</p>

          <div class="payment-details">
            <h3>${event.title}</h3>
            <p><strong>Amount Paid:</strong> ₹${payment.amount/100}</p>
            <p><strong>Transaction ID:</strong> ${payment.razorpayPaymentId}</p>
            <p><strong>Date:</strong> ${new Date(payment.createdAt).toLocaleDateString()}</p>
          </div>

          <a href="${eventUrl}" class="button">View Event Details</a>

          <p>Your registration is now confirmed. We'll send you a reminder before the event starts.</p>

          <p>Best regards,<br>The CampusConnect Team</p>
        </div>
        <div class="footer">
          <p>This email was sent to ${user.email}</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return sendEmail({
    to: user.email,
    subject,
    html,
    text: `Hi ${user.name}, Payment of ₹${payment.amount/100} confirmed for ${event.title}. Transaction ID: ${payment.razorpayPaymentId}`
  });
};

module.exports = {
  // Token generation
  generateVerificationToken,
  generatePasswordResetToken,

  // Email sending functions
  sendEmail,
  sendWelcomeEmail,
  sendEmailVerificationOTP,
  sendEmailVerificationLink,
  sendPasswordResetEmail,
  sendEventRegistrationConfirmation,
  sendPaymentConfirmation
};