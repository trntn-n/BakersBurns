'use strict';

const cron = require('node-cron');
const { Op } = require('sequelize');

const EventCheckoutHold = require(
  '../../../models/eventCheckoutHold'
);

const {
  releaseEventCheckoutHold,
} = require(
  '../../../services/eventCheckoutInventoryService'
);

/*
 * Runs at minute 0 and minute 30 of every hour.
 */
const EVENT_HOLD_CRON_SCHEDULE =
  '*/30 * * * *';

/*
 * Only these statuses represent inventory that may
 * still be actively reserved by an unpaid checkout.
 */
const ACTIVE_HOLD_STATUSES = [
  'reserving',
  'open',
];

/*
 * Prevent two cleanup runs from overlapping inside
 * the same Node process.
 */
let cleanupIsRunning = false;

/**
 * Release all event checkout holds whose expiration
 * time has passed.
 *
 * The existing releaseEventCheckoutHold service should:
 *
 * - lock the checkout hold;
 * - lock the associated EventOccurrence rows;
 * - subtract each held quantity from reservedCount;
 * - prevent reservedCount from dropping below zero;
 * - mark the hold expired/released;
 * - perform everything in a transaction.
 *
 * @returns {Promise<{
 *   checked: number,
 *   released: number,
 *   skipped: number,
 *   failed: number
 * }>}
 */
const cleanupExpiredEventCheckoutHolds =
  async () => {
    if (cleanupIsRunning) {
      console.log(
        'Event checkout hold cleanup skipped because another run is active.'
      );

      return {
        checked: 0,
        released: 0,
        skipped: 1,
        failed: 0,
      };
    }

    cleanupIsRunning = true;

    const summary = {
      checked: 0,
      released: 0,
      skipped: 0,
      failed: 0,
    };

    try {
      const cleanupStartedAt = new Date();

      console.log(
        'Starting expired event checkout hold cleanup:',
        {
          cleanupStartedAt:
            cleanupStartedAt.toISOString(),
          activeStatuses:
            ACTIVE_HOLD_STATUSES,
        }
      );

      const expiredHolds =
        await EventCheckoutHold.findAll({
          where: {
            status: {
              [Op.in]:
                ACTIVE_HOLD_STATUSES,
            },

            expiresAt: {
              [Op.lte]:
                cleanupStartedAt,
            },
          },

          attributes: [
            'id',
            'holdToken',
            'eventId',
            'status',
            'expiresAt',
          ],

          order: [
            ['expiresAt', 'ASC'],
          ],
        });

      summary.checked =
        expiredHolds.length;

      if (expiredHolds.length === 0) {
        console.log(
          'No expired event checkout holds were found.'
        );

        return summary;
      }

      for (const hold of expiredHolds) {
        const holdToken = String(
          hold.holdToken || ''
        ).trim();

        if (!holdToken) {
          summary.failed += 1;

          console.error(
            'Unable to release expired event checkout hold because its hold token is missing:',
            {
              holdId: hold.id,
              eventId: hold.eventId,
              status: hold.status,
              expiresAt:
                hold.expiresAt,
            }
          );

          continue;
        }

        try {
          /*
           * Reuse the existing inventory service rather
           * than manually changing reservedCount here.
           *
           * This keeps all inventory-release logic in one
           * transactional function.
           */
          const releaseResult =
            await releaseEventCheckoutHold(
              holdToken,
              'expired'
            );

          /*
           * Some release implementations return null when
           * another process already released the hold.
           *
           * That is not necessarily an error because the
           * operation should be idempotent.
           */
          if (
            releaseResult === null ||
            releaseResult === false
          ) {
            summary.skipped += 1;

            console.log(
              'Expired event checkout hold was already released or was no longer active:',
              {
                holdId: hold.id,
                holdToken,
                eventId:
                  hold.eventId,
              }
            );

            continue;
          }

          summary.released += 1;

          console.log(
            'Expired event checkout hold released:',
            {
              holdId: hold.id,
              holdToken,
              eventId:
                hold.eventId,
              previousStatus:
                hold.status,
              expiresAt:
                hold.expiresAt,
            }
          );
        } catch (releaseError) {
          summary.failed += 1;

          console.error(
            'Failed to release expired event checkout hold:',
            {
              holdId: hold.id,
              holdToken,
              eventId:
                hold.eventId,
              status:
                hold.status,
              expiresAt:
                hold.expiresAt,
              message:
                releaseError.message,
              stack:
                process.env.NODE_ENV !==
                'production'
                  ? releaseError.stack
                  : undefined,
            }
          );
        }
      }

      console.log(
        'Expired event checkout hold cleanup completed:',
        summary
      );

      return summary;
    } catch (error) {
      console.error(
        'Expired event checkout hold cleanup failed:',
        {
          message: error.message,
          stack:
            process.env.NODE_ENV !==
            'production'
              ? error.stack
              : undefined,
        }
      );

      throw error;
    } finally {
      cleanupIsRunning = false;
    }
  };

/**
 * Start the recurring event checkout hold cleanup.
 *
 * This matches the initialization pattern used by the
 * other application cron modules.
 */
const startEventCheckoutHoldCron = () => {
  console.log(
    'Initializing expired event checkout hold cron job...'
  );

  /*
   * Run immediately during startup.
   *
   * This cleans holds that expired while the application
   * was stopped instead of waiting up to another 30
   * minutes.
   */
  cleanupExpiredEventCheckoutHolds()
    .catch((error) => {
      console.error(
        'Initial expired event checkout hold cleanup failed:',
        error
      );
    });

  const scheduledTask = cron.schedule(
    EVENT_HOLD_CRON_SCHEDULE,
    async () => {
      try {
        await cleanupExpiredEventCheckoutHolds();
      } catch (error) {
        /*
         * The cleanup function already logs details.
         * Catching here prevents an unhandled rejection.
         */
        console.error(
          'Scheduled event checkout hold cleanup failed:',
          error
        );
      }
    },
    {
      scheduled: true,
      timezone:
        process.env.EVENT_TIMEZONE ||
        'America/Denver',
    }
  );

  return scheduledTask;
};

module.exports = {
  cleanupExpiredEventCheckoutHolds,
  startEventCheckoutHoldCron,
};