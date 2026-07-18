'use strict';

const sequelize = require('../config/database');

const Event = require('../models/events');
const EventCheckoutHold = require('../models/eventCheckoutHold');
const EventOccurrence = require('../models/eventOccurrence');
const EventReservation = require('../models/eventReservation');

/*
 * Release inventory reserved by an incomplete, expired,
 * or failed event Checkout Session.
 */
const releaseEventCheckoutHold = async (
  holdToken,
  reason = 'released'
) => {
  return sequelize.transaction(async (transaction) => {
    const hold = await EventCheckoutHold.findOne({
      where: {
        holdToken,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    /*
     * Release operations must be idempotent.
     *
     * If the hold has already been released or completed,
     * do not adjust inventory again.
     */
    if (
      !hold ||
      ['released', 'completed'].includes(hold.status)
    ) {
      return hold;
    }

    const selections = Array.isArray(hold.selections)
      ? hold.selections
      : [];

    for (const selection of selections) {
      const occurrence = await EventOccurrence.findByPk(
        selection.occurrenceId,
        {
          transaction,
          lock: transaction.LOCK.UPDATE,
        }
      );

      /*
       * If an occurrence was deleted, continue releasing the
       * remaining inventory instead of failing the entire hold.
       */
      if (!occurrence) {
        continue;
      }

      const quantity = Number(selection.quantity);

      occurrence.reservedCount = Math.max(
        0,
        Number(occurrence.reservedCount || 0) -
          (Number.isFinite(quantity) ? quantity : 0)
      );

      await occurrence.save({
        transaction,
      });
    }

    hold.status =
      reason === 'failed'
        ? 'failed'
        : 'released';

    await hold.save({
      transaction,
    });

    return hold;
  });
};

/*
 * Load the completed checkout result.
 *
 * This is also used when Stripe retries a webhook after the
 * hold has already been completed.
 */
const getCompletedCheckoutResult = async ({
  hold,
  stripeSessionId,
  transaction,
}) => {
  const completedSessionId =
    hold.stripeSessionId || stripeSessionId;

  const event = await Event.findByPk(hold.eventId, {
    transaction,
  });

  const reservations = completedSessionId
    ? await EventReservation.findAll({
        where: {
          stripeSessionId: completedSessionId,
        },
        transaction,
        order: [['createdAt', 'ASC']],
      })
    : [];

  return {
    hold,
    event,
    reservations,
  };
};

/*
 * Convert an open checkout hold into paid reservations.
 *
 * This function must be idempotent because Stripe may deliver
 * the same webhook multiple times.
 */
const completeEventCheckoutHold = async ({
  holdToken,
  stripeSessionId,
  stripePaymentIntentId,
  purchaserEmail,
}) => {
  return sequelize.transaction(async (transaction) => {
    const hold = await EventCheckoutHold.findOne({
      where: {
        holdToken,
      },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!hold) {
      throw new Error(
        `Event checkout hold ${holdToken} was not found.`
      );
    }

    /*
     * Stripe may retry checkout.session.completed.
     *
     * If this hold was already completed, load and return the
     * existing reservations instead of modifying inventory again.
     */
    if (hold.status === 'completed') {
      return getCompletedCheckoutResult({
        hold,
        stripeSessionId,
        transaction,
      });
    }

    if (hold.status !== 'open') {
      throw new Error(
        `Event checkout hold ${holdToken} has status ${hold.status}.`
      );
    }

    if (!stripeSessionId) {
      throw new Error(
        'Stripe Checkout Session ID is required to complete an event hold.'
      );
    }

    if (!purchaserEmail) {
      throw new Error(
        'Stripe Checkout did not provide a purchaser email.'
      );
    }

    const selections = Array.isArray(hold.selections)
      ? hold.selections
      : [];

    if (selections.length === 0) {
      throw new Error(
        `Event checkout hold ${holdToken} does not contain any selections.`
      );
    }

    const event = await Event.findByPk(hold.eventId, {
      transaction,
    });

    if (!event) {
      throw new Error(
        `Event ${hold.eventId} for checkout hold ${holdToken} was not found.`
      );
    }

    const reservations = [];

    for (const selection of selections) {
      const occurrenceId = Number(selection.occurrenceId);
      const quantity = Number(selection.quantity);
      const unitAmount = Number(selection.unitAmount);

      if (
        !Number.isInteger(occurrenceId) ||
        occurrenceId <= 0
      ) {
        throw new Error(
          `Event checkout hold ${holdToken} contains an invalid occurrence ID.`
        );
      }

      if (
        !Number.isInteger(quantity) ||
        quantity <= 0
      ) {
        throw new Error(
          `Event checkout hold ${holdToken} contains an invalid quantity.`
        );
      }

      if (
        !Number.isFinite(unitAmount) ||
        unitAmount < 0
      ) {
        throw new Error(
          `Event checkout hold ${holdToken} contains an invalid unit amount.`
        );
      }

      const occurrence = await EventOccurrence.findByPk(
        occurrenceId,
        {
          transaction,
          lock: transaction.LOCK.UPDATE,
        }
      );

      if (!occurrence) {
        throw new Error(
          `Occurrence ${occurrenceId} no longer exists.`
        );
      }

      const currentReservedCount = Number(
        occurrence.reservedCount || 0
      );

      const currentSoldCount = Number(
        occurrence.soldCount || 0
      );

      if (currentReservedCount < quantity) {
        throw new Error(
          `Reserved inventory for ${occurrence.occurrenceDate} is inconsistent.`
        );
      }

      occurrence.reservedCount =
        currentReservedCount - quantity;

      occurrence.soldCount =
        currentSoldCount + quantity;

      await occurrence.save({
        transaction,
      });

      const [reservation] =
        await EventReservation.findOrCreate({
          where: {
            stripeSessionId,
            occurrenceId: occurrence.id,
          },

          defaults: {
            eventId: hold.eventId,
            occurrenceId: occurrence.id,
            userId: hold.userId || null,
            purchaserEmail,
            quantity,
            unitAmount,
            stripeSessionId,
            stripePaymentIntentId:
              stripePaymentIntentId || null,
            status: 'paid',
          },

          transaction,
        });

      reservations.push(reservation);
    }

    hold.status = 'completed';
    hold.stripeSessionId = stripeSessionId;

    await hold.save({
      transaction,
    });

    return {
      hold,
      event,
      reservations,
    };
  });
};

module.exports = {
  releaseEventCheckoutHold,
  completeEventCheckoutHold,
};