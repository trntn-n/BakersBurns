"use strict";

const Order = require("../../models/order");
const OrderItem = require("../../models/orderItem");
const User = require("../../models/user");
const Product = require("../../models/product");
const {
  sendEmailNotification,
} = require("../../utils/statusEmail");
const { encrypt, decrypt } = require("../../utils/encrypt");

const CARRIERS = new Set(["UPS", "FedEx", "USPS", "DHL"]);
const ENCRYPTED_VALUE_PATTERN =
  /^[a-f0-9]{32}:[a-f0-9]+$/i;

const createHttpError = (status, message) => {
  const error = new Error(message);
  error.status = status;
  return error;
};

const sendControllerError = (
  res,
  error,
  fallbackMessage
) => {
  console.error(fallbackMessage, error);
  return res.status(error.status || 500).json({
    message: error.status ? error.message : fallbackMessage,
    ...(process.env.NODE_ENV !== "production" && {
      error: error.message,
    }),
  });
};

const serializeAddress = (address) =>
  typeof address === "string"
    ? address
    : JSON.stringify(address);

const encryptAddress = (address) => {
  if (address === undefined) return undefined;
  if (address === null || address === "") return null;

  const serialized = serializeAddress(address);
  return serialized.trim() ? encrypt(serialized) : null;
};

/*
 * Supports encrypted current rows as well as legacy plaintext rows.
 * This compatibility path lets an admin open and resave records that
 * were previously corrupted by updateOrder storing plaintext.
 */
const decryptAddress = (storedValue) => {
  if (!storedValue) return null;
  if (typeof storedValue === "object") return storedValue;

  const serialized = ENCRYPTED_VALUE_PATTERN.test(storedValue)
    ? decrypt(storedValue)
    : storedValue;

  try {
    return JSON.parse(serialized);
  } catch {
    return serialized;
  }
};

const sanitizeOrder = (
  order,
  { includeAddresses = false } = {}
) => {
  const result =
    typeof order.toJSON === "function" ? order.toJSON() : { ...order };

  if (includeAddresses) {
    result.shippingAddress = decryptAddress(
      order.getDataValue
        ? order.getDataValue("shippingAddress")
        : result.shippingAddress
    );
    result.billingAddress = decryptAddress(
      order.getDataValue
        ? order.getDataValue("billingAddress")
        : result.billingAddress
    );
  } else {
    delete result.shippingAddress;
    delete result.billingAddress;
  }

  return result;
};

const generateTrackingLink = (carrier, trackingNumber) => {
  if (!carrier || !trackingNumber) return null;

  const encoded = encodeURIComponent(
    String(trackingNumber).trim()
  );

  const links = {
    UPS: `https://www.ups.com/track?tracknum=${encoded}`,
    FedEx: `https://www.fedex.com/fedextrack/?trknbr=${encoded}`,
    USPS: `https://tools.usps.com/go/TrackConfirmAction?tLabels=${encoded}`,
    DHL: `https://www.dhl.com/us-en/home/tracking.html?tracking-id=${encoded}`,
  };

  return links[carrier] || null;
};

const sendStatusNotification = async (order, status) => {
  const user =
    order.user || (await User.findByPk(order.userId));
  if (!user?.email) return;

  const notificationStatus =
    String(status).toLowerCase() === "processing" &&
    order.trackingNumber
      ? "Tracking Added"
      : status;

  await sendEmailNotification(
    user.email,
    order.trackingNumber || "N/A",
    notificationStatus
  );
};

const createOrder = async (req, res) => {
  try {
    const {
      username,
      shippingAddress,
      billingAddress,
      orderItems,
      trackingNumber,
      carrier,
      total,
    } = req.body;

    if (!username) {
      throw createHttpError(400, "A customer is required.");
    }
    if (!Array.isArray(orderItems) || !orderItems.length) {
      throw createHttpError(
        400,
        "At least one order item is required."
      );
    }

    const parsedTotal = Number(total);
    if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
      throw createHttpError(400, "A valid total is required.");
    }

    if (
      (trackingNumber && !carrier) ||
      (!trackingNumber && carrier)
    ) {
      throw createHttpError(
        400,
        "Carrier and tracking number must be supplied together."
      );
    }
    if (carrier && !CARRIERS.has(carrier)) {
      throw createHttpError(400, "Unsupported carrier.");
    }

    const user = await User.findOne({ where: { username } });
    if (!user) {
      throw createHttpError(404, "Customer not found.");
    }

    const transaction =
      await Order.sequelize.transaction();

    let newOrder;

    try {
      newOrder = await Order.create(
        {
          userId: user.id,
          shippingAddress: encryptAddress(shippingAddress),
          billingAddress: encryptAddress(billingAddress),
          trackingNumber:
            String(trackingNumber || "").trim() || null,
          carrier: carrier || null,
          total: parsedTotal,
          status: trackingNumber ? "Shipped" : "Processing",
        },
        { transaction }
      );

      const items = [];

      for (const item of orderItems) {
        const quantity = Number(item.quantity);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          throw createHttpError(
            400,
            "Every order quantity must be a positive integer."
          );
        }

        const product = await Product.findByPk(item.productId, {
          transaction,
        });
        if (!product) {
          throw createHttpError(
            404,
            `Product ${item.productId} was not found.`
          );
        }

        const requestedPrice = Number(item.price);
        const price = Number.isFinite(requestedPrice)
          ? requestedPrice
          : Number(product.price);

        items.push({
          orderId: newOrder.id,
          productId: product.id,
          quantity,
          price,
        });
      }

      await OrderItem.bulkCreate(items, { transaction });
      await transaction.commit();
    } catch (error) {
      if (!transaction.finished) {
        await transaction.rollback();
      }
      throw error;
    }

    try {
      await sendEmailNotification(
        user.email,
        trackingNumber || "N/A",
        newOrder.status
      );
    } catch (emailError) {
      console.error(
        "Order created but notification failed:",
        emailError
      );
    }

    return res.status(201).json({
      message: "Order created successfully.",
      order: sanitizeOrder(newOrder),
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to create order."
    );
  }
};

const updateTracking = async (req, res) => {
  try {
    const { id } = req.params;
    const trackingNumber = String(
      req.body.trackingNumber || ""
    ).trim();
    const carrier = req.body.carrier;

    if (!trackingNumber || !carrier) {
      throw createHttpError(
        400,
        "Carrier and tracking number are required."
      );
    }
    if (!CARRIERS.has(carrier)) {
      throw createHttpError(400, "Unsupported carrier.");
    }

    const order = await Order.findByPk(id, {
      include: [{ model: User, as: "user" }],
    });
    if (!order) {
      throw createHttpError(404, "Order not found.");
    }

    order.trackingNumber = trackingNumber;
    order.carrier = carrier;
    order.status = "Shipped";
    await order.save();

    try {
      await sendEmailNotification(
        order.user?.email,
        trackingNumber,
        "Shipped",
        {
          shippingAddress: decryptAddress(
            order.getDataValue("shippingAddress")
          ),
          carrier,
          total: Number(order.total) || 0,
          orderItems: [],
        }
      );
    } catch (emailError) {
      console.error(
        "Tracking saved but notification failed:",
        emailError
      );
    }

    return res.status(200).json({
      message: "Tracking information updated successfully.",
      order: sanitizeOrder(order),
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to update tracking information."
    );
  }
};

const getAllOrders = async (req, res) => {
  try {
    const orders = await Order.findAll({
      include: [
        {
          model: User,
          as: "user",
          attributes: ["username", "email"],
        },
      ],
      attributes: [
        "id",
        "userId",
        "trackingNumber",
        "carrier",
        "shippingService",
        "shippingCost",
        "total",
        "status",
        "createdAt",
        "updatedAt",
      ],
      order: [["createdAt", "DESC"]],
    });

    return res.status(200).json({
      message: "Orders fetched successfully.",
      orders,
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to fetch orders."
    );
  }
};

const getOrderById = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) {
      throw createHttpError(404, "Order not found.");
    }

    const result = sanitizeOrder(order, {
      includeAddresses: true,
    });
    result.trackingLink =
      generateTrackingLink(
        order.carrier,
        order.trackingNumber
      ) || null;

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      message: "Order fetched successfully.",
      order: result,
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to fetch order."
    );
  }
};

const updateOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) {
      throw createHttpError(404, "Order not found.");
    }

    const previousStatus = order.status;
    const updates = {};
    const {
      status,
      trackingNumber,
      carrier,
      shippingAddress,
      billingAddress,
      total,
    } = req.body;

    if (status !== undefined) updates.status = status;
    if (trackingNumber !== undefined) {
      updates.trackingNumber =
        String(trackingNumber).trim() || null;
    }
    if (carrier !== undefined) {
      if (carrier && !CARRIERS.has(carrier)) {
        throw createHttpError(400, "Unsupported carrier.");
      }
      updates.carrier = carrier || null;
    }
    if (total !== undefined) {
      const parsedTotal = Number(total);
      if (!Number.isFinite(parsedTotal) || parsedTotal < 0) {
        throw createHttpError(400, "Invalid order total.");
      }
      updates.total = parsedTotal;
    }
    if (shippingAddress !== undefined) {
      updates.shippingAddress = encryptAddress(shippingAddress);
    }
    if (billingAddress !== undefined) {
      updates.billingAddress = encryptAddress(billingAddress);
    }

    if (
      updates.trackingNumber &&
      !status &&
      !order.trackingNumber
    ) {
      updates.status = "Shipped";
    }

    await order.update(updates);

    if (
      updates.status &&
      updates.status !== previousStatus
    ) {
      try {
        await sendStatusNotification(order, updates.status);
      } catch (emailError) {
        console.error(
          "Order updated but status notification failed:",
          emailError
        );
      }
    }

    return res.status(200).json({
      message: "Order updated successfully.",
      order: sanitizeOrder(order),
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to update order."
    );
  }
};

const deleteOrder = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId);
    if (!order) {
      throw createHttpError(404, "Order not found.");
    }
    await order.destroy();
    return res.status(200).json({
      message: "Order deleted successfully.",
      orderId,
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to delete order."
    );
  }
};

const getUsers = async (req, res) => {
  try {
    const users = await User.findAll({
      attributes: ["id", "username"],
      order: [["username", "ASC"]],
    });
    return res.status(200).json({
      message: "Users fetched successfully.",
      users,
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to fetch users."
    );
  }
};

const quickAddProduct = async (req, res) => {
  try {
    const { name, description, price } = req.body;
    const thumbnailFile =
      req.file || req.files?.thumbnail?.[0];
    const parsedPrice = Number(price);

    if (!name?.trim() || !description?.trim()) {
      throw createHttpError(
        400,
        "Product name and description are required."
      );
    }
    if (!Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      throw createHttpError(
        400,
        "A price greater than zero is required."
      );
    }
    if (!thumbnailFile) {
      throw createHttpError(400, "Thumbnail is required.");
    }

    const product = await Product.create({
      name: name.trim(),
      description: description.trim(),
      price: parsedPrice,
      quantity: 0,
      thumbnail: thumbnailFile.filename,
    });

    return res.status(201).json({
      message: "Product added successfully.",
      product,
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to add product."
    );
  }
};

const getOrderDetails = async (req, res) => {
  try {
    const { orderId } = req.params;
    const order = await Order.findByPk(orderId, {
      include: [
        {
          model: User,
          as: "user",
          attributes: ["username", "email"],
        },
        {
          model: OrderItem,
          as: "items",
          include: [
            {
              model: Product,
              as: "product",
              attributes: [
                "id",
                "name",
                "price",
                "thumbnail",
              ],
            },
          ],
        },
      ],
    });

    if (!order) {
      throw createHttpError(404, "Order not found.");
    }

    const result = sanitizeOrder(order, {
      includeAddresses: true,
    });
    result.trackingLink =
      generateTrackingLink(
        order.carrier,
        order.trackingNumber
      ) || null;

    res.set("Cache-Control", "no-store");
    return res.status(200).json({
      message: "Order fetched successfully.",
      order: result,
    });
  } catch (error) {
    return sendControllerError(
      res,
      error,
      "Unable to fetch order details."
    );
  }
};

module.exports = {
  createOrder,
  getAllOrders,
  getOrderById,
  updateOrder,
  deleteOrder,
  getUsers,
  generateTrackingLink,
  quickAddProduct,
  getOrderDetails,
  updateTracking,
};
