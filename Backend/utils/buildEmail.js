// utils/buildEmail.js

const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

/*
 * Prevent user-controlled values from breaking email HTML.
 */
const escapeHtml = (value) => {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

/*
 * Remove trailing slashes so generated links do not contain //.
 */
const normalizeBaseUrl = (value) => {
  return String(value || "").trim().replace(/\/+$/, "");
};

/*
 * Choose the appropriate frontend URL for the current environment.
 *
 * This supports your existing environment-variable names while also
 * allowing simpler REGISTER_FRONTEND and USER_FRONTEND names.
 */
const getRegisterFrontendUrl = () => {
  const value =
    process.env.NODE_ENV === "production"
      ? process.env.PROD_REGISTER_FRONTEND ||
        process.env.REGISTER_FRONTEND
      : process.env.DEV_REGISTER_URL ||
        process.env.REGISTER_FRONTEND;

  const url = normalizeBaseUrl(value);

  if (!url) {
    throw new Error(
      "Register frontend URL is not configured."
    );
  }

  return url;
};

const getUserFrontendUrl = () => {
  const value =
    process.env.NODE_ENV === "production"
      ? process.env.PROD_USER_FRONTEND ||
        process.env.USER_FRONTEND
      : process.env.DEV_USER_URL ||
        process.env.USER_FRONTEND;

  const url = normalizeBaseUrl(value);

  if (!url) {
    throw new Error(
      "User frontend URL is not configured."
    );
  }

  return url;
};

/*
 * Build a URL while safely encoding email addresses and tokens.
 */
const createUrl = (baseUrl, pathname, parameters = {}) => {
  const url = new URL(pathname, `${baseUrl}/`);

  Object.entries(parameters).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  });

  return url.toString();
};

const createEmailLayout = ({
  title,
  message,
  buttonText = "",
  actionUrl = "",
  verificationCode = "",
}) => {
  const currentYear = new Date().getFullYear();

  const actionButton =
    buttonText && actionUrl
      ? `
        <table
          role="presentation"
          cellpadding="0"
          cellspacing="0"
          border="0"
          style="margin: 24px auto;"
        >
          <tr>
            <td
              align="center"
              style="
                border-radius: 6px;
                background-color: #1a73e8;
              "
            >
              <a
                href="${escapeHtml(actionUrl)}"
                style="
                  display: inline-block;
                  padding: 12px 22px;
                  color: #ffffff;
                  font-size: 16px;
                  font-weight: bold;
                  text-decoration: none;
                "
              >
                ${escapeHtml(buttonText)}
              </a>
            </td>
          </tr>
        </table>
      `
      : "";

  const codeBlock = verificationCode
    ? `
      <div
        style="
          margin: 24px 0;
          padding: 18px;
          border: 1px solid #dddddd;
          border-radius: 8px;
          background-color: #f7f7f7;
          color: #222222;
          font-size: 30px;
          font-weight: bold;
          letter-spacing: 6px;
          text-align: center;
        "
      >
        ${escapeHtml(verificationCode)}
      </div>
    `
    : "";

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
          style="
            width: 100%;
            background-color: #f3f3f3;
          "
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
                  max-width: 620px;
                  border-collapse: collapse;
                  border-radius: 10px;
                  background-color: #ffffff;
                "
              >
                <tr>
                  <td style="padding: 30px;">
                    <h1
                      style="
                        margin: 0 0 20px;
                        color: #4caf50;
                        font-size: 27px;
                        line-height: 1.3;
                      "
                    >
                      ${escapeHtml(title)}
                    </h1>

                    <p
                      style="
                        margin: 0 0 18px;
                        font-size: 16px;
                        line-height: 1.6;
                      "
                    >
                      ${message}
                    </p>

                    ${codeBlock}

                    ${actionButton}

                    <div
                      style="
                        margin-top: 24px;
                        padding: 14px;
                        border-left: 4px solid #e53935;
                        background-color: #fff4f4;
                      "
                    >
                      <p
                        style="
                          margin: 0;
                          color: #c62828;
                          font-size: 14px;
                          font-weight: bold;
                          line-height: 1.5;
                        "
                      >
                        Security notice: BakerBurns will never ask
                        you to share a verification code, password,
                        or reset link.
                      </p>
                    </div>

                    <p
                      style="
                        margin-top: 22px;
                        color: #777777;
                        font-size: 14px;
                        line-height: 1.5;
                      "
                    >
                      If you did not request this message, you can
                      safely ignore it.
                    </p>

                    <hr
                      style="
                        margin: 28px 0 18px;
                        border: none;
                        border-top: 1px solid #eeeeee;
                      "
                    />

                    <p
                      style="
                        margin: 0;
                        color: #aaaaaa;
                        font-size: 12px;
                        text-align: center;
                      "
                    >
                      &copy; ${currentYear} BakerBurns.
                      All rights reserved.
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

/*
 * Build the subject and body for each transactional message.
 */
const buildEmailContent = (
  actionType,
  recipientEmail,
  token
) => {
  const registerFrontend = getRegisterFrontendUrl();

  switch (actionType) {
    case "sign-up": {
      const verificationUrl = createUrl(
        registerFrontend,
        "/verify",
        {
          email: recipientEmail,
          token,
        }
      );

      return {
        subject: "Verify Your BakerBurns Email",
        html: createEmailLayout({
          title: "Verify Your Email",
          message:
            "Thank you for registering with BakerBurns. " +
            "Please verify your email address by selecting " +
            "the button below.",
          buttonText: "Verify Your Email",
          actionUrl: verificationUrl,
        }),
      };
    }

    case "password-reset": {
      const resetUrl = createUrl(
        registerFrontend,
        "/passwordreset",
        {
          email: recipientEmail,
          token,
        }
      );

      return {
        subject: "BakerBurns Password Reset",
        html: createEmailLayout({
          title: "Reset Your Password",
          message:
            "We received a request to reset your BakerBurns " +
            "password. Select the button below to choose a " +
            "new password.",
          buttonText: "Reset Password",
          actionUrl: resetUrl,
        }),
      };
    }

    case "settings-change": {
      const userFrontend = getUserFrontendUrl();

      const confirmationUrl = createUrl(
        userFrontend,
        "/userDashboard",
        {
          email: recipientEmail,
          token,
        }
      );

      return {
        subject: "Confirm Your Account Changes",
        html: createEmailLayout({
          title: "Confirm Account Changes",
          message:
            "A change was requested for your BakerBurns " +
            "account settings. Select the button below to " +
            "confirm the request.",
          buttonText: "Confirm Settings Change",
          actionUrl: confirmationUrl,
        }),
      };
    }

    case "verification-code": {
      if (!token) {
        throw new Error(
          "A verification code is required."
        );
      }

      return {
        subject: "Your BakerBurns Verification Code",
        html: createEmailLayout({
          title: "Your Verification Code",
          message:
            "Use the following code to verify your email " +
            "address. Do not share this code with anyone.",
          verificationCode: token,
        }),
      };
    }

    default:
      throw new Error(
        `Invalid email action type: ${actionType}`
      );
  }
};

/*
 * Sends verification and account-related email through Resend.
 *
 * Returns true after Resend accepts the message.
 * Throws an error when the message cannot be sent.
 */
const sendVerificationEmail = async (
  to,
  token,
  actionType
) => {
  if (!process.env.RESEND_API_KEY) {
    throw new Error(
      "RESEND_API_KEY is not configured."
    );
  }

  const recipient = String(to || "")
    .trim()
    .toLowerCase();

  if (!recipient) {
    throw new Error(
      "A recipient email address is required."
    );
  }

  if (!token) {
    throw new Error(
      `A token or code is required for ${actionType}.`
    );
  }

  const { subject, html } = buildEmailContent(
    actionType,
    recipient,
    token
  );

  const from =
    process.env.VERIFICATION_EMAIL_FROM ||
    process.env.ORDER_EMAIL_FROM ||
    "BakerBurns Accounts <accounts@bakersburns.com>";

  const replyTo =
    process.env.VERIFICATION_EMAIL_REPLY_TO ||
    process.env.ORDER_EMAIL_REPLY_TO ||
    "support@bakersburns.com";

  const {
    data: resendData,
    error,
  } = await resend.emails.send({
    from,
    to: [recipient],
    replyTo,
    subject,
    html,
  });

  if (error) {
    throw new Error(
      `Resend rejected the ${actionType} email: ${
        error.message || JSON.stringify(error)
      }`
    );
  }

  console.log(`${subject} email accepted by Resend:`, {
    id: resendData?.id,
    recipient,
    actionType,
  });

  return true;
};

module.exports = sendVerificationEmail;
module.exports.buildEmailContent = buildEmailContent;