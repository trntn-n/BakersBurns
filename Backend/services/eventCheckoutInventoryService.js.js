'use strict';

const sequelize = require('../config/database');
const EventCheckoutHold = require('../models/eventCheckoutHold');
const EventOccurrence = require('../models/eventOccurrence');
const EventReservation = require('../models/eventReservation');

const releaseEventCheckoutHold = async (holdToken, reason = 'released') => {
  return sequelize.transaction(async (transaction) => {
    const hold = await EventCheckoutHold.findOne({
      where: { holdToken },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!hold || ['released', 'completed'].includes(hold.status)) {
      return hold;
    }

    const selections = Array.isArray(hold.selections) ? hold.selections : [];

    for (const selection of selections) {
      const occurrence = await EventOccurrence.findByPk(
        selection.occurrenceId,
        {
          transaction,
          lock: transaction.LOCK.UPDATE,
        }
      );

      if (!occurrence) {
        continue;
      }

      occurrence.reservedCount = Math.max(
        0,
        Number(occurrence.reservedCount) - Number(selection.quantity)
      );

      await occurrence.save({ transaction });
    }

    hold.status = reason === 'failed' ? 'failed' : 'released';
    await hold.save({ transaction });

    return hold;
  });
};

const completeEventCheckoutHold = async ({
  holdToken,
  stripeSessionId,
  stripePaymentIntentId,
  purchaserEmail,
}) => {
  return sequelize.transaction(async (transaction) => {
    const hold = await EventCheckoutHold.findOne({
      where: { holdToken },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });

    if (!hold) {
      throw new Error(`Event checkout hold ${holdToken} was not found.`);
    }

    if (hold.status === 'completed') {
      return hold;
    }

    if (hold.status !== 'open') {
      throw new Error(
        `Event checkout hold ${holdToken} has status ${hold.status}.`
      );
    }

    if (!purchaserEmail) {
      throw new Error('Stripe Checkout did not provide a purchaser email.');
    }

    const selections = Array.isArray(hold.selections) ? hold.selections : [];

    for (const selection of selections) {
      const occurrence = await EventOccurrence.findByPk(
        selection.occurrenceId,
        {
          transaction,
          lock: transaction.LOCK.UPDATE,
        }
      );

      if (!occurrence) {
        throw new Error(
          `Occurrence ${selection.occurrenceId} no longer exists.`
        );
      }

      const quantity = Number(selection.quantity);

      if (Number(occurrence.reservedCount) < quantity) {
        throw new Error(
          `Reserved inventory for ${occurrence.occurrenceDate} is inconsistent.`
        );
      }

      occurrence.reservedCount =
        Number(occurrence.reservedCount) - quantity;
      occurrence.soldCount =
        Number(occurrence.soldCount) + quantity;

      await occurrence.save({ transaction });

      await EventReservation.findOrCreate({
        where: {
          stripeSessionId,
          occurrenceId: occurrence.id,
        },
        defaults: {
          eventId: hold.eventId,
          occurrenceId: occurrence.id,
          userId: hold.userId,
          purchaserEmail,
          quantity,
          unitAmount: Number(selection.unitAmount),
          stripeSessionId,
          stripePaymentIntentId: stripePaymentIntentId || null,
          status: 'paid',
        },
        transaction,
      });
    }

    hold.status = 'completed';
    hold.stripeSessionId = stripeSessionId;
    await hold.save({ transaction });

    return hold;
  });
};

module.exports = {
  releaseEventCheckoutHold,
  completeEventCheckoutHold,
};
