const GuestCart = require('../../models/guestCart');
const Product = require('../../models/product');
const User = require('../../models/user');
const Token = require('../../models/token'); // Adjust the path as needed

const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

// Add to Guest Cart
const addToGuestCart = async (req, res) => {
  const { sessionId, productId, quantity } = req.body;

  if (!sessionId || !productId || !quantity) {
    return res.status(400).json({ message: "Session ID, product ID, and quantity are required." });
  }

  try {
    // 🔹 Fetch product details from the database
    const product = await Product.findByPk(productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found." });
    }

    if (quantity <= 0) {
      await GuestCart.destroy({ where: { sessionId, productId } });
      return res.status(200).json({ message: "Item removed from cart." });
    }

    // 🔹 Check if the product already exists in the guest cart
    const existingCartItem = await GuestCart.findOne({ where: { sessionId, productId } });

    if (existingCartItem) {
      existingCartItem.quantity = quantity;
      await existingCartItem.save();
    } else {
      await GuestCart.create({
        sessionId,
        productId,
        quantity,
        price: product.price,        // Fetch price from Product table
        thumbnail: product.thumbnail,
        weight: product.weight,      // Fetch weight from Product table
        length: product.length,      // Fetch length from Product table
        width: product.width,        // Fetch width from Product table
        height: product.height,      // Fetch height from Product table
        unit: product.unit,          // Fetch unit from Product table
      });
    }

    res.status(200).json({ message: "Item added/updated in cart successfully." });
  } catch (error) {
    console.error("Error adding item to guest cart:", error.message, error.stack);
    res.status(500).json({ message: "Failed to add item to cart." });
  }
};




// Get Guest Cart Items
// Get Guest Cart Items
const getCartItems = async (req, res) => {
  const { sessionId } = req.body;

  console.log("Received session ID:", sessionId);

  if (!sessionId) {
    return res.status(400).json({ message: "Session ID is required." });
  }

  try {
    const cartItems = await GuestCart.findAll({
      where: { sessionId },
      attributes: [
        "productId",
        "quantity",
        "price",
        "thumbnail",
        "weight",
        "length",
        "width",
        "height",
        "unit",
      ], // ✅ Explicitly select fields
    });

    console.log("Cart items fetched from DB:", cartItems);

    if (cartItems.length === 0) {
      return res.status(200).json({ cartDetails: [] });
    }

    // Build cart response with all necessary details
    const cartDetails = cartItems.map((item) => ({
      id: item.productId,
      name: `Test`, // Replace this with the actual product name if necessary
      price: item.price,
      thumbnail: item.thumbnail,
      quantity: item.quantity,
      total: item.price * item.quantity,
      weight: item.weight,
      length: item.length,
      width: item.width,
      height: item.height,
      unit: item.unit,
    }));

    console.log("Cart details sent to frontend:", cartDetails); // ✅ Confirm correct data

    res.status(200).json({ cartDetails });
  } catch (error) {
    console.error("Error fetching cart items:", error);
    res.status(500).json({ error: error.message });
  }
};


const deleteCartItem = async (req, res) => {
  const { sessionId, productId } = req.body;

  if (!sessionId || !productId) {
    return res.status(400).json({ message: 'Session ID and product ID are required.' });
  }

  try {
    const deletedRows = await GuestCart.destroy({
      where: { sessionId, productId },
    });

    if (deletedRows === 0) {
      return res.status(404).json({ message: 'Cart item not found.' });
    }

    res.status(200).json({ message: 'Cart item deleted successfully.' });
  } catch (error) {
    console.error('Error deleting cart item:', error);
    res.status(500).json({ message: 'Failed to delete cart item.' });
  }
};
const updateShippingDetails = async (req, res) => {
  const { sessionId, shippingDetails } = req.body;
  
  // Ensure that sessionId and shippingDetails are provided.
  if (!sessionId || !shippingDetails) {
    return res.status(400).json({ message: 'Session ID and shipping details are required.' });
  }
  
  const { selectedCarrier, selectedService, shippingCost } = shippingDetails;
  
  if (!selectedCarrier || !selectedService || shippingCost === undefined) {
    return res.status(400).json({ message: 'Incomplete shipping details.' });
  }
  
  try {
    // Update all rows in the GuestCart for this session.
    await GuestCart.update(
      {
        selectedCarrier,
        selectedService,
        shippingCost,
      },
      { where: { sessionId } }
    );
    
    return res.status(200).json({ message: 'Shipping details updated successfully.' });
  } catch (error) {
    console.error('Error updating shipping details:', error);
    return res.status(500).json({ message: 'Failed to update shipping details.' });
  }
};

// Lock Inventory
const lockInventory = async (req, res, next) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({ message: 'Session ID is required.' });
  }

  const t = await sequelize.transaction();

  try {
    const cartItems = await GuestCart.findAll({
      where: { sessionId },
      include: [Product],
      transaction: t,
      lock: t.LOCK.UPDATE, // prevent concurrent modifications
    });

    for (const cartItem of cartItems) {
      const product = cartItem.Product;
      if (!product) {
        await t.rollback();
        return res.status(404).json({ message: `Product ${cartItem.productId} not found.` });
      }

      if (product.quantity < cartItem.quantity) {
        await t.rollback();
        return res.status(400).json({ message: `Not enough stock for ${product.name}.` });
      }

      product.quantity -= cartItem.quantity;
      await product.save({ transaction: t });
    }

    await t.commit();
    next();
  } catch (error) {
    await t.rollback();
    console.error('Error locking inventory:', error);
    res.status(500).json({ message: 'Error locking inventory' });
  }
};

// Unlock Inventory
const unlockInventory = async (cartItems) => {
  try {
    for (const cartItem of cartItems) {
      const product = await Product.findByPk(cartItem.productId);

      if (product) {
        product.quantity += cartItem.quantity;
        await product.save();
      }
    }
  } catch (error) {
    console.error('Error unlocking inventory:', error.message, error.stack);
  }
};



const createCheckoutSession = async (req, res) => {
  try {
    const { sessionId, metadata } = req.body;

    if (!sessionId) {
      return res.status(400).json({ message: 'Session ID is required.' });
    }

    // Validate metadata for acceptance of terms
    if (
      !metadata ||
      !metadata.hasAcceptedPrivacy ||
      !metadata.hasAcceptedTermsOfService
    ) {
      return res.status(400).json({
        message: 'Must accept Terms and Conditions and Privacy Policy to proceed.',
        redirect: '/accept-privacy-terms',
      });
    }

    // Retrieve shipping details from the GuestCart (assumes all items share the same shipping info)
    const shippingInfo = await GuestCart.findOne({
      where: { sessionId },
      attributes: ['selectedCarrier', 'selectedService', 'shippingCost'],
    });

    if (
      !shippingInfo ||
      !shippingInfo.selectedCarrier ||
      !shippingInfo.selectedService ||
      shippingInfo.shippingCost == null
    ) {
      return res.status(400).json({ message: 'Shipping details are incomplete.' });
    }

    // Fetch cart items with associated product details
    const cartItems = await GuestCart.findAll({
      where: { sessionId },
      include: [
        {
          model: Product,
          as: 'Product',
        },
      ],
    });

    if (cartItems.length === 0) {
      return res.status(400).json({ message: 'Cart is empty.' });
    }

    // OPTIONAL: Light inventory check
    // (We do NOT subtract here - real lock/inventory decrement happens post-payment in the success flow or webhook.)
    for (const cartItem of cartItems) {
      const product = cartItem.Product;
      if (!product) {
        return res
          .status(404)
          .json({ message: `Product with ID ${cartItem.productId} not found.` });
      }
      if (product.quantity < cartItem.quantity) {
        return res
          .status(400)
          .json({ message: `Not enough quantity for ${product.name}.` });
      }
    }

    // Prepare Stripe line items from the cart items
    const lineItems = cartItems.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.Product.name,
          images: [`${process.env.BASE_URL}/uploads/${item.Product.thumbnail}`],
        },
        unit_amount: Math.round(item.Product.price * 100), // in cents
      },
      quantity: item.quantity,
    }));
     

    // Add a separate shipping line item
    const shippingLineItem = {
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Shipping (${shippingInfo.selectedCarrier} - ${shippingInfo.selectedService})`,
        },
        unit_amount: Math.round(shippingInfo.shippingCost * 100), // in cents
      },
      quantity: 1,
    };

    lineItems.push(shippingLineItem);

    //Payment transfer to connected account
    const connectedAccountId = process.env.BAKERS_BURNS_ACCOUNT_ID;
    if(!connectedAccountId || !connectedAccountId.startsWith("acct_")) {
      return res.status(500).json({
        message: '[FAILED] process.env.BAKERS_BURNS_ACCOUNT_ID  is null or invalid check environment variables.',
      })

    }
    const stripeMetadata = {
      sessionId: String(sessionId),
      hasAcceptedPrivacy: String(metadata.hasAcceptedPrivacy),
      hasAcceptedTermsOfService: String(metadata.hasAcceptedTermsOfService),
      selectedCarrier: String(shippingInfo.selectedCarrier),
      selectedService: String(shippingInfo.selectedService),
      shippingCost: String(shippingInfo.shippingCost),
    };

    const paymentIntentData = {
      transfer_data: {
        destination: connectedAccountId,
      },
      metadata: stripeMetadata,
    }
    // Create Stripe checkout session
    // (No expires_at since Stripe requires min 30 minutes. We'll rely on default or remove it entirely.)
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',

      metadata: stripeMetadata,

      payment_intent_data: paymentIntentData,
      // Remove expires_at or set to a value >= 30 minutes. For typical usage, omit it entirely.
      expires_at: Math.floor(Date.now() / 1000) + 60 * 30, // optional if you want a 30-min expiry

      success_url: `${process.env.REGISTER_FRONTEND}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.REGISTER_FRONTEND}/cancel?session_id={CHECKOUT_SESSION_ID}`,

      shipping_address_collection: {
        allowed_countries: ['US', 'CA'],
      },
      billing_address_collection: 'required',
    });

    console.log('✅ Stripe Session Created:', session.id);
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('❌ Error creating checkout session:', error);
    res.status(500).json({ message: 'Error creating checkout session' });
  }
};




// Cancel Checkout Session
const cancelCheckoutSession = async (req, res) => {
  try {
    const { sessionId } = req.body;

    if (!sessionId) {
      console.error("No sessionId provided in request.");
      return res.status(400).json({ message: 'Session ID is required.' });
    }

    console.log("Received sessionId:", sessionId);

    const cartItems = await GuestCart.findAll({
      where: { sessionId },
      include: [{ model: Product, as: 'Product' }],
    });

    console.log("Cart Items Fetched:", cartItems);

    if (cartItems.length === 0) {
      console.error(`No cart items found for sessionId: ${sessionId}`);
      return res.status(400).json({ message: 'No cart data found for session' });
    }

    // Unlock inventory
    for (const cartItem of cartItems) {
      const product = cartItem.Product;
      if (product) {
        product.quantity += cartItem.quantity;
        await product.save();
        console.log(
          `Unlocked inventory for product: ${product.name}, quantity restored: ${cartItem.quantity}`
        );
      }
    }

    res.status(200).json({ message: 'Inventory unlocked successfully' });
  } catch (error) {
    console.error('Error unlocking inventory:', error);
    res.status(500).json({ message: 'Failed to unlock inventory' });
  }
};
const setPassword = async (req, res) => {
  const { token, password } = req.body;

  if (!token || !password) {
    return res.status(400).json({ message: 'Token and password are required' });
  }

  try {
    // Step 1: Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const email = decoded.email;

    // Step 2: Validate the token in the database
    const storedToken = await Token.findOne({ where: { token, type: 'password_setup' } });
    if (!storedToken || new Date(storedToken.expiresAt) < new Date()) {
      return res.status(400).json({ message: 'Invalid or expired token' });
    }

    // Step 3: Validate the user exists
    const user = await User.findOne({ where: { email } });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    // Step 4: Hash the new password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Step 5: Update the user’s password
    user.password = hashedPassword;
    user.isGuest = false; // Convert guest to registered user
    await user.save();

    // Step 6: Remove the token from the database
    await Token.destroy({ where: { token } });

    return res.status(200).json({ message: 'Password has been set successfully. You can now log in.' });
  } catch (error) {
    console.error('Error in setPassword:', error.message);
    return res.status(500).json({ message: 'An error occurred while setting the password.' });
  }
};

module.exports = {
  addToGuestCart,
  getCartItems,
  lockInventory,
  unlockInventory,
  createCheckoutSession,
  cancelCheckoutSession,
  deleteCartItem,
  setPassword, 
  updateShippingDetails
};
