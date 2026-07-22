// controllers/contact/contactController.js
'use strict';

const {
  FROM_ADRESSES,
} = require('../email/email-constants');

const {
  sendEmailRequest,
  EMAIL_SEND_TYPES,
} = require('../email/emailResendController');

/*
 * ============================================================
 * Configuration
 * ============================================================
 */

const CONTACT_NAME_MAX_LENGTH = 100;
const CONTACT_SUBJECT_MAX_LENGTH = 150;
const CONTACT_MESSAGE_MAX_LENGTH = Math.max(
  500,
  Number.parseInt(
    process.env.CONTACT_MESSAGE_MAX_LENGTH || '5000',
    10
  ) || 5000
);

/*
 * ============================================================
 * General helpers
 * ============================================================
 */

const normalizeString = (value) => {
  if (typeof value !== 'string') {
    return '';
  }

  return value.trim();
};

const normalizeEmail = (value) => {
  return normalizeString(value).toLowerCase();
};

const isValidEmailFormat = (value) => {
  const email = normalizeEmail(value);

  if (!email) {
    return false;
  }

  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

const escapeHtml = (value) => {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

const formatMessageForHtml = (value) => {
  return escapeHtml(value).replace(
    /\r?\n/g,
    '<br>'
  );
};

const serializeError = (error) => {
  if (!error) {
    return {
      message: 'Unknown contact form error.',
    };
  }

  return {
    name: error.name || null,
    message:
      error.message ||
      'Unknown contact form error.',
    code: error.code || null,
    statusCode:
      error.statusCode ||
      error.status ||
      null,
  };
};

/*
 * ============================================================
 * Request extraction
 * ============================================================
 */

const extractContactRequest = (body = {}) => {
  return {
    name: normalizeString(
      body.name ??
        body.fullName ??
        body.full_name
    ),

    email: normalizeEmail(
      body.email ??
        body.emailAddress ??
        body.email_address
    ),

    subject: normalizeString(
      body.subject ??
        body.topic
    ),

    message: normalizeString(
      body.message ??
        body.body ??
        body.content
    ),

    /*
     * Optional honeypot field.
     *
     * Add a hidden field named "website" to the frontend.
     * Legitimate users should never complete it.
     */
    website: normalizeString(
      body.website ??
        body.companyWebsite ??
        body.company_website
    ),
  };
};

/*
 * ============================================================
 * Validation
 * ============================================================
 */

const validateContactRequest = ({
  name,
  email,
  subject,
  message,
}) => {
  const errors = [];

  if (!name) {
    errors.push('Your name is required.');
  } else if (
    name.length > CONTACT_NAME_MAX_LENGTH
  ) {
    errors.push(
      `Your name cannot exceed ${CONTACT_NAME_MAX_LENGTH} characters.`
    );
  }

  if (!email) {
    errors.push(
      'Your email address is required.'
    );
  } else if (!isValidEmailFormat(email)) {
    errors.push(
      'Please enter a valid email address.'
    );
  }

  if (!subject) {
    errors.push('A subject is required.');
  } else if (
    subject.length >
    CONTACT_SUBJECT_MAX_LENGTH
  ) {
    errors.push(
      `The subject cannot exceed ${CONTACT_SUBJECT_MAX_LENGTH} characters.`
    );
  }

  if (!message) {
    errors.push('A message is required.');
  } else if (
    message.length >
    CONTACT_MESSAGE_MAX_LENGTH
  ) {
    errors.push(
      `The message cannot exceed ${CONTACT_MESSAGE_MAX_LENGTH} characters.`
    );
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/*
 * ============================================================
 * Email template
 * ============================================================
 */

const buildContactEmailHtml = ({
  name,
  email,
  subject,
  message,
}) => {
  const safeName = escapeHtml(name);
  const safeEmail = escapeHtml(email);
  const safeSubject = escapeHtml(subject);
  const safeMessage =
    formatMessageForHtml(message);

  const replySubject =
    encodeURIComponent(`Re: ${subject}`);

  return `
    <!doctype html>
    <html lang="en">
      <head>
        <meta charset="utf-8">

        <meta
          name="viewport"
          content="width=device-width, initial-scale=1"
        >

        <title>New website contact message</title>
      </head>

      <body
        style="
          margin: 0;
          padding: 0;
          background-color: #f4f4f4;
          color: #222222;
          font-family: Arial, Helvetica, sans-serif;
        "
      >
        <table
          role="presentation"
          width="100%"
          cellspacing="0"
          cellpadding="0"
          border="0"
          style="
            width: 100%;
            background-color: #f4f4f4;
          "
        >
          <tr>
            <td
              align="center"
              style="padding: 32px 16px;"
            >
              <table
                role="presentation"
                width="100%"
                cellspacing="0"
                cellpadding="0"
                border="0"
                style="
                  width: 100%;
                  max-width: 640px;
                  overflow: hidden;
                  background-color: #ffffff;
                  border-radius: 12px;
                  box-shadow:
                    0 4px 18px
                    rgba(0, 0, 0, 0.08);
                "
              >
                <tr>
                  <td
                    style="
                      padding: 28px 32px;
                      background-color: #242424;
                      color: #ffffff;
                    "
                  >
                    <h1
                      style="
                        margin: 0;
                        font-size: 24px;
                        line-height: 1.3;
                      "
                    >
                      New Contact Message
                    </h1>

                    <p
                      style="
                        margin: 8px 0 0;
                        font-size: 14px;
                        line-height: 1.5;
                        opacity: 0.85;
                      "
                    >
                      A visitor submitted a message
                      through the website contact form.
                    </p>
                  </td>
                </tr>

                <tr>
                  <td style="padding: 32px;">
                    <table
                      role="presentation"
                      width="100%"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="width: 100%;"
                    >
                      <tr>
                        <td
                          style="
                            padding: 0 0 7px;
                            color: #666666;
                            font-size: 12px;
                            font-weight: bold;
                            letter-spacing: 0.06em;
                            text-transform: uppercase;
                          "
                        >
                          Name
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 0 0 22px;
                            font-size: 16px;
                            line-height: 1.5;
                          "
                        >
                          ${safeName}
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 0 0 7px;
                            color: #666666;
                            font-size: 12px;
                            font-weight: bold;
                            letter-spacing: 0.06em;
                            text-transform: uppercase;
                          "
                        >
                          Email
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 0 0 22px;
                            font-size: 16px;
                            line-height: 1.5;
                          "
                        >
                          <a
                            href="mailto:${safeEmail}"
                            style="
                              color: #2457a6;
                              text-decoration: none;
                            "
                          >
                            ${safeEmail}
                          </a>
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 0 0 7px;
                            color: #666666;
                            font-size: 12px;
                            font-weight: bold;
                            letter-spacing: 0.06em;
                            text-transform: uppercase;
                          "
                        >
                          Subject
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 0 0 22px;
                            font-size: 16px;
                            line-height: 1.5;
                          "
                        >
                          ${safeSubject}
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 0 0 7px;
                            color: #666666;
                            font-size: 12px;
                            font-weight: bold;
                            letter-spacing: 0.06em;
                            text-transform: uppercase;
                          "
                        >
                          Message
                        </td>
                      </tr>

                      <tr>
                        <td
                          style="
                            padding: 18px;
                            overflow-wrap: anywhere;
                            background-color: #f7f7f7;
                            border: 1px solid #e4e4e4;
                            border-radius: 8px;
                            font-size: 16px;
                            line-height: 1.65;
                          "
                        >
                          ${safeMessage}
                        </td>
                      </tr>
                    </table>

                    <table
                      role="presentation"
                      cellspacing="0"
                      cellpadding="0"
                      border="0"
                      style="margin-top: 26px;"
                    >
                      <tr>
                        <td
                          style="
                            background-color: #242424;
                            border-radius: 7px;
                          "
                        >
                          <a
                            href="mailto:${safeEmail}?subject=${replySubject}"
                            style="
                              display: inline-block;
                              padding: 13px 20px;
                              color: #ffffff;
                              font-size: 15px;
                              font-weight: bold;
                              text-decoration: none;
                            "
                          >
                            Reply to ${safeName}
                          </a>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>

                <tr>
                  <td
                    style="
                      padding: 20px 32px;
                      background-color: #f7f7f7;
                      border-top: 1px solid #e6e6e6;
                      color: #777777;
                      font-size: 12px;
                      line-height: 1.5;
                    "
                  >
                    This email was generated by the
                    website contact form.
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
 * ============================================================
 * Contact form controller
 * ============================================================
 */

/**
 * POST request body:
 *
 * {
 *   "name": "Jane Smith",
 *   "email": "jane@example.com",
 *   "subject": "Question about an order",
 *   "message": "I need help with..."
 * }
 */
const sendContactMessage = async (
  req,
  res
) => {
  try {
    const contactRequest =
      extractContactRequest(req.body);

    /*
     * Silently accept honeypot submissions.
     *
     * This prevents basic bots from learning that their
     * submission was detected.
     */
    if (contactRequest.website) {
      console.warn(
        'Contact form honeypot submission ignored.',
        {
          ip: req.ip || null,
        }
      );

      return res.status(200).json({
        success: true,
        message:
          'Your message has been received.',
      });
    }

    const validation =
      validateContactRequest(
        contactRequest
      );

    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message:
          'Please correct the contact form and try again.',
        errors: validation.errors,
      });
    }

    const {
      name,
      email,
      subject,
      message,
    } = contactRequest;

    const html =
      buildContactEmailHtml({
        name,
        email,
        subject,
        message,
      });

    /*
     * ALL_ADMIN causes sendEmailRequest() to:
     *
     * 1. Query the Users table.
     * 2. Find every user whose role is "admin".
     * 3. Send this email separately to every valid admin email.
     *
     * replyTo is the visitor's email, so administrators can
     * reply directly to the visitor.
     */
    const emailResult =
      await sendEmailRequest({
        type:
          EMAIL_SEND_TYPES.ALL_ADMIN,

        from:
          FROM_ADRESSES.CONTACT,

        replyTo: email,

        subject:
          `Website Contact: ${subject}`,

        html,
      });

    if (!emailResult.completed) {
      console.error(
        'Contact email request could not be processed.',
        {
          senderEmail: email,
          errors: emailResult.errors,
        }
      );

      return res.status(502).json({
        success: false,
        message:
          'Your message could not be sent. Please try again.',
      });
    }

    if (
      emailResult.attemptedCount === 0
    ) {
      console.error(
        'No administrator recipients were found for the contact form.',
        {
          senderEmail: email,
          errors: emailResult.errors,
        }
      );

      return res.status(503).json({
        success: false,
        message:
          'The contact form is temporarily unavailable.',
      });
    }

    /*
     * Return success when at least one administrator receives
     * the contact message.
     *
     * Do not expose administrator addresses, Resend IDs, or
     * internal failure details to the public frontend.
     */
    if (
      emailResult.successfulCount > 0
    ) {
      if (
        emailResult.failedCount > 0
      ) {
        console.warn(
          'Contact message reached some, but not all, administrators.',
          {
            successfulCount:
              emailResult.successfulCount,
            failedCount:
              emailResult.failedCount,
            errors:
              emailResult.errors,
          }
        );
      }

      return res.status(200).json({
        success: true,
        message:
          'Your message has been sent. We will get back to you as soon as possible.',
      });
    }

    console.error(
      'Contact message failed for every administrator.',
      {
        senderEmail: email,
        attemptedCount:
          emailResult.attemptedCount,
        failedCount:
          emailResult.failedCount,
        errors:
          emailResult.errors,
      }
    );

    return res.status(502).json({
      success: false,
      message:
        'Your message could not be sent. Please try again.',
    });
  } catch (error) {
    console.error(
      'Unexpected contact controller error:',
      {
        error: serializeError(error),
        stack: error.stack,
      }
    );

    return res.status(500).json({
      success: false,
      message:
        'An unexpected error occurred while sending your message.',
    });
  }
};

module.exports = {
  sendContactMessage,
};