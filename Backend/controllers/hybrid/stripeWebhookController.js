//stripeWebhookController.js
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Order = require('../../models/order');
const Product = require('../../models/product');
const Cart = require('../../models/cart');
const OrderItem = require('../../models/orderItem');
const Thread = require('../../models/threads');
const Message = require('../../models/messages');
const User = require('../../models/user'); // Import User model

const GuestCart = require('../../models/guestCart'); // Import GuestCart model
const { encrypt } = require('../../utils/encrypt');
const { sendOrderEmail } = require('../../utils/orderEmail');
const {unlockInventory} = require('../register/cartController');
const { v4: uuidv4 } = require('uuid');

const handleWebhook = async (req, res) => {
  const sig = req.headers['stripe-signature'];

  try {
    // Construct the event using Stripe's library and your webhook secret
    const event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
    console.log('Webhook received, event type:', event.type);

    // Handle checkout session completed (successful payment)
    if (event.type === 'checkout.session.completed') {
      console.log('Processing checkout.session.completed event...');
      const session = event.data.object;
      const sessionId = session.metadata?.sessionId;
      const customerEmail = session.customer_details?.email;
      const total = session.amount_total / 100;

      if (!customerEmail) {
        console.error('Missing email from Stripe session.');
        return res.status(400).send('Webhook Error: Missing email.');
      }

      console.log(`Email for checkout: ${customerEmail}`);

      // Find or create a guest user account
      let user = await User.findOne({ where: { email: customerEmail } });
      const isNewGuest = !user;
      if (isNewGuest) {
        user = await User.create({
          email: customerEmail,
          username: customerEmail,
          isGuest: true,
          hasAcceptedPrivacyPolicy: true,
          privacyPolicyAcceptedAt: new Date(),
          hasAcceptedTermsOfService: true,
          termsAcceptedAt: new Date(),
          role: 'user',
        });
        console.log(`Guest user created with email: ${customerEmail}`);

        // Create a thread and an initial message for the new user
        const threadId = uuidv4();
        const thread = await Thread.create({
          threadId,
          senderEmail: customerEmail,
          receiverEmail: null,
          adminId: null,
        });
        console.log(`Thread created with ID: ${thread.threadId}`);

        await Message.create({
          threadId: thread.threadId,
          senderUsername: null,
          receiverUsername: user.username,
          messageBody: 'Welcome to BakersBurns! If you have any questions, feel free to ask.',
          createdAt: new Date(),
        });
        console.log(`Initial message created for thread: ${thread.threadId}`);
      }

      // Retrieve cart items (guest cart for session or user cart)
      let cartItems;
      if (sessionId) {
        cartItems = await GuestCart.findAll({
          where: { sessionId },
          include: [{ model: Product, as: 'Product' }],
        });
      } else {
        cartItems = await Cart.findAll({
          where: { userId: user.id },
          include: [{ model: Product, as: 'product' }],
        });
      }

      if (!cartItems || cartItems.length === 0) {
        console.error('Cart is empty or invalid.');
        return res.status(400).send('Webhook Error: Cart is empty.');
      }

      const shippingAddress = encrypt(JSON.stringify(session.shipping_details?.address || {}));
      const billingAddress = encrypt(JSON.stringify(session.customer_details?.address || {}));
      console.log('Encrypted Shipping Address:', shippingAddress);
      console.log('Encrypted Billing Address:', billingAddress);

      // Create an order
      const order = await Order.create({
        userId: user.id,
        total,
        shippingAddress,
        billingAddress,
        status: 'processing',
      });
      console.log(`Order created with ID: ${order.id}`);

      // Add order items for each cart item
      await Promise.all(
        cartItems.map(async (cartItem) => {
          // Always pull the product fresh from the DB (don’t trust include)
          const productId = cartItem.productId || cartItem.Product?.id;
          if (!productId) {
            console.error('Missing productId for cart item:', cartItem.id);
            return;
          }
      
          const product = await Product.findByPk(productId);
          if (!product) {
            console.error(`Product not found in DB for ID: ${productId}`);
            return;
          }
      
          // Decrease stock safely
          const newStock = Math.max(product.quantity - cartItem.quantity, 0);
          await product.update({ quantity: newStock });
      
          // Record the order item
          await OrderItem.create({
            orderId: order.id,
            productId: product.id,
            quantity: cartItem.quantity,
            price: product.price,
          });
      
          console.log(`Updated stock for ${product.name}: ${product.quantity} → ${newStock}`);
        })
      );
      
      console.log(`Order items created for order ID: ${order.id}`);

      // Clear guest cart if applicable
      if (sessionId) {
        await GuestCart.destroy({ where: { sessionId } });
        console.log(`Cleared guest cart for session ID: ${sessionId}`);
      }

      // Send email notifications
      const orderItems = cartItems.map(cartItem => ({
        name: cartItem.Product?.name || cartItem.product?.name,
        quantity: cartItem.quantity,
        price: cartItem.Product?.price || cartItem.product?.price,
      }));

      await sendOrderEmail(
        isNewGuest ? 'newGuest' : 'existingUser',
        customerEmail,
        {
          total,
          orderItems,
          orderUrl: `${process.env.ORDER_URL}/${order.id}`,
        }
      );
      console.log(`User email sent to ${customerEmail}.`);

      const admins = await User.findAll({ where: { role: 'admin' } });
      const adminEmails = admins.map(admin => admin.email).filter(email => email);
      if (adminEmails.length > 0) {
        await sendOrderEmail('adminNotification', adminEmails.join(','), {
          total,
          orderItems,
          status: 'processing',
        });
        console.log('Admin notification email sent.');
      } else {
        console.warn('No admin emails found to send admin notification.');
      }

      console.log('Webhook processing for checkout.session.completed completed.');
    }
    // Handle checkout session expiration
    else if (event.type === 'checkout.session.expired') {
      console.log('Processing checkout.session.expired event...');
      const session = event.data.object;
      const sessionId = session.metadata?.sessionId;
      if (sessionId) {
        // Fetch all guest cart items for this session
        const cartItems = await GuestCart.findAll({ where: { sessionId } });
        if (cartItems && cartItems.length > 0) {
          // Call your unlockInventory function to restore product quantities
          await unlockInventory(cartItems);
          console.log(`Inventory unlocked for expired session: ${sessionId}`);
          // Optionally, you could clear the guest cart here if desired.
        } else {
          console.log(`No cart items found for session: ${sessionId}`);
        }
      } else {
        console.warn('No sessionId found in expired session metadata.');
      }
    } else {
      console.log(`Unhandled event type: ${event.type}`);
    }

    res.status(200).send('Webhook received successfully');
  } catch (err) {
    console.error('Error in Stripe webhook handler:', err.message, err.stack);
    res.status(400).send(`Webhook Error: ${err.message}`);
  }
};



// Cancel checkout session (moved outside `handleWebhook`)
const cancelCheckoutSession = async (req, res) => {
  try {
    const userId = req.user.id;

    const cartItems = await Cart.findAll({
      where: { userId },
      include: [{ model: Product, as: 'product' }],
    });

    for (const cartItem of cartItems) {
      cartItem.product.quantity += cartItem.quantity; // Restore stock
      await cartItem.product.save();
    }

    console.log(`Stock restored for userId: ${userId} after session cancellation.`);
    res.status(200).json({ message: 'Checkout session canceled, stock restored.' });
  } catch (error) {
    console.error('Error canceling checkout session:', error);
    res.status(500).json({ message: 'Failed to cancel checkout session.' });
  }
};

module.exports = { handleWebhook, cancelCheckoutSession };
