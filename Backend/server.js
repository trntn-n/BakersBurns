const path = require('path');

// Load dotenv with environment-specific configuration
if (process.env.NODE_ENV === 'production') {
  require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });
  console.log('Running in Production Mode');
} else {
  require('dotenv').config(); // Defaults to .env in the same directory
  console.log('Running in Development Mode');
}
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');


const cron = require('node-cron');
const { exec } = require('child_process');

const session = require('express-session');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken'); // Assuming JWT is used for auth
const db = require('./models/index');
const sequelize = require('./config/database'); // Import the Sequelize instance
const helmet = require('helmet');
 // Applies all default security headers
 const {
  lowSecurityRateLimiter,
  mediumSecurityRateLimiter,
  highSecurityRateLimiter,
  handleFailedLogin,
  clearFailedAttempts,
} = require('./utils/rateLimiter'); 
// Import routes
const cartRoutes = require('./routes/user/cartRoutes');

const emailVerificationRoutes = require('./routes/verificationRoutes');
const productRoutes = require('./routes/admin/productRoutes');
const userRoutes = require('./routes/user/userRoutes');
const accountSettingsRoutes = require('./routes/accountSettingsRoutes');
const galleryRoutes = require('./routes/admin/galleryRoutes');
const authRoutes = require('./routes/authRoutes');
const storeRoutes = require('./routes/user/storeRoutes');
const verifiedRoutes = require('./routes/verifiedRoutes');
const signupRoutes = require('./routes/register/signupRoutes');
const adminMessagingRoutes = require('./routes/admin/adminMessageRoutes');
const userMessagingRoutes = require('./routes/user/userMessagingRoutes');
const adminEmailRoutes = require('./routes/admin/adminEmailRoutes');
const ordersRoutes = require('./routes/admin/ordersRoutes');
const stripeRoutes = require('./routes/user/stripeRoutes');
const passkeyRoutes = require('./routes/admin/adminPasskeyRoutes');
const stripeWebhookRoutes = require('./routes/user/stripeWebhookRoutes');
const userOrderRoutes = require('./routes/user/orderRoutes');
const registerStoreRoutes = require('./routes/register/storeRegister');
const adminEventRoutes = require('./routes/admin/adminEventRoutes');
const userEventRoutes = require('./routes/user/eventRoutes');
const userGalleryRoutes = require('./routes/user/galleryRoutes');
const registerRates = require('./routes/register/rates.js');
const registerCartRoutes = require('./routes/register/cartRoutes');
const notificationRoutes = require('./routes/admin/notifcationRoutes');
const socialRoutes = require('./routes/register/socialRoutes');
const adminSocialRoutes = require('./routes/admin/adminSocialRoutes');
const adminDiscountRoutes = require('./routes/admin/adminDiscountRoutes');
const { rateLimiter } = require('./utils/rateLimiter');
const googleRoutes = require('./routes/register/googleRoutes');
const invoiceRoutes = require('./routes/admin/invoiceRoutes');
const registerEventRoutes = require('./routes/register/eventRoutes');

 // Assuming passport.js is in the same directory




// Initialize Express app
const app = express();

// Set allowed origins based on environment
const allowedOrigins = process.env.NODE_ENV === 'production'
  ? [
      process.env.PROD_USER_FRONTEND,
      process.env.PROD_ADMIN_FRONTEND,
      process.env.PROD_REGISTER_FRONTEND
    ]
  : [
      process.env.USER_FRONTEND,
      process.env.ADMIN_FRONTEND,
      process.env.REGISTER_FRONTEND
    ];


    
    app.use(cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      credentials: true,
    }));
app.use(
  helmet({
    crossOriginResourcePolicy: false, // ✅ Allows cross-origin images
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        imgSrc: [
          "'self'",
          "data:", // ✅ Allow inline base64 images
          process.env.NODE_ENV === "production"
            ? process.env.USER_FRONTEND
            : process.env.DEV_USER_URL, // ✅ Choose based on environment
          process.env.NODE_ENV === "production"
            ? process.env.ADMIN_FRONTEND
            : process.env.DEV_ADMIN_URL, // ✅ Admin domain (prod/dev)
          process.env.NODE_ENV === "production"
            ? process.env.REGISTER_FRONTEND
            : process.env.DEV_REGISTER_URL, // ✅ Register domain (prod/dev)
          process.env.BACKEND_URL, // ✅ Allow API itself if needed
          process.env.NODE_ENV === "production"
            ? "https://admin.bakersburns.com"
            : "http://localhost:5010", // ✅ Explicitly allow local dev frontend
          process.env.NODE_ENV === "production"
            ? "https://api.bakersburns.com"
            : "http://localhost:3450", // ✅ Local backend access for development
        ].filter(Boolean), // ✅ Removes undefined values if a variable is missing
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // ✅ Adjust for necessary script security
        styleSrc: ["'self'", "'unsafe-inline'"], // ✅ Allow inline styles
      },
    },
  })
);



app.use('/stripe-webhook-routes', express.raw({ type: 'application/json' }), stripeWebhookRoutes);


app.use(bodyParser.json());
app.use(cookieParser());

const adminAuthMiddleware = require('./middleware/adminAuthMiddleware'); // Add the middleware
const userAuthMiddleware = require('./middleware/userAuthMiddleware');

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' } // Secure only in production
}));

// Middleware to force HTTPS in production
if (process.env.NODE_ENV === 'production') {
  app.use((req, res, next) => {
    if (req.headers['x-forwarded-proto'] !== 'https') {
      return res.redirect(`https://${req.headers.host}${req.url}`);
    }
    next();
  });
}



// Serve static files
app.use('/register', express.static(path.join(__dirname, 'public/register')));
app.use('/user', express.static(path.join(__dirname, 'public/user')));
app.use('/sign-up', signupRoutes);

//Passkey Routes 
app.use('/login-passkey-routes', highSecurityRateLimiter('passkey'), passkeyRoutes);


//Register routes
app.use('/register-store', lowSecurityRateLimiter('register-store'), registerStoreRoutes);
app.use('/register-cart', lowSecurityRateLimiter('register-cart'), registerCartRoutes); 
app.use('/register-rates', lowSecurityRateLimiter('register-rates'), registerRates);
app.use('/register-events', lowSecurityRateLimiter('register-events'), registerEventRoutes);


// User routes
app.use('/auth', lowSecurityRateLimiter('auth'), authRoutes);
app.use('/verification', mediumSecurityRateLimiter('verification'), emailVerificationRoutes);
app.use('/verified', userAuthMiddleware('user'), mediumSecurityRateLimiter('verified'), verifiedRoutes);
app.use('/account-settings', mediumSecurityRateLimiter('account-settings'), accountSettingsRoutes);
app.use('/cart', userAuthMiddleware('user'), mediumSecurityRateLimiter('cart'), cartRoutes);
app.use('/user', userAuthMiddleware('user'), mediumSecurityRateLimiter('user'), userRoutes);
app.use('/store', userAuthMiddleware('user'), mediumSecurityRateLimiter('store'), storeRoutes);
app.use('/user-message-routes', userAuthMiddleware('user'), mediumSecurityRateLimiter('user-messaging'), userMessagingRoutes);
app.use('/user-orders', userAuthMiddleware('user'), mediumSecurityRateLimiter('user-orders'), userOrderRoutes);
app.use('/user-event', userAuthMiddleware('user'), mediumSecurityRateLimiter('user-event'), userEventRoutes);
app.use('/user-gallery', mediumSecurityRateLimiter('user-gallery'), userGalleryRoutes);
app.use('/user-social', socialRoutes);



//STRIPE ROUTES
app.use('/stripe', lowSecurityRateLimiter('stripe'),stripeRoutes); 

// Google Routes
app.use('/google', googleRoutes);



// Admin routes (protected by adminAuthMiddleware)
app.use('/invoice-routes', adminAuthMiddleware('admin'), mediumSecurityRateLimiter('invoice-routes'), invoiceRoutes);
app.use('/products', adminAuthMiddleware('admin'), mediumSecurityRateLimiter('admin-products'), productRoutes);
app.use('/gallery-manager', adminAuthMiddleware('admin'), mediumSecurityRateLimiter('gallery-manager'), galleryRoutes);
app.use('/admin-mail', adminAuthMiddleware('admin'), mediumSecurityRateLimiter('admin-mail'), adminEmailRoutes);
app.use('/orders', adminAuthMiddleware('admin'), mediumSecurityRateLimiter('orders'), ordersRoutes);
app.use('/admin-message-routes', adminAuthMiddleware('admin'), mediumSecurityRateLimiter('admin-messaging'), adminMessagingRoutes);
app.use('/admin-event', adminAuthMiddleware('admin'), mediumSecurityRateLimiter('admin-event'), adminEventRoutes);
app.use('/admin-notifications', adminAuthMiddleware('admin'), notificationRoutes);
app.use('/admin-social', adminSocialRoutes);
app.use('/discount', adminAuthMiddleware('admin'),mediumSecurityRateLimiter('discounts'), adminDiscountRoutes);
app.use('/uploads', express.static(path.resolve(__dirname, 'uploads')));
app.use('/socialIcons', express.static(path.resolve(__dirname, 'socialIcons')));
app.use('/galleryuploads', express.static(path.join(__dirname, 'galleryuploads')));
app.use('/admin', express.static(path.join(__dirname, 'public/admin')));
app.use('/terms-of-service', express.static(path.join(__dirname, 'public/static/terms-of-service.html')));
app.use('/privacy-policy', express.static(path.join(__dirname, 'public/static/privacy-policy.html')));

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ message: 'Internal Server Error', error: err.message });
});

app.use((req, res, next) => {
  res.status(404).json({ message: 'Not Found' });
});

//CRON
const { checkShippedOrders } = require("./controllers/carrier/cronjobs/upsCronJob.js");
const { checkShippedOrdersUsps } = require("./controllers/carrier/cronjobs/uspsCronJob.js");
const {startDiscountCron} = require('./controllers/admin/cron/discountCronJob.js');
const cleanupMediaCron = require('./utils/mediaCronJob');
const scheduleCronJob = require('./utils/ordersCronJob');
const { register } = require('module');

cron.schedule('* * * * *', () => {
  console.log('Cron job running every minute...');

  const scriptPath = path.join(__dirname, 'convert-assets.js');
  exec(`node "${scriptPath}"`, (error, stdout, stderr) => {
    if (error) {
      console.error(`Error: ${error.message}`);
      return;
    }
    if (stderr) {
      console.error(`Stderr: ${stderr}`);
    }
    console.log(`Stdout: ${stdout}`);
  });
});


sequelize.authenticate()
  .then(async () => {
    console.log('✅ Database connected successfully.');

    const ENABLE_SYNC = process.env.SEQUELIZE_SYNC;

    if (ENABLE_SYNC === "true") {
      await db.sequelize.sync({ alter: true });
      console.log('✅ Database synchronized successfully.');
    } else {
      console.log('⚠️ Database sync skipped (ENABLE_SYNC = false).');
    }

    // ✅ Run asset conversion BEFORE cleanup
    
      // ✅ Only run cleanup AFTER conversion is done
      console.log("🚀 Running media cleanup cron...");
      cleanupMediaCron();
  

    console.log("🚀 Initializing order cron job...");
    scheduleCronJob();

    console.log("🚀 Initializing discount cron job...");
    startDiscountCron();
    
    console.log("🚀 Initializing UPS tracking cron job...");
    checkShippedOrders();
    checkShippedOrdersUsps();

    // ✅ Start the Express server
    const PORT = process.env.PORT || 3450;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('❌ Database connection failed:', err.message);
    process.exit(1);
  });



// Start the server

