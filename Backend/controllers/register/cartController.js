//cartController.js
'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const GuestCart = require('../../models/guestCart');
const Product = require('../../models/product');
const User = require('../../models/user');
const Token = require('../../models/token');
const sequelize = require('../../config/database');

const stripeSecretKey = process.env.STRIPE_TEST_SECRET_KEY;

if (!stripeSecretKey) {
  throw new Error(
    'Missing STRIPE_TEST_SECRET_KEY environment variable.'
  );
}

const stripe = require('stripe')(stripeSecretKey);

/**
 * Add or update an item in a guest cart.
 */
const addToGuestCart = async (req, res) => {
  const { sessionId, productId } = req.body;
  const quantity = Number(req.body.quantity);

  if (
    !sessionId ||
    !productId ||
    !Number.isInteger(quantity)
  ) {
    return res.status(400).json({
      message:
        'Session ID, product ID, and an integer quantity are required.',
    });
  }

  try {
    const product = await Product.findByPk(productId);

    if (!product) {
      return res.status(404).json({
        message: 'Product not found.',
      });
    }

    if (quantity <= 0) {
      await GuestCart.destroy({
        where: {
          sessionId,
          productId,
        },
      });

      return res.status(200).json({
        message: 'Item removed from cart.',
      });
    }

    const existingCartItem = await GuestCart.findOne({
      where: {
        sessionId,
        productId,
      },
    });

    if (existingCartItem) {
      existingCartItem.quantity = quantity;
      await existingCartItem.save();
    } else {
      await GuestCart.create({
        sessionId,
        productId,
        quantity,
        price: product.price,
        thumbnail: product.thumbnail,
        weight: product.weight,
        length: product.length,
        width: product.width,
        height: product.height,
        unit: product.unit,
      });
    }

    return res.status(200).json({
      message: 'Item added or updated successfully.',
    });
  } catch (error) {
    console.error(
      'Error adding item to guest cart:',
      error
    );

    return res.status(500).json({
      message: 'Failed to add item to cart.',
    });
  }
};

/**
 * Return the contents of a guest cart.
 */
const getCartItems = async (req, res) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      message: 'Session ID is required.',
    });
  }

  try {
    const cartItems = await GuestCart.findAll({
      where: {
        sessionId,
      },
      include: [
        {
          model: Product,
          as: 'Product',
          attributes: ['id', 'name'],
          required: false,
        },
      ],
      attributes: [
        'productId',
        'quantity',
        'price',
        'thumbnail',
        'weight',
        'length',
        'width',
        'height',
        'unit',
      ],
    });

    const cartDetails = cartItems.map((item) => ({
      id: item.productId,
      name: item.Product?.name || 'Unknown product',
      price: Number(item.price),
      thumbnail: item.thumbnail,
      quantity: item.quantity,
      total:
        Number(item.price) * item.quantity,
      weight: item.weight,
      length: item.length,
      width: item.width,
      height: item.height,
      unit: item.unit,
    }));

    return res.status(200).json({
      cartDetails,
    });
  } catch (error) {
    console.error(
      'Error fetching guest cart items:',
      error
    );

    return res.status(500).json({
      message: 'Failed to retrieve cart items.',
      error: error.message,
    });
  }
};

/**
 * Delete a single item from a guest cart.
 */
const deleteCartItem = async (req, res) => {
  const { sessionId, productId } = req.body;

  if (!sessionId || !productId) {
    return res.status(400).json({
      message:
        'Session ID and product ID are required.',
    });
  }

  try {
    const deletedRows = await GuestCart.destroy({
      where: {
        sessionId,
        productId,
      },
    });

    if (deletedRows === 0) {
      return res.status(404).json({
        message: 'Cart item not found.',
      });
    }

    return res.status(200).json({
      message: 'Cart item deleted successfully.',
    });
  } catch (error) {
    console.error(
      'Error deleting guest cart item:',
      error
    );

    return res.status(500).json({
      message: 'Failed to delete cart item.',
    });
  }
};

/**
 * Save shipping information for every item
 * associated with the guest session.
 */
const updateShippingDetails = async (req, res) => {
  const {
    sessionId,
    shippingDetails,
  } = req.body;

  if (!sessionId || !shippingDetails) {
    return res.status(400).json({
      message:
        'Session ID and shipping details are required.',
    });
  }

  const {
    selectedCarrier,
    selectedService,
    shippingCost,
  } = shippingDetails;

  const parsedShippingCost =
    Number(shippingCost);

  if (
    !selectedCarrier ||
    !selectedService ||
    !Number.isFinite(parsedShippingCost) ||
    parsedShippingCost < 0
  ) {
    return res.status(400).json({
      message:
        'Shipping details are incomplete or invalid.',
    });
  }

  try {
    const [updatedRows] =
      await GuestCart.update(
        {
          selectedCarrier,
          selectedService,
          shippingCost: parsedShippingCost,
        },
        {
          where: {
            sessionId,
          },
        }
      );

    if (updatedRows === 0) {
      return res.status(404).json({
        message:
          'No cart items were found for this session.',
      });
    }

    return res.status(200).json({
      message:
        'Shipping details updated successfully.',
    });
  } catch (error) {
    console.error(
      'Error updating shipping details:',
      error
    );

    return res.status(500).json({
      message:
        'Failed to update shipping details.',
    });
  }
};

/**
 * Reserve inventory before checkout.
 *
 * Only use this middleware if your route calls
 * lockInventory before createCheckoutSession.
 */
const lockInventory = async (
  req,
  res,
  next
) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      message: 'Session ID is required.',
    });
  }

  const transaction =
    await sequelize.transaction();

  try {
    const cartItems =
      await GuestCart.findAll({
        where: {
          sessionId,
        },
        include: [
          {
            model: Product,
            as: 'Product',
            required: true,
          },
        ],
        transaction,
        lock: transaction.LOCK.UPDATE,
      });

    if (cartItems.length === 0) {
      await transaction.rollback();

      return res.status(400).json({
        message: 'Cart is empty.',
      });
    }

    for (const cartItem of cartItems) {
      const product = cartItem.Product;

      if (
        product.quantity <
        cartItem.quantity
      ) {
        await transaction.rollback();

        return res.status(400).json({
          message:
            `Not enough quantity for ${product.name}.`,
        });
      }

      product.quantity -=
        cartItem.quantity;

      await product.save({
        transaction,
      });
    }

    await transaction.commit();

    return next();
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    console.error(
      'Error locking inventory:',
      error
    );

    return res.status(500).json({
      message:
        'Failed to reserve inventory.',
    });
  }
};

/**
 * Restore inventory previously reserved by
 * lockInventory.
 */
const unlockInventory = async (
  cartItems
) => {
  const transaction =
    await sequelize.transaction();

  try {
    for (const cartItem of cartItems) {
      const product =
        await Product.findByPk(
          cartItem.productId,
          {
            transaction,
            lock:
              transaction.LOCK.UPDATE,
          }
        );

      if (!product) {
        console.warn(
          `Unable to restore inventory. ` +
          `Product ${cartItem.productId} was not found.`
        );

        continue;
      }

      product.quantity +=
        cartItem.quantity;

      await product.save({
        transaction,
      });
    }

    await transaction.commit();
  } catch (error) {
    if (!transaction.finished) {
      await transaction.rollback();
    }

    console.error(
      'Error unlocking inventory:',
      error
    );

    throw error;
  }
};

/**
 * Create a Stripe Checkout Session for a
 * guest cart.
 *
 * The resulting PaymentIntent uses a destination
 * charge to transfer the payment to the Bakers
 * Burns connected account.
 */
const createCheckoutSession = async (
  req,
  res
) => {
  try {
    const {
      sessionId,
      metadata,
    } = req.body;

    if (!sessionId) {
      return res.status(400).json({
        message:
          'Session ID is required.',
      });
    }

    if (
      metadata?.hasAcceptedPrivacy !==
        true ||
      metadata
        ?.hasAcceptedTermsOfService !==
        true
    ) {
      return res.status(400).json({
        message:
          'You must accept the Terms of Service and Privacy Policy to continue.',
        redirect:
          '/accept-privacy-terms',
      });
    }

    const shippingInfo =
      await GuestCart.findOne({
        where: {
          sessionId,
        },
        attributes: [
          'selectedCarrier',
          'selectedService',
          'shippingCost',
        ],
      });

    const shippingCost = Number(
      shippingInfo?.shippingCost
    );

    if (
      !shippingInfo?.selectedCarrier ||
      !shippingInfo?.selectedService ||
      !Number.isFinite(shippingCost) ||
      shippingCost < 0
    ) {
      return res.status(400).json({
        message:
          'Shipping details are incomplete or invalid.',
      });
    }

    const cartItems =
      await GuestCart.findAll({
        where: {
          sessionId,
        },
        include: [
          {
            model: Product,
            as: 'Product',
            required: true,
          },
        ],
      });

    if (cartItems.length === 0) {
      return res.status(400).json({
        message: 'Cart is empty.',
      });
    }

    for (const cartItem of cartItems) {
      const product =
        cartItem.Product;

      if (
        product.quantity <
        cartItem.quantity
      ) {
        return res.status(400).json({
          message:
            `Not enough quantity for ${product.name}.`,
        });
      }
    }

    const lineItems = cartItems.map(
      (item) => {
        const productPrice =
          Number(item.Product.price);

        if (
          !Number.isFinite(productPrice) ||
          productPrice < 0
        ) {
          throw new Error(
            `Invalid price for product ${item.Product.id}.`
          );
        }

        const imageUrl =
          item.Product.thumbnail &&
          process.env.BASE_URL
            ? `${process.env.BASE_URL}/uploads/${item.Product.thumbnail}`
            : undefined;

        return {
          price_data: {
            currency: 'usd',
            product_data: {
              name:
                item.Product.name,
              ...(imageUrl
                ? {
                    images: [
                      imageUrl,
                    ],
                  }
                : {}),
            },
            unit_amount:
              Math.round(
                productPrice * 100
              ),
          },
          quantity:
            item.quantity,
        };
      }
    );

    lineItems.push({
      price_data: {
        currency: 'usd',
        product_data: {
          name:
            `Shipping (` +
            `${shippingInfo.selectedCarrier} - ` +
            `${shippingInfo.selectedService})`,
        },
        unit_amount:
          Math.round(
            shippingCost * 100
          ),
      },
      quantity: 1,
    });

    const connectedAccountId =
      process.env
        .BAKERS_BURNS_ACCOUNT_ID;

    if (
      !connectedAccountId?.startsWith(
        'acct_'
      )
    ) {
      console.error(
        'BAKERS_BURNS_ACCOUNT_ID is missing or invalid.'
      );

      return res.status(500).json({
        message:
          'The connected Stripe account is not configured correctly.',
      });
    }

    /*
     * This confirms which connected account
     * Stripe sees and prints its capabilities.
     *
     * Remove or reduce this logging after the
     * transfer capability issue is resolved.
     */
    const connectedAccount =
      await stripe.accounts.retrieve(
        connectedAccountId
      );

    console.log(
      '========== STRIPE CONNECTED ACCOUNT =========='
    );

    console.log({
      id:
        connectedAccount.id,
      type:
        connectedAccount.type,
      capabilities:
        connectedAccount.capabilities,
      charges_enabled:
        connectedAccount.charges_enabled,
      payouts_enabled:
        connectedAccount.payouts_enabled,
      currently_due:
        connectedAccount.requirements
          ?.currently_due,
      pending_verification:
        connectedAccount.requirements
          ?.pending_verification,
      disabled_reason:
        connectedAccount.requirements
          ?.disabled_reason,
    });

    console.log(
      '=============================================='
    );

    const stripeMetadata = {
      sessionId:
        String(sessionId),
      hasAcceptedPrivacy:
        'true',
      hasAcceptedTermsOfService:
        'true',
      selectedCarrier:
        String(
          shippingInfo.selectedCarrier
        ),
      selectedService:
        String(
          shippingInfo.selectedService
        ),
      shippingCost:
        String(shippingCost),
    };

    const checkoutSession =
      await stripe.checkout.sessions.create(
        {
          payment_method_types: [
            'card',
          ],

          mode: 'payment',

          line_items:
            lineItems,

          metadata:
            stripeMetadata,

          payment_intent_data: {
            transfer_data: {
              destination:
                connectedAccountId,
            },

            metadata:
              stripeMetadata,
          },

          expires_at:
            Math.floor(
              Date.now() / 1000
            ) +
            60 * 30,

          success_url:
            `${process.env.REGISTER_FRONTEND}/success` +
            '?session_id={CHECKOUT_SESSION_ID}',

          cancel_url:
            `${process.env.REGISTER_FRONTEND}/cancel` +
            '?session_id={CHECKOUT_SESSION_ID}',

          shipping_address_collection: {
            allowed_countries: [
              'US',
              'CA',
            ],
          },

          billing_address_collection:
            'required',
        }
      );

    console.log(
      'Stripe Checkout Session created:',
      checkoutSession.id
    );

    return res.status(200).json({
      url:
        checkoutSession.url,
      sessionId:
        checkoutSession.id,
    });
  } catch (error) {
    console.error(
      'Error creating Stripe Checkout Session:',
      {
        type:
          error.type,
        code:
          error.code,
        message:
          error.message,
        requestId:
          error.requestId,
      }
    );

    return res.status(500).json({
      message:
        'Failed to create Checkout Session.',
      error:
        error.message,
    });
  }
};

/**
 * Restore inventory when a checkout that previously
 * reserved inventory is canceled.
 *
 * Do not use this inventory restoration unless
 * lockInventory ran before checkout creation.
 */
const cancelCheckoutSession = async (
  req,
  res
) => {
  const { sessionId } = req.body;

  if (!sessionId) {
    return res.status(400).json({
      message:
        'Session ID is required.',
    });
  }

  try {
    const cartItems =
      await GuestCart.findAll({
        where: {
          sessionId,
        },
      });

    if (cartItems.length === 0) {
      return res.status(404).json({
        message:
          'No cart data was found for this session.',
      });
    }

    await unlockInventory(
      cartItems
    );

    return res.status(200).json({
      message:
        'Reserved inventory restored successfully.',
    });
  } catch (error) {
    console.error(
      'Error canceling checkout:',
      error
    );

    return res.status(500).json({
      message:
        'Failed to restore inventory.',
    });
  }
};

/**
 * Convert a guest user into a registered user
 * by setting a password.
 */
const setPassword = async (
  req,
  res
) => {
  const {
    token,
    password,
  } = req.body;

  if (!token || !password) {
    return res.status(400).json({
      message:
        'Token and password are required.',
    });
  }

  try {
    const decoded =
      jwt.verify(
        token,
        process.env.JWT_SECRET
      );

    const email =
      decoded.email;

    if (!email) {
      return res.status(400).json({
        message:
          'The password-setup token does not contain an email address.',
      });
    }

    const storedToken =
      await Token.findOne({
        where: {
          token,
          type:
            'password_setup',
        },
      });

    if (
      !storedToken ||
      new Date(
        storedToken.expiresAt
      ) < new Date()
    ) {
      return res.status(400).json({
        message:
          'Invalid or expired token.',
      });
    }

    const user =
      await User.findOne({
        where: {
          email,
        },
      });

    if (!user) {
      return res.status(404).json({
        message:
          'User not found.',
      });
    }

    user.password =
      await bcrypt.hash(
        password,
        10
      );

    user.isGuest = false;

    await user.save();

    await Token.destroy({
      where: {
        token,
        type:
          'password_setup',
      },
    });

    return res.status(200).json({
      message:
        'Password set successfully. You can now log in.',
    });
  } catch (error) {
    console.error(
      'Error setting password:',
      error
    );

    if (
      error.name ===
      'JsonWebTokenError'
    ) {
      return res.status(400).json({
        message:
          'Invalid password-setup token.',
      });
    }

    if (
      error.name ===
      'TokenExpiredError'
    ) {
      return res.status(400).json({
        message:
          'Password-setup token has expired.',
      });
    }

    return res.status(500).json({
      message:
        'Failed to set password.',
    });
  }
};

module.exports = {
  addToGuestCart,
  getCartItems,
  deleteCartItem,
  updateShippingDetails,
  lockInventory,
  unlockInventory,
  createCheckoutSession,
  cancelCheckoutSession,
  setPassword,
};