// orderEmail.js
const jwt = require('jsonwebtoken');
const Token = require('../models/token');
const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: '1h',
  });
};

const formatPrice = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return '0.00';
  }

  return number.toFixed(2);
};

const sendOrderEmail = async (type, email, data = {}) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not configured.');
    }

    if (!email) {
      throw new Error('Recipient email is required.');
    }

    let subject = '';
    let html = '';

    switch (type) {
      case 'newGuest': {
        const token = generateToken({ email });

        await Token.create({
          email,
          token,
          type: 'password_setup',
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        });

        subject = data.orderNumber
          ? `BakerBurns Order Confirmation — ${data.orderNumber}`
          : 'Welcome to BakerBurns! Complete Your Account Setup';

        html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h1 style="color: #4caf50;">Thank You for Your Order!</h1>

            <p>Hi there,</p>

            <p>
              We're thrilled to welcome you to BakerBurns! Your order has been
              placed successfully.
            </p>

            ${
              data.orderNumber
                ? `
                  <p>
                    <strong>Order number:</strong> ${data.orderNumber}
                  </p>
                `
                : ''
            }

            <p>
              To access your order history, save your favorite items, and
              receive personalized updates, please complete your account setup
              by setting a password:
            </p>

            <a
              href="${process.env.REGISTER_FRONTEND}/password-form?token=${token}"
              style="
                background: #4caf50;
                color: white;
                padding: 12px 20px;
                text-decoration: none;
                border-radius: 5px;
                font-size: 16px;
                display: inline-block;
                margin-top: 15px;
              "
            >
              Set Your Password
            </a>

            <p style="margin-top: 20px;">
              Here's a summary of your order:
            </p>

            <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
              <thead>
                <tr>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">
                    Item
                  </th>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: center;">
                    Quantity
                  </th>
                  <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">
                    Price
                  </th>
                </tr>
              </thead>

              <tbody>
                ${(data.orderItems || [])
                  .map(
                    (item) => `
                      <tr>
                        <td style="border: 1px solid #ddd; padding: 8px;">
                          ${item.name}
                        </td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: center;">
                          ${item.quantity}
                        </td>
                        <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">
                          $${formatPrice(item.price)}
                        </td>
                      </tr>
                    `
                  )
                  .join('')}
              </tbody>
            </table>

            <p style="font-size: 18px;">
              <strong>Total: $${formatPrice(data.total)}</strong>
            </p>

            <hr
              style="
                border: none;
                border-top: 1px solid #ddd;
                margin: 20px 0;
              "
            />

            <p>
              <strong>Need assistance?</strong><br />
              Contact our support team at
              <a
                href="mailto:support@bakersburns.com"
                style="color: #007bff;"
              >
                support@bakersburns.com
              </a>.
            </p>

            <p style="font-size: 12px; color: #aaa;">
              &copy; ${new Date().getFullYear()} BakerBurns. All rights reserved.
            </p>
          </div>
        `;

        break;
      }

      case 'existingUser': {
        subject = data.orderNumber
          ? `Order Confirmation — ${data.orderNumber}`
          : 'Order Confirmation';

        html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h1>Thank You for Your Purchase!</h1>

            <p>Your order has been placed successfully.</p>

            ${
              data.orderNumber
                ? `
                  <p>
                    <strong>Order number:</strong> ${data.orderNumber}
                  </p>
                `
                : ''
            }

            ${
              data.orderUrl
                ? `
                  <p>You can view your order details here:</p>

                  <a
                    href="${data.orderUrl}"
                    style="
                      background: #007bff;
                      color: white;
                      padding: 10px 15px;
                      text-decoration: none;
                      border-radius: 5px;
                      display: inline-block;
                    "
                  >
                    View Order
                  </a>
                `
                : ''
            }

            <h2>Order Summary</h2>

            <ul>
              ${(data.orderItems || [])
                .map(
                  (item) =>
                    `<li>${item.name} — ${item.quantity} × $${formatPrice(item.price)}</li>`
                )
                .join('')}
            </ul>

            <p>
              <strong>Total: $${formatPrice(data.total)}</strong>
            </p>
          </div>
        `;

        break;
      }

      case 'adminNotification': {
        subject = data.orderNumber
          ? `New Order — ${data.orderNumber}`
          : 'New Order Notification';

        html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <h1>New Order Received</h1>

            ${
              data.customerEmail
                ? `<p><strong>Customer:</strong> ${data.customerEmail}</p>`
                : ''
            }

            ${
              data.orderNumber
                ? `<p><strong>Order number:</strong> ${data.orderNumber}</p>`
                : ''
            }

            <h2>Order Summary</h2>

            <ul>
              ${(data.orderItems || [])
                .map(
                  (item) =>
                    `<li>${item.name} — ${item.quantity} × $${formatPrice(item.price)}</li>`
                )
                .join('')}
            </ul>

            <p>
              <strong>Total:</strong> $${formatPrice(data.total)}
            </p>

            <p>
              <strong>Status:</strong> ${data.status || 'processing'}
            </p>
          </div>
        `;

        break;
      }

      default:
        throw new Error(`Unknown email type: ${type}`);
    }

    const { data: resendData, error } = await resend.emails.send({
      from:
        process.env.ORDER_EMAIL_FROM ||
        'BakerBurns Orders <orders@bakersburns.com>',
      to: email
        .split(',')
        .map((address) => address.trim())
        .filter(Boolean),
      replyTo:
        process.env.ORDER_EMAIL_REPLY_TO ||
        'support@bakersburns.com',
      subject,
      html,
    });

    if (error) {
      throw new Error(
        `Resend rejected the email: ${error.message || JSON.stringify(error)}`
      );
    }

    console.log(`Email sent to ${email} through Resend:`, {
      id: resendData?.id,
      type,
    });

    return resendData;
  } catch (error) {
    console.error(`Error sending ${type} email to ${email}:`, {
      message: error.message,
      stack: error.stack,
    });

    throw error;
  }
};

module.exports = { sendOrderEmail };