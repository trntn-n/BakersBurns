// controllers/register/signupController.js

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { v4: uuidv4 } = require("uuid");

const PendingUser = require("../../models/pendingUser");
const User = require("../../models/user");
const Message = require("../../models/messages");
const Thread = require("../../models/threads");

const sendVerificationEmail = require(
  "../../utils/buildEmail"
);

const {
  mergeGuestCartToUserCart,
} = require("./cartUtil");

const PENDING_USER_LIFETIME_MS =
  24 * 60 * 60 * 1000;

const RESTRICTED_USERNAMES = new Set([
  "null",
  "admin",
  "administrator",
  "root",
]);

const normalizeEmail = (value) => {
  return String(value || "")
    .trim()
    .toLowerCase();
};

const normalizeUsername = (value) => {
  return String(value || "").trim();
};

const isValidEmail = (value) => {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
};

const isRestrictedUsername = (username) => {
  return RESTRICTED_USERNAMES.has(
    username.toLowerCase()
  );
};

const getUserFrontendUrl = () => {
  const value =
    process.env.NODE_ENV === "production"
      ? process.env.PROD_USER_FRONTEND ||
        process.env.USER_FRONTEND
      : process.env.DEV_USER_URL ||
        process.env.USER_FRONTEND;

  return (
    String(value || "").replace(/\/+$/, "") ||
    "http://localhost:4001"
  );
};

const getLoginUrl = () => {
  return (
    process.env.LOGIN_URL ||
    `${getUserFrontendUrl()}/login`
  );
};

const isPendingUserExpired = (pendingUser) => {
  const createdAt =
    new Date(pendingUser.createdAt).getTime();

  if (!Number.isFinite(createdAt)) {
    return true;
  }

  return (
    Date.now() - createdAt >
    PENDING_USER_LIFETIME_MS
  );
};

/*
 * POST /sign-up
 */
const signup = async (req, res) => {
  const {
    userName,
    email,
    password,
    phoneNumber,
    isOptedInForPromotions = false,
    isOptedInForEmailUpdates = false,
    hasAcceptedPrivacyPolicy,
    hasAcceptedTermsOfService,
  } = req.body;

  const normalizedUsername =
    normalizeUsername(userName);

  const normalizedEmail =
    normalizeEmail(email);

  if (
    !normalizedUsername ||
    isRestrictedUsername(normalizedUsername)
  ) {
    return res.status(400).json({
      message:
        "Invalid username. Please choose another.",
    });
  }

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      message:
        "Please enter a valid email address.",
    });
  }

  if (
    typeof password !== "string" ||
    password.length < 8
  ) {
    return res.status(400).json({
      message:
        "Password must contain at least 8 characters.",
    });
  }

  if (
    hasAcceptedPrivacyPolicy !== true ||
    hasAcceptedTermsOfService !== true
  ) {
    return res.status(400).json({
      message:
        "You must accept the Privacy Policy and " +
        "Terms of Service.",
    });
  }

  try {
    const registeredEmail = await User.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (registeredEmail) {
      return res.status(409).json({
        message:
          "This email is already registered. Please log in.",
      });
    }

    const registeredUsername = await User.findOne({
      where: {
        username: normalizedUsername,
      },
    });

    if (registeredUsername) {
      return res.status(409).json({
        message:
          "That username is already registered.",
      });
    }

    const pendingUsername =
      await PendingUser.findOne({
        where: {
          userName: normalizedUsername,
        },
      });

    if (
      pendingUsername &&
      normalizeEmail(pendingUsername.email) !==
        normalizedEmail &&
      !isPendingUserExpired(pendingUsername)
    ) {
      return res.status(409).json({
        message:
          "That username is awaiting email verification.",
      });
    }

    let pendingUser = await PendingUser.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    /*
     * A valid existing pending account receives a newly
     * generated verification token and email.
     */
    if (
      pendingUser &&
      !isPendingUserExpired(pendingUser)
    ) {
      const verificationToken = jwt.sign(
        {
          email: normalizedEmail,
          purpose: "email-verification",
        },
        process.env.JWT_SECRET,
        {
          expiresIn: "24h",
        }
      );

      await pendingUser.update({
        verificationToken,
      });

      await sendVerificationEmail(
        normalizedEmail,
        verificationToken,
        "sign-up"
      );

      return res.status(200).json({
        message:
          "Verification email resent. Please check your inbox.",
      });
    }

    if (pendingUser) {
      await pendingUser.destroy();
      pendingUser = null;
    }

    const hashedPassword = await bcrypt.hash(
      password,
      10
    );

    const verificationToken = jwt.sign(
      {
        email: normalizedEmail,
        purpose: "email-verification",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h",
      }
    );

    /*
     * Create the pending record before sending.
     *
     * If email delivery temporarily fails, the user can use
     * the resend-verification endpoint instead of losing all
     * signup information.
     */
    pendingUser = await PendingUser.create({
      userName: normalizedUsername,
      email: normalizedEmail,
      password: hashedPassword,
      phoneNumber:
        phoneNumber?.trim?.() || phoneNumber || null,
      verificationToken,
      role: "user",
      isOptedInForPromotions:
        isOptedInForPromotions === true,
      isOptedInForEmailUpdates:
        isOptedInForEmailUpdates === true,
      hasAcceptedPrivacyPolicy: true,
      privacyPolicyAcceptedAt: new Date(),
      hasAcceptedTermsOfService: true,
      termsAcceptedAt: new Date(),
      createdAt: new Date(),
    });

    try {
      await sendVerificationEmail(
        normalizedEmail,
        verificationToken,
        "sign-up"
      );
    } catch (emailError) {
      console.error(
        "Pending user created, but verification email failed:",
        {
          email: normalizedEmail,
          message: emailError.message,
        }
      );

      return res.status(502).json({
        message:
          "Your registration was saved, but the verification " +
          "email could not be sent. Please use the resend " +
          "verification option.",
      });
    }

    return res.status(200).json({
      message:
        "Verification email sent. Please verify your email.",
    });
  } catch (error) {
    console.error("Signup error:", {
      message: error.message,
      stack: error.stack,
      email: normalizedEmail,
    });

    return res.status(500).json({
      message: "Signup failed.",
    });
  }
};

/*
 * POST /check-username
 */
const checkUsername = async (req, res) => {
  const normalizedUsername =
    normalizeUsername(req.body.userName);

  if (
    !normalizedUsername ||
    isRestrictedUsername(normalizedUsername)
  ) {
    return res.status(400).json({
      message:
        "Invalid username. Please choose another.",
    });
  }

  try {
    const pendingUser =
      await PendingUser.findOne({
        where: {
          userName: normalizedUsername,
        },
      });

    if (
      pendingUser &&
      !isPendingUserExpired(pendingUser)
    ) {
      return res.status(409).json({
        message:
          "Username is awaiting verification.",
      });
    }

    if (
      pendingUser &&
      isPendingUserExpired(pendingUser)
    ) {
      await pendingUser.destroy();
    }

    /*
     * User uses "username"; PendingUser uses "userName".
     */
    const existingUser = await User.findOne({
      where: {
        username: normalizedUsername,
      },
    });

    if (existingUser) {
      return res.status(409).json({
        message: "Username is already registered.",
      });
    }

    return res.status(200).json({
      message: "Username is available.",
    });
  } catch (error) {
    console.error("Error checking username:", {
      message: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      message: "Server error checking username.",
    });
  }
};

/*
 * GET /verify
 */
const createAccount = async (req, res) => {
  const normalizedEmail =
    normalizeEmail(req.query.email);

  const token = String(
    req.query.token || ""
  ).trim();

  const guestSessionId = req.query.guestSessionId
    ? String(req.query.guestSessionId)
    : null;

  if (!normalizedEmail || !token) {
    return res.status(400).json({
      message:
        "Verification email and token are required.",
    });
  }

  let decoded;

  try {
    decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );
  } catch (error) {
    console.warn(
      "Email verification token rejected:",
      {
        email: normalizedEmail,
        message: error.message,
      }
    );

    return res.status(400).json({
      message:
        "The verification link is invalid or expired.",
    });
  }

  if (
    normalizeEmail(decoded.email) !==
      normalizedEmail ||
    decoded.purpose !== "email-verification"
  ) {
    return res.status(400).json({
      message:
        "The verification token does not match this account.",
    });
  }

  try {
    const pendingUser = await PendingUser.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (!pendingUser) {
      return res.status(404).json({
        message:
          "Pending account not found or already verified.",
      });
    }

    if (
      pendingUser.verificationToken !== token
    ) {
      return res.status(400).json({
        message:
          "This verification link has been replaced. " +
          "Please use the most recent verification email.",
      });
    }

    const existingUser = await User.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (existingUser) {
      await pendingUser.destroy();

      return res.status(409).json({
        message:
          "This email is already registered. Please log in.",
        redirectUrl: getLoginUrl(),
      });
    }

    const usernameConflict = await User.findOne({
      where: {
        username: pendingUser.userName,
      },
    });

    if (usernameConflict) {
      return res.status(409).json({
        message:
          "That username was registered by another account. " +
          "Please restart signup with a different username.",
      });
    }

    const newUser = await User.create({
      username: pendingUser.userName,
      email: pendingUser.email,
      password: pendingUser.password,
      phoneNumber: pendingUser.phoneNumber,
      isOptedInForPromotions:
        pendingUser.isOptedInForPromotions === true,
      isOptedInForEmailUpdates:
        pendingUser.isOptedInForEmailUpdates === true,
      hasAcceptedPrivacyPolicy:
        Boolean(
          pendingUser.privacyPolicyAcceptedAt
        ),
      privacyPolicyAcceptedAt:
        pendingUser.privacyPolicyAcceptedAt ||
        null,
      hasAcceptedTermsOfService:
        Boolean(pendingUser.termsAcceptedAt),
      termsAcceptedAt:
        pendingUser.termsAcceptedAt || null,
      isVerified: true,
      role: "user",
    });

    if (guestSessionId) {
      try {
        await mergeGuestCartToUserCart(
          guestSessionId,
          newUser.id
        );

        console.log(
          "Guest cart merged into new user cart:",
          {
            guestSessionId,
            userId: newUser.id,
          }
        );
      } catch (cartError) {
        /*
         * Account verification should not be undone because
         * an optional cart merge failed.
         */
        console.error(
          "Account created, but guest cart merge failed:",
          {
            guestSessionId,
            userId: newUser.id,
            message: cartError.message,
          }
        );
      }
    }

    await pendingUser.destroy();

    let thread = await Thread.findOne({
      where: {
        senderEmail: normalizedEmail,
        receiverEmail: null,
      },
    });

    if (!thread) {
      thread = await Thread.create({
        threadId: uuidv4(),
        senderEmail: normalizedEmail,
        receiverEmail: null,
        adminId: null,
      });
    }

    const existingWelcomeMessage =
      await Message.findOne({
        where: {
          threadId: thread.threadId,
          receiverUsername: newUser.username,
        },
      });

    if (!existingWelcomeMessage) {
      await Message.create({
        threadId: thread.threadId,
        senderUsername: null,
        receiverUsername: newUser.username,
        messageBody:
          "Hi, welcome to BakerBurns. How can I help?",
        createdAt: new Date(),
      });
    }

    return res.status(200).json({
      message: "Account created successfully.",
      verified: true,
      redirectUrl: getUserFrontendUrl(),
    });
  } catch (error) {
    console.error("Account creation error:", {
      message: error.message,
      stack: error.stack,
      email: normalizedEmail,
    });

    return res.status(500).json({
      message:
        "The account could not be created. Please try again.",
    });
  }
};

/*
 * POST /generate-login-token
 */
const generateLoginTokenAndSetCookie = async (
  req,
  res
) => {
  const normalizedEmail =
    normalizeEmail(req.body.email);

  if (!normalizedEmail) {
    return res.status(400).json({
      message: "Email is required.",
    });
  }

  try {
    const user = await User.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found.",
      });
    }

    if (user.isVerified === false) {
      return res.status(403).json({
        message:
          "Please verify your email before logging in.",
      });
    }

    const token = jwt.sign(
      {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "1h",
      }
    );

    const cookieOptions = {
      httpOnly: true,
      secure:
        process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 1000,
      sameSite: "lax",
      path: "/",
    };

    /*
     * Do not set a domain unless COOKIE_DOMAIN exists.
     * Omitting it creates a normal host-only cookie.
     */
    if (process.env.COOKIE_DOMAIN) {
      cookieOptions.domain =
        process.env.COOKIE_DOMAIN;
    }

    res.cookie(
      "authToken",
      token,
      cookieOptions
    );

    return res.status(200).json({
      message: "Login successful.",
      redirectUrl: getUserFrontendUrl(),
    });
  } catch (error) {
    console.error(
      "Login-token generation error:",
      {
        message: error.message,
        stack: error.stack,
        email: normalizedEmail,
      }
    );

    return res.status(500).json({
      message:
        "Failed to log in and set the authentication cookie.",
    });
  }
};

/*
 * POST /resend-verification
 */
const resendVerificationEmail = async (
  req,
  res
) => {
  const normalizedEmail =
    normalizeEmail(req.body.email);

  if (!isValidEmail(normalizedEmail)) {
    return res.status(400).json({
      message:
        "Please provide a valid email address.",
    });
  }

  try {
    const pendingUser = await PendingUser.findOne({
      where: {
        email: normalizedEmail,
      },
    });

    if (!pendingUser) {
      return res.status(404).json({
        message:
          "Pending account not found or already verified.",
      });
    }

    if (isPendingUserExpired(pendingUser)) {
      await pendingUser.destroy();

      return res.status(410).json({
        message:
          "Your pending registration expired. Please sign up again.",
      });
    }

    /*
     * Generate a fresh token so the expiration is renewed.
     * Older verification links become invalid.
     */
    const verificationToken = jwt.sign(
      {
        email: normalizedEmail,
        purpose: "email-verification",
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "24h",
      }
    );

    await pendingUser.update({
      verificationToken,
    });

    await sendVerificationEmail(
      normalizedEmail,
      verificationToken,
      "sign-up"
    );

    return res.status(200).json({
      message:
        "Verification email resent. Please check your inbox.",
    });
  } catch (error) {
    console.error(
      "Resend verification error:",
      {
        message: error.message,
        stack: error.stack,
        email: normalizedEmail,
      }
    );

    return res.status(500).json({
      message:
        "The verification email could not be sent.",
    });
  }
};

module.exports = {
  signup,
  resendVerificationEmail,
  checkUsername,
  createAccount,
  generateLoginTokenAndSetCookie,
};