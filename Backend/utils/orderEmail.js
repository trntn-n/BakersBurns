// utils/orderEmail.js

const jwt = require("jsonwebtoken");
const Token = require("../models/token");
const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

/*
 * Escape values inserted into email HTML.
 *
 * This prevents product names, statuses, or other database values
 * from accidentally breaking the generated markup.
 */
const escapeHtml = (value) => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
};

const formatPrice = (value) => {
  const number = Number(value);

  if (!Number.isFinite(number)) {
    return "0.00";
  }

  return number.toFixed(2);
};

/*
 * Creates a complete, publicly accessible image URL.
 *
 * Supported item formats:
 *
 * {
 *   image: "https://api.bakersburns.com/uploads/product.webp"
 * }
 *
 * {
 *   thumbnail: "product.webp"
 * }
 *
 * {
 *   thumbnail: "/uploads/product.webp"
 * }
 */
const resolveImageUrl = (item = {}) => {
  const imageValue = item.image || item.thumbnail || null;

  if (!imageValue) {
    return null;
  }

  const image = String(imageValue).trim();

  if (!image) {
    return null;
  }

  if (
    image.startsWith("https://") ||
    image.startsWith("http://")
  ) {
    return image;
  }

  const imageBaseUrl =
    process.env.IMAGE_BASE_URL ||
    process.env.API_BASE_URL ||
    "";

  if (!imageBaseUrl) {
    console.warn(
      "Cannot create product image URL because IMAGE_BASE_URL is not configured."
    );

    return null;
  }

  const cleanBaseUrl = imageBaseUrl.replace(/\/+$/, "");
  const cleanImagePath = image.replace(/^\/+/, "");

  /*
   * If the database already contains uploads/example.webp,
   * do not add uploads/ again.
   */
  if (cleanImagePath.startsWith("uploads/")) {
    return `${cleanBaseUrl}/${cleanImagePath}`;
  }

  return `${cleanBaseUrl}/uploads/${cleanImagePath}`;
};

/*
 * Product image cell shared by all email types.
 */
const createProductImageHtml = (
  item,
  {
    width = 70,
    height = 70,
  } = {}
) => {
  const imageUrl = resolveImageUrl(item);

  if (!imageUrl) {
    return `
      <div
        style="
          width: ${width}px;
          height: ${height}px;
          border: 1px solid #e1e1e1;
          border-radius: 8px;
          background-color: #f5f5f5;
          color: #888888;
          font-family: Arial, sans-serif;
          font-size: 11px;
          line-height: ${height}px;
          text-align: center;
        "
      >
        No image
      </div>
    `;
  }

  return `
    <img
      src="${escapeHtml(imageUrl)}"
      alt="${escapeHtml(item.name || "Product")}"
      width="${width}"
      height="${height}"
      style="
        display: block;
        width: ${width}px;
        height: ${height}px;
        max-width: ${width}px;
        border: 0;
        border-radius: 8px;
        object-fit: cover;
      "
    />
  `;
};

/*
 * Shared order-items table.
 *
 * Email layouts work more consistently when built with tables
 * rather than flexbox or grid.
 */
const createOrderItemsTable = (orderItems = []) => {
  if (!Array.isArray(orderItems) || orderItems.length === 0) {
    return `
      <p style="color: #777777;">
        No order items were provided.
      </p>
    `;
  }

  const rows = orderItems
    .map((item) => {
      const quantity = Number(item.quantity);

      const safeQuantity =
        Number.isFinite(quantity) && quantity > 0
          ? quantity
          : 1;

      return `
        <tr>
          <td
            width="90"
            style="
              width: 90px;
              padding: 12px;
              border-bottom: 1px solid #dddddd;
              vertical-align: middle;
            "
          >
            ${createProductImageHtml(item)}
          </td>

          <td
            style="
              padding: 12px;
              border-bottom: 1px solid #dddddd;
              vertical-align: middle;
            "
          >
            <div
              style="
                margin-bottom: 4px;
                color: #222222;
                font-size: 16px;
                font-weight: bold;
              "
            >
              ${escapeHtml(item.name || "Product")}
            </div>

            <div style="color: #555555; font-size: 14px;">
              Quantity: ${safeQuantity}
            </div>
          </td>

          <td
            width="110"
            style="
              width: 110px;
              padding: 12px;
              border-bottom: 1px solid #dddddd;
              vertical-align: middle;
              text-align: right;
              white-space: nowrap;
            "
          >
            <div style="font-size: 14px;">
              $${formatPrice(item.price)} each
            </div>

            <div
              style="
                margin-top: 4px;
                font-size: 15px;
                font-weight: bold;
              "
            >
              $${formatPrice(
                Number(item.price) * safeQuantity
              )}
            </div>
          </td>
        </tr>
      `;
    })
    .join("");

  return `
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="
        width: 100%;
        margin: 20px 0;
        border: 1px solid #dddddd;
        border-collapse: collapse;
        background-color: #ffffff;
      "
    >
      <thead>
        <tr style="background-color: #f6f6f6;">
          <th
            style="
              padding: 10px;
              border-bottom: 1px solid #dddddd;
              text-align: left;
            "
          >
            Image
          </th>

          <th
            style="
              padding: 10px;
              border-bottom: 1px solid #dddddd;
              text-align: left;
            "
          >
            Item
          </th>

          <th
            style="
              padding: 10px;
              border-bottom: 1px solid #dddddd;
              text-align: right;
            "
          >
            Price
          </th>
        </tr>
      </thead>

      <tbody>
        ${rows}
      </tbody>
    </table>
  `;
};

const createOrderTotalHtml = (total) => {
  return `
    <table
      role="presentation"
      width="100%"
      cellpadding="0"
      cellspacing="0"
      border="0"
      style="
        width: 100%;
        margin-top: 16px;
        border-collapse: collapse;
      "
    >
      <tr>
        <td
          style="
            padding: 12px;
            background-color: #f6f6f6;
            font-size: 18px;
            text-align: right;
          "
        >
          <strong>
            Total: $${formatPrice(total)}
          </strong>
        </td>
      </tr>
    </table>
  `;
};

const createEmailLayout = ({
  title,
  content,
  titleColor = "#222222",
}) => {
  return `
    <!doctype html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        />
        <title>${escapeHtml(title)}</title>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background-color: #f3f3f3;
          font-family: Arial, Helvetica, sans-serif;
          color: #333333;
        "
      >
        <table
          role="presentation"
          width="100%"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="width: 100%; background-color: #f3f3f3;"
        >
          <tr>
            <td align="center" style="padding: 24px 12px;">
              <table
                role="presentation"
                width="100%"
                cellpadding="0"
                cellspacing="0"
                border="0"
                style="
                  width: 100%;
                  max-width: 680px;
                  border-collapse: collapse;
                  background-color: #ffffff;
                  border-radius: 10px;
                  overflow: hidden;
                "
              >
                <tr>
                  <td style="padding: 28px;">
                    <h1
                      style="
                        margin: 0 0 18px;
                        color: ${titleColor};
                        font-size: 28px;
                        line-height: 1.25;
                      "
                    >
                      ${escapeHtml(title)}
                    </h1>

                    ${content}

                    <hr
                      style="
                        margin: 28px 0 20px;
                        border: none;
                        border-top: 1px solid #dddddd;
                      "
                    />

                    <p
                      style="
                        margin: 0;
                        color: #888888;
                        font-size: 12px;
                        text-align: center;
                      "
                    >
                      &copy; ${new Date().getFullYear()}
                      BakerBurns. All rights reserved.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>
  `;
};

const createNewGuestEmail = async (email, data) => {
  const token = generateToken({ email });

  await Token.create({
    email,
    token,
    type: "password_setup",
    expiresAt: new Date(
      Date.now() + 60 * 60 * 1000
    ),
  });

  const subject = data.orderNumber
    ? `BakerBurns Order Confirmation — ${data.orderNumber}`
    : "Welcome to BakerBurns! Complete Your Account Setup";

  const registerFrontend =
    process.env.REGISTER_FRONTEND?.replace(/\/+$/, "");

  if (!registerFrontend) {
    throw new Error(
      "REGISTER_FRONTEND is not configured."
    );
  }

  const passwordSetupUrl =
    `${registerFrontend}/password-form` +
    `?token=${encodeURIComponent(token)}`;

  const orderNumberHtml = data.orderNumber
    ? `
      <p>
        <strong>Order number:</strong>
        ${escapeHtml(data.orderNumber)}
      </p>
    `
    : "";

  const content = `
    <p>Hi there,</p>

    <p>
      We're thrilled to welcome you to BakerBurns.
      Your order has been placed successfully.
    </p>

    ${orderNumberHtml}

    <p>
      To access your order history, save favorite items,
      and receive updates, complete your account setup by
      creating a password.
    </p>

    <p style="margin: 20px 0;">
      <a
        href="${escapeHtml(passwordSetupUrl)}"
        style="
          display: inline-block;
          padding: 12px 20px;
          border-radius: 5px;
          background-color: #4caf50;
          color: #ffffff;
          font-size: 16px;
          text-decoration: none;
        "
      >
        Set Your Password
      </a>
    </p>

    <h2 style="margin-top: 28px;">
      Order Summary
    </h2>

    ${createOrderItemsTable(data.orderItems)}

    ${createOrderTotalHtml(data.total)}

    <p style="margin-top: 28px;">
      <strong>Need assistance?</strong><br />
      Contact our support team at
      <a
        href="mailto:support@bakersburns.com"
        style="color: #007bff;"
      >
        support@bakersburns.com
      </a>.
    </p>
  `;

  return {
    subject,
    html: createEmailLayout({
      title: "Thank You for Your Order!",
      content,
      titleColor: "#4caf50",
    }),
  };
};

const createExistingUserEmail = (data) => {
  const subject = data.orderNumber
    ? `Order Confirmation — ${data.orderNumber}`
    : "Order Confirmation";

  const orderNumberHtml = data.orderNumber
    ? `
      <p>
        <strong>Order number:</strong>
        ${escapeHtml(data.orderNumber)}
      </p>
    `
    : "";

  const orderUrlHtml = data.orderUrl
    ? `
      <p>You can view your order details here:</p>

      <p style="margin: 20px 0;">
        <a
          href="${escapeHtml(data.orderUrl)}"
          style="
            display: inline-block;
            padding: 10px 15px;
            border-radius: 5px;
            background-color: #007bff;
            color: #ffffff;
            text-decoration: none;
          "
        >
          View Order
        </a>
      </p>
    `
    : "";

  const content = `
    <p>Your order has been placed successfully.</p>

    ${orderNumberHtml}

    ${orderUrlHtml}

    <h2 style="margin-top: 28px;">
      Order Summary
    </h2>

    ${createOrderItemsTable(data.orderItems)}

    ${createOrderTotalHtml(data.total)}

    <p style="margin-top: 28px;">
      Questions about your order? Contact
      <a
        href="mailto:support@bakersburns.com"
        style="color: #007bff;"
      >
        support@bakersburns.com
      </a>.
    </p>
  `;

  return {
    subject,
    html: createEmailLayout({
      title: "Thank You for Your Purchase!",
      content,
    }),
  };
};

const createAdminEmail = (data) => {
  const subject = data.orderNumber
    ? `New Order — ${data.orderNumber}`
    : "New Order Notification";

  const customerEmailHtml = data.customerEmail
    ? `
      <p>
        <strong>Customer:</strong>
        ${escapeHtml(data.customerEmail)}
      </p>
    `
    : "";

  const orderNumberHtml = data.orderNumber
    ? `
      <p>
        <strong>Order number:</strong>
        ${escapeHtml(data.orderNumber)}
      </p>
    `
    : "";

  const content = `
    <p>A new order has been received.</p>

    ${customerEmailHtml}

    ${orderNumberHtml}

    <p>
      <strong>Status:</strong>
      ${escapeHtml(data.status || "processing")}
    </p>

    <h2 style="margin-top: 28px;">
      Order Summary
    </h2>

    ${createOrderItemsTable(data.orderItems)}

    ${createOrderTotalHtml(data.total)}
  `;

  return {
    subject,
    html: createEmailLayout({
      title: "New Order Received",
      content,
    }),
  };
};

const sendOrderEmail = async (
  type,
  email,
  data = {}
) => {
  try {
    if (!process.env.RESEND_API_KEY) {
      throw new Error(
        "RESEND_API_KEY is not configured."
      );
    }

    if (!email) {
      throw new Error(
        "Recipient email is required."
      );
    }

    let emailContent;

    switch (type) {
      case "newGuest":
        emailContent =
          await createNewGuestEmail(email, data);
        break;

      case "existingUser":
        emailContent =
          createExistingUserEmail(data);
        break;

      case "adminNotification":
        emailContent =
          createAdminEmail(data);
        break;

      default:
        throw new Error(
          `Unknown email type: ${type}`
        );
    }

    const recipients = email
      .split(",")
      .map((address) => address.trim())
      .filter(Boolean);

    if (recipients.length === 0) {
      throw new Error(
        "No valid recipient email addresses were provided."
      );
    }

    const {
      data: resendData,
      error,
    } = await resend.emails.send({
      from:
        process.env.ORDER_EMAIL_FROM ||
        "BakerBurns Orders <orders@bakersburns.com>",

      to: recipients,

      replyTo:
        process.env.ORDER_EMAIL_REPLY_TO ||
        "support@bakersburns.com",

      subject: emailContent.subject,
      html: emailContent.html,
    });

    if (error) {
      throw new Error(
        `Resend rejected the email: ${
          error.message ||
          JSON.stringify(error)
        }`
      );
    }

    console.log(
      `Email sent to ${email} through Resend:`,
      {
        id: resendData?.id,
        type,
        productCount:
          Array.isArray(data.orderItems)
            ? data.orderItems.length
            : 0,
      }
    );

    return resendData;
  } catch (error) {
    console.error(
      `Error sending ${type} email to ${email}:`,
      {
        message: error.message,
        stack: error.stack,
      }
    );

    throw error;
  }
};

module.exports = {
  sendOrderEmail,
};