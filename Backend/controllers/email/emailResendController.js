// controllers/email/emailResendController.js
'use strict';

const { Resend } = require('resend');

const User = require('../../models/user');

/*
 * ============================================================
 * Email send types
 * ============================================================
 */

const EMAIL_SEND_TYPES = Object.freeze({
  DIRECT_USER: 'direct-user',
  DIRECT_ADMIN: 'direct-admin',
  ALL_USER: 'all-user',
  ALL_ADMIN: 'all-admin',
});

const VALID_EMAIL_SEND_TYPES = new Set(
  Object.values(EMAIL_SEND_TYPES)
);

/*
 * ============================================================
 * Configuration
 * ============================================================
 */

const resendApiKey = String(
  process.env.RESEND_API_KEY || ''
).trim();



const maxConcurrentSends = Math.max(
  1,
  Number.parseInt(
    process.env.RESEND_MAX_CONCURRENT_SENDS ||
      '5',
    10
  ) || 5
);

if (!resendApiKey) {
  throw new Error(
    'Missing RESEND_API_KEY environment variable.'
  );
}



const resend = new Resend(resendApiKey);


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

const normalizeSendType = (value) => {
  return normalizeString(value).toLowerCase();
};

const isValidEmailFormat = (value) => {
  const email = normalizeEmail(value);

  if (!email) {
    return false;
  }

  /*
   * Practical validation only.
   *
   * The email provider remains responsible for determining
   * whether the destination actually exists or can receive mail.
   */
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
    email
  );
};

const toPlainObject = (record) => {
  if (!record) {
    return null;
  }

  if (typeof record.get === 'function') {
    return record.get({
      plain: true,
    });
  }

  return record;
};

const getFirstExistingValue = (
  record,
  fieldNames
) => {
  const plainRecord = toPlainObject(record);

  if (!plainRecord) {
    return null;
  }

  for (const fieldName of fieldNames) {
    const value = plainRecord[fieldName];

    if (
      value !== undefined &&
      value !== null
    ) {
      return value;
    }
  }

  return null;
};

const uniqueEmails = (emails) => {
  return [
    ...new Set(
      emails
        .map(normalizeEmail)
        .filter(Boolean)
    ),
  ];
};

const serializeError = (error) => {
  if (!error) {
    return {
      message: 'Unknown email sending error.',
    };
  }

  return {
    name: error.name || null,
    message:
      error.message ||
      'Unknown email sending error.',
    statusCode:
      error.statusCode ||
      error.status ||
      null,
    code: error.code || null,
  };
};

/*
 * ============================================================
 * Request validation
 * ============================================================
 */

const validateEmailRequest = ({
  type,
  recipient,
  from,
  replyTo, 
  subject,
  html,
}) => {
  const errors = [];
  if (!normalizeString(from)) {
    errors.push(
      'The sender (from) email is required.'
    );
  }
  
  const normalizedType =
    normalizeSendType(type);

  const normalizedRecipient =
    normalizeEmail(recipient);

  const normalizedSubject =
    normalizeString(subject);

  

  if (
    !VALID_EMAIL_SEND_TYPES.has(
      normalizedType
    )
  ) {
    errors.push(
      `Invalid email send type. Expected one of: ${[
        ...VALID_EMAIL_SEND_TYPES,
      ].join(', ')}.`
    );
  }

  const isDirectSend =
    normalizedType ===
      EMAIL_SEND_TYPES.DIRECT_USER ||
    normalizedType ===
      EMAIL_SEND_TYPES.DIRECT_ADMIN;

  if (
    isDirectSend &&
    !normalizedRecipient
  ) {
    errors.push(
      `The recipient field is required for "${normalizedType}" sends.`
    );
  }

  if (
    normalizedRecipient &&
    !isValidEmailFormat(
      normalizedRecipient
    )
  ) {
    errors.push(
      'The recipient must be a valid email address.'
    );
  }

  if (!normalizedSubject) {
    errors.push(
      'The email subject is required.'
    );
  }
  if (
    replyTo &&
    !isValidEmailFormat(replyTo)
  ) {
    errors.push(
      'The replyTo email must be valid.'
    );
  }

  if (
    typeof html !== 'string' ||
    !html.trim()
  ) {
    errors.push(
      'The email HTML is required.'
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    values: {
      type: normalizedType,
      recipient:
        normalizedRecipient || null,
      from:
        normalizeString(from),

      replyTo:
        normalizeEmail(replyTo) ||
        null,

      subject: normalizedSubject,

      /*
       * Do not trim, sanitize, escape, parse, or otherwise alter
       * the HTML. This preserves inline CSS, links, images,
       * template variables already rendered by the caller, etc.
       */
      html,
    },
  };
};

/*
 * ============================================================
 * Database recipient lookup
 * ============================================================
 */

const getUserEmail = (user) => {
  return normalizeEmail(
    getFirstExistingValue(user, [
      'email',
      'emailAddress',
      'email_address',
    ])
  );
};

const getUserRole = (user) => {
  return normalizeString(
    getFirstExistingValue(user, [
      'role',
      'userRole',
      'user_role',
    ])
  ).toLowerCase();
};

const getAllDatabaseUsers = async () => {
  return User.findAll({
    attributes: [
      'id',
      'email',
      'role',
    ],
    raw: true,
  });
};

const resolveDatabaseRecipients =
  async (type) => {
    const users =
      await getAllDatabaseUsers();

    if (
      type ===
      EMAIL_SEND_TYPES.ALL_ADMIN
    ) {
      return uniqueEmails(
        users
          .filter(
            (user) =>
              getUserRole(user) ===
              'admin'
          )
          .map(getUserEmail)
      );
    }

    if (
      type ===
      EMAIL_SEND_TYPES.ALL_USER
    ) {
      /*
       * This currently includes all database users with an email,
       * including administrators.
       *
       * To exclude administrators, add:
       *
       * .filter((user) => getUserRole(user) !== 'admin')
       */
      return uniqueEmails(
        users.map(getUserEmail)
      );
    }

    return [];
  };

/*
 * ============================================================
 * Recipient resolution
 * ============================================================
 */

const resolveRecipients = async ({
  type,
  recipient,
}) => {
  switch (type) {
    case EMAIL_SEND_TYPES.DIRECT_USER:
    case EMAIL_SEND_TYPES.DIRECT_ADMIN:
      return [recipient];

    case EMAIL_SEND_TYPES.ALL_USER:
    case EMAIL_SEND_TYPES.ALL_ADMIN:
      return resolveDatabaseRecipients(
        type
      );

    default:
      return [];
  }
};

/*
 * ============================================================
 * Single-recipient send
 * ============================================================
 */

const sendToSingleRecipient = async ({
  recipient,
  from, 
  replyTo,
  subject,
  html,
}) => {
  const normalizedRecipient =
    normalizeEmail(recipient);

  if (
    !isValidEmailFormat(
      normalizedRecipient
    )
  ) {
    return {
      success: false,
      recipient:
        normalizedRecipient ||
        recipient ||
        null,
      emailId: null,
      error: {
        code: 'INVALID_EMAIL_FORMAT',
        message:
          'Recipient email format is invalid.',
      },
    };
  }

  try {
    /*
     * Current Resend SDK responses use:
     *
     * {
     *   data: { id: "..." },
     *   error: null
     * }
     *
     * Resend can return an error object without throwing, so both
     * outcomes must be handled.
     */
    const {
      data,
      error,
    } = await resend.emails.send({
      from,
      to: [normalizedRecipient],
      replyTo,
      subject,
      html,
    });

    if (error) {
      console.error(
        'Resend rejected email:',
        {
          recipient:
            normalizedRecipient,
          error,
        }
      );

      return {
        success: false,
        recipient:
          normalizedRecipient,
        emailId: null,
        error: serializeError(error),
      };
    }

    const emailId =
      data?.id || null;

    console.log(
      'Email accepted by Resend:',
      {
        recipient:
          normalizedRecipient,
        emailId,
      }
    );

    return {
      success: true,
      recipient:
        normalizedRecipient,
      emailId,
      error: null,
    };
  } catch (error) {
    /*
     * A thrown error affects only this recipient. It is converted
     * into a result and does not stop the remaining sends.
     */
    console.error(
      'Email send threw an exception:',
      {
        recipient:
          normalizedRecipient,
        error:
          serializeError(error),
      }
    );

    return {
      success: false,
      recipient:
        normalizedRecipient,
      emailId: null,
      error: serializeError(error),
    };
  }
};

/*
 * ============================================================
 * Controlled-concurrency sender
 * ============================================================
 */

const sendWithConcurrencyLimit =
  async ({
    recipients,
    from,
    replyTo,
    subject,
    html,
    concurrency =
      maxConcurrentSends,
  }) => {
    const results =
      new Array(recipients.length);

    let nextIndex = 0;

    const worker = async () => {
      while (true) {
        const currentIndex =
          nextIndex;

        nextIndex += 1;

        if (
          currentIndex >=
          recipients.length
        ) {
          return;
        }

        const recipient =
          recipients[currentIndex];

        /*
         * Every worker awaits its own recipient send. A failure is
         * returned as data rather than thrown, so the worker keeps
         * processing the remaining recipients.
         */
        results[currentIndex] =
          await sendToSingleRecipient({
            recipient,
            from, 
            replyTo,
            subject,
            html,
          });
      }
    };

    const workerCount = Math.min(
      Math.max(1, concurrency),
      recipients.length
    );

    const workers = Array.from(
      {
        length: workerCount,
      },
      () => worker()
    );

    await Promise.all(workers);

    return results;
  };

/*
 * ============================================================
 * Main reusable email dispatcher
 * ============================================================
 *
 * This is the function other controllers should import.
 *
 * Expected input:
 *
 * {
 *   type: 'direct-user',
 *   recipient: 'person@example.com',
 *   subject: 'Your refund',
 *   html: '<html>...</html>'
 * }
 */

const sendEmailRequest = async ({
  type,
  recipient = null,
  from,
  replyTo,
  subject,
  html,
}) => {
  const validation =
    validateEmailRequest({
      type,
      recipient,
      from,
      replyTo,
      subject,
      html,
    });

  if (!validation.valid) {
    return {
      success: false,
      completed: false,
      type:
        normalizeSendType(type) ||
        null,
      requestedRecipient:
        normalizeEmail(recipient) ||
        null,
      recipientCount: 0,
      attemptedCount: 0,
      successfulCount: 0,
      failedCount: 0,
      results: [],
      errors: validation.errors,
    };
  }

  const {
    type: normalizedType,
    recipient: normalizedRecipient,
    from: normalizedFrom,
    replyTo: normalizedReplyTo,
    subject: normalizedSubject,
    html: normalizedHtml,
  } = validation.values;

  let recipients;

  try {
    recipients =
      await resolveRecipients({
        type: normalizedType,
        recipient:
          normalizedRecipient,
      });
  } catch (error) {
    console.error(
      'Unable to resolve email recipients:',
      {
        type: normalizedType,
        error:
          serializeError(error),
      }
    );

    return {
      success: false,
      completed: false,
      type: normalizedType,
      requestedRecipient:
        normalizedRecipient,
      recipientCount: 0,
      attemptedCount: 0,
      successfulCount: 0,
      failedCount: 0,
      results: [],
      errors: [
        `Unable to resolve email recipients: ${
          error.message
        }`,
      ],
    };
  }

  recipients =
    uniqueEmails(recipients);

  if (recipients.length === 0) {
    return {
      success: false,
      completed: true,
      type: normalizedType,
      requestedRecipient:
        normalizedRecipient,
      recipientCount: 0,
      attemptedCount: 0,
      successfulCount: 0,
      failedCount: 0,
      results: [],
      errors: [
        'No valid email recipients were found.',
      ],
    };
  }

  const results =
    await sendWithConcurrencyLimit({
      recipients,
      from: 
        normalizedFrom,
      replyTo: 
        normalizedReplyTo,
      subject:
        normalizedSubject,
      html: normalizedHtml,
    });

  const successfulResults =
    results.filter(
      (result) =>
        result?.success === true
    );

  const failedResults =
    results.filter(
      (result) =>
        result?.success !== true
    );

  /*
   * "completed" means every recipient was attempted.
   *
   * "success" means every attempted send was accepted by Resend.
   *
   * This distinction lets callers continue their database work
   * even when one or more email addresses fail.
   */
  return {
    success:
      failedResults.length === 0,

    completed: true,

    type: normalizedType,

    requestedRecipient:
      normalizedRecipient,

    recipientCount:
      recipients.length,

    attemptedCount:
      results.length,

    successfulCount:
      successfulResults.length,

    failedCount:
      failedResults.length,

    results,

    errors:
      failedResults.map(
        (result) => ({
          recipient:
            result.recipient,
          ...result.error,
        })
      ),
  };
};

/*
 * ============================================================
 * Express HTTP controller
 * ============================================================
 *
 * POST body:
 *
 * {
 *   "type": "direct-user",
 *   "recipient": "person@example.com",
 *   "subject": "Test email",
 *   "html": "<h1>Hello</h1>"
 * }
 */

const handleSendEmail = async (
  req,
  res
) => {
  try {
    const {
      type,
      recipient,
      from,
      replyTo,
      subject,
      html,
    } = req.body || {};

    const result =
      await sendEmailRequest({
        type,
        recipient,
        from,
        replyTo,
        subject,
        html,
      });

    if (!result.completed) {
      return res
        .status(400)
        .json({
          message:
            'The email request could not be processed.',
          ...result,
        });
    }

    if (
      result.attemptedCount === 0
    ) {
      return res
        .status(404)
        .json({
          message:
            'No email recipients were found.',
          ...result,
        });
    }

    if (
      result.failedCount > 0
    ) {
      /*
       * HTTP 207 means the operation completed but had mixed
       * individual results.
       */
      return res
        .status(207)
        .json({
          message:
            'Email processing completed with one or more failed recipients.',
          ...result,
        });
    }

    return res
      .status(200)
      .json({
        message:
          'All emails were accepted for delivery.',
        ...result,
      });
  } catch (error) {
    /*
     * This should be reserved for unexpected controller failures.
     * Ordinary per-recipient Resend failures are already captured
     * by sendEmailRequest().
     */
    console.error(
      'Unexpected email controller failure:',
      {
        error:
          serializeError(error),
        stack: error.stack,
      }
    );

    return res
      .status(500)
      .json({
        message:
          'An unexpected error occurred while processing the email request.',
      });
  }
};

module.exports = {
  EMAIL_SEND_TYPES,
  sendEmailRequest,
  handleSendEmail,
};