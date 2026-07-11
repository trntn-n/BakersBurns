const stripe = require('stripe')(process.env.STRIPE_TEST_SECRET_KEY);
const Cart = require('../../models/cart');
const Product = require('../../models/product');
const sequelize = require('../../config/database');


// Function to generate a custom order number
function generateOrderNumber(orderId) {
  return `ORD-${orderId}-${Date.now()}`;
}

// Checkout shoulsession creation
const createCheckoutSession = async (req, res) => {
  console.log("🚀 Received request to create checkout session.");
  console.log("🔍 Checking req.user:", req.user);
  if (!req.user || !req.user.id) {
    console.error("❌ Error: req.user or req.user.id is undefined!");
    return res.status(401).json({ message: "Unauthorized: User not found." });
  }
  const transaction = await sequelize.transaction();

  try {
    const userId = req.user.id;
    console.log(`🛒 Creating checkout session for userId: ${userId}`);

    // Fetch cart items including product details
    const cartItems = await Cart.findAll({
      where: { userId },
      include: [
        {
          model: Product,
          as: 'product',
          attributes: ['id', 'name', 'price', 'thumbnail', 'quantity'],
        },
      ],
      lock: transaction.LOCK.UPDATE,
      transaction,
    });

    if (!cartItems.length) {
      console.log('⚠️ No items in cart for userId:', userId);
      await transaction.rollback();
      return res.status(400).json({ message: 'No items in cart' });
    }

    console.log("✅ Raw Cart Items:", JSON.stringify(cartItems, null, 2));

    // Extract product details safely & fetch missing product IDs
    const processedCartItems = await Promise.all(
      cartItems.map(async (item) => {
        console.log(`🛒 Processing Cart Item ID: ${item.id}`);

        if (!item.product) {
          console.error(`❌ Cart item ${item.id} has no associated product.`);
          return null; // Mark as invalid
        }

        let productId = item.product.id;
        let productName = item.product.name;
        let productPrice = item.product.price;
        let productThumbnail = item.product.thumbnail;

        console.log(`🛒 Found Product: ID: ${productId}, Name: ${productName}`);

        if (!productId) {
          console.error(`❌ Product ID missing for cart item ${item.id}. Fetching from DB...`);

          if (!productName) {
            console.error(`❌ No product name available for cart item ID: ${item.id}, skipping.`);
            return null;
          }

          try {
            const foundProduct = await Product.findOne({
              where: { name: productName },
              attributes: ['id', 'name', 'price', 'thumbnail'],
            });

            if (!foundProduct) {
              console.error(`❌ No product found with name: ${productName}`);
              return null;
            }

            console.log(`✅ Retrieved product ID ${foundProduct.id} for ${foundProduct.name}`);

            // Update product details
            productId = foundProduct.id;
            productPrice = foundProduct.price;
            productThumbnail = foundProduct.thumbnail;
          } catch (dbError) {
            console.error(`❌ Error fetching product from DB: ${dbError.message}`);
            return null;
          }
        }

        return {
          productId,
          name: productName,
          price: productPrice,
          thumbnail: productThumbnail,
          quantity: item.quantity,
        };
      })
    );

    // Remove any null items
    const validCartItems = processedCartItems.filter(Boolean);

    if (validCartItems.length === 0) {
      console.error('❌ No valid products found in cart');
      await transaction.rollback();
      return res.status(400).json({ message: 'Error processing cart items' });
    }

    console.log("✅ Final Processed Cart Items:", validCartItems);

    // Validate stock
    for (const cartItem of validCartItems) {
      console.log(`🔍 Checking stock for Product ID ${cartItem.productId}`);

      const product = await Product.findByPk(cartItem.productId, { transaction });

      if (!product) {
        console.error(`❌ Product ID ${cartItem.productId} not found in database`);
        await transaction.rollback();
        return res.status(400).json({ message: `Product not found: ${cartItem.productId}` });
      }

      if (cartItem.quantity > product.quantity) {
        console.error(`❌ Not enough stock for ${product.name}`);
        await transaction.rollback();
        return res.status(400).json({ message: `Insufficient stock for product: ${product.name}` });
      }

      
    }

    // Stripe line items
    const lineItems = validCartItems.map((item) => ({
      price_data: {
        currency: 'usd',
        product_data: {
          name: item.name,
          images: [`${process.env.USER_FRONTEND}/uploads/${item.thumbnail}`],
        },
        unit_amount: item.price * 100,
      },
      quantity: item.quantity,
    }));
    const expiresAt = Math.floor(Date.now() / 1000) + 5 * 60;
    const account = await stripe.accounts.retrieve(
      process.env.BAKERS_BURNS_ACCOUNT_ID
    );
    
    console.log("========== STRIPE CONNECTED ACCOUNT ==========");
    console.log({
      id: account.id,
      capabilities: account.capabilities,
      charges_enabled: account.charges_enabled,
      payouts_enabled: account.payouts_enabled,
      currently_due: account.requirements?.currently_due,
      pending_verification: account.requirements?.pending_verification,
      disabled_reason: account.requirements?.disabled_reason,
    });
    console.log("==============================================");
    // Create Stripe checkout session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: lineItems,
      mode: 'payment',
      expires_at: expiresAt,
      success_url: `${process.env.USER_FRONTEND}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.USER_FRONTEND}/cancel`,
      billing_address_collection: 'required',
      shipping_address_collection: {
        allowed_countries: ['US'],
      },
      metadata: {
        userId: `${userId}`,
        productIds: validCartItems.map((item) => item.productId).join(','),
      },
    });

    await transaction.commit();

    console.log("✅ Stripe Checkout Session Created:", session.id);
    res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('❌ Error creating checkout session:', error);
    await transaction.rollback();
    res.status(500).json({ message: 'Failed to create checkout session', error: error.message });
  }
};


// Refund payment
const refundPayment = async (req, res) => {
  const { paymentIntentId } = req.body;

  try {
    const refund = await stripe.refunds.create({
      payment_intent: paymentIntentId,
    });
    res.status(200).json({ message: 'Refund processed successfully', data: refund });
  } catch (error) {
    res.status(500).json({ message: 'Failed to process refund', error: error.message });
  }
};

// Get Stripe events (optional for logging/debugging)
const getStripeEvents = async (req, res) => {
  try {
    const events = await StripeEvent.findAll(); // Assume you're storing events in a StripeEvent table
    res.status(200).json(events);
  } catch (error) {
    res.status(500).json({ message: 'Failed to retrieve Stripe events', error: error.message });
  }
};

module.exports = { createCheckoutSession, refundPayment, getStripeEvents };
