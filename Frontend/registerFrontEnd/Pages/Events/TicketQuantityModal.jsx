import React, {
    useEffect,
    useMemo,
    useState,
  } from "react";
  import moment from "moment";
  import "./TicketQuantityModal.css";
  
  const MAX_TICKETS_PER_DAY = 20;
  
  const TicketQuantityModal = ({
    isOpen,
    event,
    occurrences,
    isSubmitting,
    error,
    onClose,
    onConfirm,
  }) => {
    const availableOccurrences = useMemo(() => {
      if (!event?.id) {
        return [];
      }
  
      const today = moment().startOf("day");
  
      return occurrences
        .filter(
          (occurrence) =>
            String(occurrence.id) === String(event.id) &&
            moment(
              occurrence.occurrenceDate,
              "YYYY-MM-DD",
              true
            ).isSameOrAfter(today, "day")
        )
        .sort((first, second) =>
          first.occurrenceDate.localeCompare(
            second.occurrenceDate
          )
        );
    }, [event?.id, occurrences]);
  
    const [quantities, setQuantities] =
      useState({});
  
    useEffect(() => {
      if (!isOpen || !event) {
        return;
      }
  
      const initialQuantities = {};
  
      for (const occurrence of availableOccurrences) {
        initialQuantities[
          occurrence.occurrenceDate
        ] =
          occurrence.occurrenceDate ===
          event.occurrenceDate
            ? 1
            : 0;
      }
  
      if (
        Object.values(initialQuantities).every(
          (quantity) => quantity === 0
        ) &&
        availableOccurrences[0]
      ) {
        initialQuantities[
          availableOccurrences[0]
            .occurrenceDate
        ] = 1;
      }
  
      setQuantities(initialQuantities);
    }, [
      isOpen,
      event,
      availableOccurrences,
    ]);
  
    useEffect(() => {
      if (!isOpen) {
        return undefined;
      }
  
      const handleKeyDown = (keyboardEvent) => {
        if (keyboardEvent.key === "Escape") {
          onClose();
        }
      };
  
      document.addEventListener(
        "keydown",
        handleKeyDown
      );
  
      return () => {
        document.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    }, [isOpen, onClose]);
  
    if (!isOpen || !event) {
      return null;
    }
  
    const updateQuantity = (
      occurrenceDate,
      nextValue
    ) => {
      const parsedValue = Number(nextValue);
  
      const safeValue = Number.isFinite(
        parsedValue
      )
        ? Math.min(
            MAX_TICKETS_PER_DAY,
            Math.max(
              0,
              Math.trunc(parsedValue)
            )
          )
        : 0;
  
      setQuantities((previous) => ({
        ...previous,
        [occurrenceDate]: safeValue,
      }));
    };
  
    const selections =
      availableOccurrences
        .map((occurrence) => ({
          occurrenceDate:
            occurrence.occurrenceDate,
          quantity:
            quantities[
              occurrence.occurrenceDate
            ] || 0,
        }))
        .filter(
          (selection) =>
            selection.quantity > 0
        );
  
    const totalTickets = selections.reduce(
      (total, selection) =>
        total + selection.quantity,
      0
    );
  
    const totalPrice =
      totalTickets * Number(event.price || 0);
  
    const submit = (submitEvent) => {
      submitEvent.preventDefault();
  
      if (totalTickets < 1 || isSubmitting) {
        return;
      }
  
      onConfirm({
        eventId: event.id,
        selections,
      });
    };
  
    return (
      <div
        className="ticket-modal-backdrop"
        role="presentation"
        onMouseDown={(mouseEvent) => {
          if (
            mouseEvent.target ===
            mouseEvent.currentTarget
          ) {
            onClose();
          }
        }}
      >
        <section
          className="ticket-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ticket-modal-title"
        >
          <header className="ticket-modal__header">
            <div>
              <span>
                Select ticket quantities
              </span>
  
              <h2 id="ticket-modal-title">
                {event.name}
              </h2>
            </div>
  
            <button
              type="button"
              className="ticket-modal__close"
              aria-label="Close ticket quantity dialog"
              onClick={onClose}
              disabled={isSubmitting}
            >
              ×
            </button>
          </header>
  
          <form onSubmit={submit}>
            <div className="ticket-modal__dates">
              {availableOccurrences.map(
                (occurrence) => {
                  const quantity =
                    quantities[
                      occurrence.occurrenceDate
                    ] || 0;
  
                  return (
                    <div
                      className="ticket-modal__date-row"
                      key={
                        occurrence.occurrenceDate
                      }
                    >
                      <div>
                        <strong>
                          {moment(
                            occurrence.occurrenceDate
                          ).format(
                            "dddd, MMMM D, YYYY"
                          )}
                        </strong>
  
                        {event.startTime && (
                          <span>
                            {moment(
                              event.startTime,
                              [
                                "HH:mm:ss",
                                "HH:mm",
                              ]
                            ).format(
                              "h:mm A"
                            )}
                          </span>
                        )}
                      </div>
  
                      <div className="ticket-modal__quantity">
                        <button
                          type="button"
                          aria-label={`Remove one ticket for ${occurrence.occurrenceDate}`}
                          onClick={() =>
                            updateQuantity(
                              occurrence.occurrenceDate,
                              quantity - 1
                            )
                          }
                          disabled={
                            isSubmitting ||
                            quantity === 0
                          }
                        >
                          −
                        </button>
  
                        <input
                          type="number"
                          min="0"
                          max={
                            MAX_TICKETS_PER_DAY
                          }
                          step="1"
                          value={quantity}
                          aria-label={`Ticket quantity for ${occurrence.occurrenceDate}`}
                          onChange={(changeEvent) =>
                            updateQuantity(
                              occurrence.occurrenceDate,
                              changeEvent.target
                                .value
                            )
                          }
                          disabled={isSubmitting}
                        />
  
                        <button
                          type="button"
                          aria-label={`Add one ticket for ${occurrence.occurrenceDate}`}
                          onClick={() =>
                            updateQuantity(
                              occurrence.occurrenceDate,
                              quantity + 1
                            )
                          }
                          disabled={
                            isSubmitting ||
                            quantity >=
                              MAX_TICKETS_PER_DAY
                          }
                        >
                          +
                        </button>
                      </div>
                    </div>
                  );
                }
              )}
            </div>
  
            {error && (
              <div
                className="ticket-modal__error"
                role="alert"
              >
                {error}
              </div>
            )}
  
            <footer className="ticket-modal__footer">
              <div>
                <span>
                  {totalTickets} ticket
                  {totalTickets === 1
                    ? ""
                    : "s"}
                </span>
  
                <strong>
                  ${totalPrice.toFixed(2)}
                </strong>
              </div>
  
              <button
                type="submit"
                className="ticket-modal__continue"
                disabled={
                  isSubmitting ||
                  totalTickets < 1
                }
              >
                {isSubmitting
                  ? "Opening checkout..."
                  : "Continue to checkout"}
              </button>
            </footer>
          </form>
        </section>
      </div>
    );
  };
  
  export default TicketQuantityModal;
  