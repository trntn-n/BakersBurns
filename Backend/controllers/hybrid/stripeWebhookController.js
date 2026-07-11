//stripeWebhookController.js
const stripe_mode = process.env.STRIPE_MODE === "test"
let stripe_m, stripe_webhook_m;

if(stripe_mode) {
  stripe_m = process.env.STRIPE_TEST_SECRET_KEY;
  stripe_webhook_m = process.env.STRIPE_TEST_WEBHOOK_SECRET;
} else {
  stripe_m = process.env.STRIPE_SECRET_KEY;
  stripe_webhook_m = process.env.STRIPE_WEBHOOK_SECRET;
}

const stripe = require('stripe')(stripe_m);
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
const {sequelize } = require('../../models/index');

const handleWebhook = async (req, res) => {
  const signature = req.headers['stripe-signature'];

  const webhookSecret = stripe_webhook_m;

  if (!webhookSecret) {
    console.error('Stripe webhook secret is missing.');

    return res.status(500).send(
      'Webhook configuration error.'
    );
  }

  let event;

  /*
   * Signature verification must happen before the
   * database transaction begins.
   */
  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      webhookSecret
    );
  } catch (error) {
    console.error(
      'Stripe webhook signature verification failed:',
      error.message
    );

    return res.status(400).send(
      `Webhook Error: ${error.message}`
    );
  }

  console.log('Stripe webhook received:', {
    eventId: event.id,
    type: event.type,
    connectedAccount: event.account || null,
  });

  try {
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;

      console.log(
        'Processing checkout.session.completed:',
        session.id
      );

      /*
       * Since you currently accept card payments only,
       * payment_status should normally be "paid".
       */
      if (session.payment_status !== 'paid') {
        console.warn(
          `Checkout Session ${session.id} is not paid. ` +
          `Current status: ${session.payment_status}`
        );

        return res.status(200).send(
          'Checkout completed but payment is not paid.'
        );
      }

      const internalSessionId =
        session.metadata?.sessionId || null;

      const metadataUserId =
        session.metadata?.userId || null;

      const customerEmail =
        session.customer_details?.email ||
        session.customer_email ||
        null;

      const total =
        Number(session.amount_total || 0) / 100;

      if (!customerEmail) {
        console.error(
          `Checkout Session ${session.id} has no customer email.`
        );

        return res.status(400).send(
          'Webhook Error: Missing customer email.'
        );
      }

      const transaction =
        await sequelize.transaction();

      let order;
      let user;
      let isNewGuest = false;
      let cartItems;
      let orderItemsForEmail;

      try {
        /*
         * Find the customer by metadata first when available.
         * Fall back to email for guest checkout.
         */
        if (metadataUserId) {
          user = await User.findByPk(
            metadataUserId,
            {
              transaction,
              lock: transaction.LOCK.UPDATE,
            }
          );
        }

        if (!user) {
          user = await User.findOne({
            where: {
              email: customerEmail,
            },
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
        }

        isNewGuest = !user;

        if (!user) {
          user = await User.create(
            {
              email: customerEmail,
              username: customerEmail,
              isGuest: true,
              hasAcceptedPrivacyPolicy: true,
              privacyPolicyAcceptedAt:
                new Date(),
              hasAcceptedTermsOfService: true,
              termsAcceptedAt:
                new Date(),
              role: 'user',
            },
            {
              transaction,
            }
          );

          console.log(
            `Guest user created for ${customerEmail}.`
          );

          const threadId = uuidv4();

          const thread = await Thread.create(
            {
              threadId,
              senderEmail: customerEmail,
              receiverEmail: null,
              adminId: null,
            },
            {
              transaction,
            }
          );

          await Message.create(
            {
              threadId: thread.threadId,
              senderUsername: null,
              receiverUsername: user.username,
              messageBody:
                'Welcome to BakersBurns! ' +
                'If you have any questions, feel free to ask.',
              createdAt: new Date(),
            },
            {
              transaction,
            }
          );
        }

        /*
         * Guest checkout has metadata.sessionId.
         * Registered checkout has metadata.userId.
         */
        if (internalSessionId) {
          cartItems = await GuestCart.findAll({
            where: {
              sessionId: internalSessionId,
            },
            include: [
              {
                model: Product,
                as: 'Product',
              },
            ],
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
        } else {
          cartItems = await Cart.findAll({
            where: {
              userId: user.id,
            },
            include: [
              {
                model: Product,
                as: 'product',
              },
            ],
            transaction,
            lock: transaction.LOCK.UPDATE,
          });
        }

        /*
         * The cart is cleared after successful processing.
         * Returning 200 here prevents a repeated Stripe webhook
         * from repeatedly reducing stock.
         */
        if (!cartItems || cartItems.length === 0) {
          await transaction.rollback();

          console.warn(
            `No cart items found for Stripe Session ${session.id}. ` +
            'It may already have been processed.'
          );

          return res.status(200).send(
            'Checkout already processed or cart is empty.'
          );
        }

        const shippingAddress = encrypt(
          JSON.stringify(
            session.shipping_details?.address ||
            session.collected_information
              ?.shipping_details?.address ||
            {}
          )
        );

        const billingAddress = encrypt(
          JSON.stringify(
            session.customer_details?.address || {}
          )
        );

        order = await Order.create(
          {
            userId: user.id,
            total,
            shippingAddress,
            billingAddress,
            status: 'processing',
          },
          {
            transaction,
          }
        );

        console.log(
          `Order ${order.id} created for Stripe Session ${session.id}.`
        );

        orderItemsForEmail = [];

        /*
         * Process products sequentially inside one transaction.
         *
         * Do not use Promise.all here. Each product row is locked
         * before its quantity is changed.
         */
        for (const cartItem of cartItems) {
          const productId =
            cartItem.productId ||
            cartItem.Product?.id ||
            cartItem.product?.id;

          if (!productId) {
            throw new Error(
              `Missing product ID for cart item ${cartItem.id}.`
            );
          }

          const purchasedQuantity =
            Number(cartItem.quantity);

          if (
            !Number.isInteger(purchasedQuantity) ||
            purchasedQuantity <= 0
          ) {
            throw new Error(
              `Invalid purchased quantity for product ${productId}.`
            );
          }

          const product = await Product.findByPk(
            productId,
            {
              transaction,
              lock: transaction.LOCK.UPDATE,
            }
          );

          if (!product) {
            throw new Error(
              `Product ${productId} was not found.`
            );
          }

          const previousQuantity =
            Number(product.quantity);

          if (
            !Number.isInteger(previousQuantity) ||
            previousQuantity < purchasedQuantity
          ) {
            throw new Error(
              `Insufficient stock for ${product.name}. ` +
              `Available: ${previousQuantity}; ` +
              `purchased: ${purchasedQuantity}.`
            );
          }

          const newQuantity =
            previousQuantity - purchasedQuantity;

          await product.update(
            {
              quantity: newQuantity,
            },
            {
              transaction,
            }
          );

          await OrderItem.create(
            {
              orderId: order.id,
              productId: product.id,
              quantity: purchasedQuantity,
              price: product.price,
            },
            {
              transaction,
            }
          );

          orderItemsForEmail.push({
            name: product.name,
            quantity: purchasedQuantity,
            price: product.price,
          });

          console.log(
            `Inventory updated for ${product.name}: ` +
            `${previousQuantity} -> ${newQuantity}`
          );
        }

        /*
         * Clearing the cart is part of the same transaction as
         * reducing stock. If any operation fails, everything rolls back.
         */
        if (internalSessionId) {
          await GuestCart.destroy({
            where: {
              sessionId: internalSessionId,
            },
            transaction,
          });

          console.log(
            `Guest cart cleared: ${internalSessionId}`
          );
        } else {
          await Cart.destroy({
            where: {
              userId: user.id,
            },
            transaction,
          });

          console.log(
            `Registered cart cleared for user ${user.id}.`
          );
        }

        await transaction.commit();

        console.log(
          `Order ${order.id} and inventory changes committed.`
        );
      } catch (error) {
        if (!transaction.finished) {
          await transaction.rollback();
        }

        throw error;
      }

      /*
       * Send emails only after the database transaction commits.
       * An email failure should not roll back a completed payment/order.
       */
      try {
        await sendOrderEmail(
          isNewGuest
            ? 'newGuest'
            : 'existingUser',
          customerEmail,
          {
            total,
            orderItems: orderItemsForEmail,
            orderUrl:
              `${process.env.ORDER_URL}/${order.id}`,
          }
        );

        console.log(
          `Order confirmation email sent to ${customerEmail}.`
        );
      } catch (emailError) {
        console.error(
          'Failed to send customer order email:',
          emailError
        );
      }

      try {
        const admins = await User.findAll({
          where: {
            role: 'admin',
          },
        });

        const adminEmails = admins
          .map((admin) => admin.email)
          .filter(Boolean);

        if (adminEmails.length > 0) {
          await sendOrderEmail(
            'adminNotification',
            adminEmails.join(','),
            {
              total,
              orderItems: orderItemsForEmail,
              status: 'processing',
            }
          );

          console.log(
            'Admin order notification sent.'
          );
        } else {
          console.warn(
            'No admin email addresses were found.'
          );
        }
      } catch (emailError) {
        console.error(
          'Failed to send admin order notification:',
          emailError
        );
      }

      return res.status(200).send(
        'Checkout Session processed successfully.'
      );
    }

    if (event.type === 'checkout.session.expired') {
      const session = event.data.object;

      /*
       * Inventory is not reserved when Checkout begins.
       * Therefore, expiration must not add inventory back.
       */
      console.log(
        `Checkout Session expired: ${session.id}. ` +
        'No inventory change is required.'
      );

      return res.status(200).send(
        'Expired Checkout Session acknowledged.'
      );
    }

    console.log(
      `Unhandled Stripe event type: ${event.type}`
    );

    return res.status(200).send(
      'Webhook received successfully.'
    );
  } catch (error) {
    console.error(
      'Error processing Stripe webhook:',
      {
        message: error.message,
        stack: error.stack,
        eventId: event?.id,
        eventType: event?.type,
      }
    );

    /*
     * Return 500 for processing failures so Stripe retries.
     * Signature failures already return 400 above.
     */
    return res.status(500).send(
      `Webhook processing failed: ${error.message}`
    );
  }
};



const cancelCheckoutSession = async (req, res) => {
  try {
    const userId = req.user?.id;

    if (!userId) {
      return res.status(401).json({
        message: 'Unauthorized: User not found.',
      });
    }

    /*
     * Creating or canceling a Checkout Session does not
     * reserve or subtract inventory. Stock is reduced only
     * by checkout.session.completed in the webhook.
     */
    console.log(
      `Checkout canceled for user ${userId}. ` +
      'No inventory change was made.'
    );

    return res.status(200).json({
      message: 'Checkout session canceled.',
    });
  } catch (error) {
    console.error(
      'Error canceling Checkout Session:',
      error
    );

    return res.status(500).json({
      message:
        'Failed to cancel Checkout Session.',
    });
  }
};
module.exports = { handleWebhook, cancelCheckoutSession };
