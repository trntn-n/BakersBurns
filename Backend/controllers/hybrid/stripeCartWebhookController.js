"use strict";

const stripeModeIsTest = process.env.STRIPE_MODE === "test";
const stripeSecretKey = stripeModeIsTest
  ? process.env.STRIPE_TEST_SECRET_KEY
  : process.env.STRIPE_SECRET_KEY;
const stripeWebhookSecret = stripeModeIsTest
  ? process.env.STRIPE_TEST_CART_WEBHOOK_SECRET
  : process.env.STRIPE_CART_WEBHOOK_SECRET;

const stripe = require("stripe")(stripeSecretKey);
const { v4: uuidv4 } = require("uuid");

const Order = require("../../models/order");
const Product = require("../../models/product");
const Cart = require("../../models/cart");
const OrderItem = require("../../models/orderItem");
const Thread = require("../../models/threads");
const Message = require("../../models/messages");
const User = require("../../models/user");
const GuestCart = require("../../models/guestCart");
const { sequelize } = require("../../models/index");
const { encrypt } = require("../../utils/encrypt");
const { sendOrderEmail } = require("../../utils/orderEmail");

const encryptAddress = (address) => {
  if (!address) return null;
  const normalized =
    typeof address === "string" ? address : JSON.stringify(address);
  return normalized.trim() ? encrypt(normalized) : null;
};

const getShippingAddress = (session) =>
  session.shipping_details?.address ||
  session.collected_information?.shipping_details?.address ||
  null;

const getBillingAddress = (session) =>
  session.customer_details?.address || null;

const getCartProduct = (cartItem) =>
  cartItem.Product || cartItem.product || null;

const findOrCreateCheckoutUser = async ({
  metadataUserId,
  customerEmail,
  transaction,
}) => {
  let user = null;

  if (metadataUserId) {
    user = await User.findByPk(metadataUserId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  if (!user) {
    user = await User.findOne({
      where: { email: customerEmail },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  const isNewGuest = !user;

  if (!user) {
    user = await User.create(
      {
        email: customerEmail,
        username: customerEmail,
        isGuest: true,
        hasAcceptedPrivacyPolicy: true,
        privacyPolicyAcceptedAt: new Date(),
        hasAcceptedTermsOfService: true,
        termsAcceptedAt: new Date(),
        role: "user",
      },
      { transaction }
    );

    const thread = await Thread.create(
      {
        threadId: uuidv4(),
        senderEmail: customerEmail,
        receiverEmail: null,
        adminId: null,
      },
      { transaction }
    );

    await Message.create(
      {
        threadId: thread.threadId,
        senderUsername: null,
        receiverUsername: user.username,
        messageBody:
          "Welcome to BakersBurns! If you have any questions, feel free to ask.",
        createdAt: new Date(),
      },
      { transaction }
    );
  }

  return { user, isNewGuest };
};

const getCheckoutCartItems = async ({
  internalSessionId,
  userId,
  transaction,
}) => {
  if (internalSessionId) {
    return GuestCart.findAll({
      where: { sessionId: internalSessionId },
      include: [{ model: Product, as: "Product" }],
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  }

  return Cart.findAll({
    where: { userId },
    include: [{ model: Product, as: "product" }],
    transaction,
    lock: transaction.LOCK.UPDATE,
  });
};

const createOrderItemsAndReduceInventory = async ({
  order,
  cartItems,
  transaction,
}) => {
  const emailItems = [];

  for (const cartItem of cartItems) {
    const includedProduct = getCartProduct(cartItem);
    const productId = cartItem.productId || includedProduct?.id;
    const purchasedQuantity = Number(cartItem.quantity);

    if (!productId) {
      throw new Error(`Cart item ${cartItem.id} has no product ID.`);
    }

    if (
      !Number.isInteger(purchasedQuantity) ||
      purchasedQuantity <= 0
    ) {
      throw new Error(
        `Invalid quantity for product ${productId}.`
      );
    }

    const product = await Product.findByPk(productId, {
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!product) {
      throw new Error(`Product ${productId} was not found.`);
    }

    const availableQuantity = Number(product.quantity);

    if (
      !Number.isInteger(availableQuantity) ||
      availableQuantity < purchasedQuantity
    ) {
      throw new Error(
        `Insufficient stock for ${product.name}. Available: ` +
          `${availableQuantity}; purchased: ${purchasedQuantity}.`
      );
    }

    await product.update(
      { quantity: availableQuantity - purchasedQuantity },
      { transaction }
    );

    await OrderItem.create(
      {
        orderId: order.id,
        productId: product.id,
        quantity: purchasedQuantity,
        price: product.price,
      },
      { transaction }
    );

    emailItems.push({
      name: product.name,
      quantity: purchasedQuantity,
      price: product.price,
      image: product.thumbnail,
    });
  }

  return emailItems;
};

const clearCheckoutCart = async ({
  internalSessionId,
  userId,
  transaction,
}) => {
  if (internalSessionId) {
    await GuestCart.destroy({
      where: { sessionId: internalSessionId },
      transaction,
    });
    return;
  }

  await Cart.destroy({
    where: { userId },
    transaction,
  });
};

const sendCheckoutEmails = async ({
  order,
  total,
  customerEmail,
  isNewGuest,
  orderItems,
}) => {
  try {
    await sendOrderEmail(
      isNewGuest ? "newGuest" : "existingUser",
      customerEmail,
      {
        orderNumber: order.id,
        total,
        orderItems,
        orderUrl: `${process.env.ORDER_URL}/${order.id}`,
      }
    );
  } catch (error) {
    console.error("Unable to send customer order email:", error);
  }

  try {
    const admins = await User.findAll({
      where: { role: "admin" },
      attributes: ["email"],
    });
    const adminEmails = admins
      .map((admin) => admin.email)
      .filter(Boolean);

    if (adminEmails.length) {
      await sendOrderEmail(
        "adminNotification",
        adminEmails.join(","),
        {
          orderNumber: order.id,
          total,
          orderItems,
          status: "processing",
        }
      );
    }
  } catch (error) {
    console.error("Unable to send admin order email:", error);
  }
};

const processCompletedCheckout = async (session) => {
  if (session.payment_status !== "paid") {
    return {
      alreadyHandled: true,
      message: "Checkout completed but payment is not paid.",
    };
  }

  const internalSessionId = session.metadata?.sessionId || null;
  const metadataUserId = session.metadata?.userId || null;
  const customerEmail =
    session.customer_details?.email ||
    session.customer_email ||
    null;

  if (!customerEmail) {
    const error = new Error("Checkout is missing customer email.");
    error.status = 400;
    throw error;
  }

  const total = Number(session.amount_total || 0) / 100;
  const transaction = await sequelize.transaction();
  let completedResult;

  try {
    const { user, isNewGuest } =
      await findOrCreateCheckoutUser({
        metadataUserId,
        customerEmail,
        transaction,
      });

    const cartItems = await getCheckoutCartItems({
      internalSessionId,
      userId: user.id,
      transaction,
    });

    /*
     * An empty cart indicates that this Stripe event has already
     * completed. Treat it as success so Stripe does not retry it.
     */
    if (!cartItems.length) {
      await transaction.rollback();
      return {
        alreadyHandled: true,
        message: "Checkout already processed or cart is empty.",
      };
    }

    const order = await Order.create(
      {
        userId: user.id,
        total,
        shippingAddress: encryptAddress(
          getShippingAddress(session)
        ),
        billingAddress: encryptAddress(
          getBillingAddress(session)
        ),
        status: "processing",
      },
      { transaction }
    );

    const orderItems =
      await createOrderItemsAndReduceInventory({
        order,
        cartItems,
        transaction,
      });

    await clearCheckoutCart({
      internalSessionId,
      userId: user.id,
      transaction,
    });

    await transaction.commit();

    completedResult = {
      order,
      total,
      customerEmail,
      isNewGuest,
      orderItems,
    };
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }
    throw error;
  }

  await sendCheckoutEmails(completedResult);

  return {
    alreadyHandled: false,
    message: "Checkout Session processed successfully.",
  };
};

const handleCartWebhook = async (req, res) => {
  const signature = req.headers["stripe-signature"];

  if (!stripeWebhookSecret) {
    console.error("Stripe cart webhook secret is missing.");
    return res.status(500).send("Webhook configuration error.");
  }

  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      signature,
      stripeWebhookSecret
    );
  } catch (error) {
    console.error(
      "Stripe webhook signature verification failed:",
      error.message
    );
    return res
      .status(400)
      .send(`Webhook Error: ${error.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const result = await processCompletedCheckout(
        event.data.object
      );
      return res.status(200).send(result.message);
    }

    if (event.type === "checkout.session.expired") {
      return res.status(200).send(
        "Expired Checkout Session acknowledged."
      );
    }

    return res.status(200).send(
      "Webhook received successfully."
    );
  } catch (error) {
    console.error("Unable to process Stripe cart webhook:", {
      message: error.message,
      eventId: event?.id,
      eventType: event?.type,
    });

    return res
      .status(error.status || 500)
      .send(`Webhook processing failed: ${error.message}`);
  }
};

const cancelCheckoutSession = async (req, res) => {
  const userId = req.user?.id;

  if (!userId) {
    return res.status(401).json({
      message: "Unauthorized: User not found.",
    });
  }

  /*
   * Checkout creation does not reserve inventory, so cancellation
   * requires no inventory mutation.
   */
  return res.status(200).json({
    message: "Checkout session canceled.",
  });
};

module.exports = {
  handleCartWebhook,
  cancelCheckoutSession,
};
