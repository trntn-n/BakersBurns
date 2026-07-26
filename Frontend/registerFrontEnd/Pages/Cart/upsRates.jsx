import React, {
  useEffect,
  useState,
} from "react";

import {
  AnimatePresence,
  motion,
  useReducedMotion,
} from "framer-motion";

import { registerApi } from "../../config/axios";
import "./upsRates.css";

const UPS_RATES_ENDPOINT =
  "/register-rates/ups-rates";

const normalizeCost = (value) => {
  const parsedCost = Number(value);

  return Number.isFinite(parsedCost)
    ? parsedCost
    : null;
};

const formatCost = (value) => {
  const parsedCost =
    normalizeCost(value);

  return parsedCost === null
    ? "N/A"
    : `$${parsedCost.toFixed(2)}`;
};

const formatDeliveryEstimate = (
  rate
) => {
  const estimatedDate =
    rate?.estimatedDeliveryDate;

  if (
    !estimatedDate ||
    estimatedDate === "N/A"
  ) {
    return "Delivery estimate unavailable";
  }

  const approximateDays =
    rate?.approxDays &&
    rate.approxDays !== "N/A"
      ? rate.approxDays
      : "3–5 days";

  return `Estimated delivery: ${estimatedDate} (${approximateDays})`;
};

const UPSRates = ({
  receiverZip,
  onSelectRate,
  totalWeight,
  totalDimensions,
  isOpen,
  onToggle,
}) => {
  const reduceMotion =
    useReducedMotion();

  const [localOpen, setLocalOpen] =
    useState(false);

  const [upsRates, setUpsRates] =
    useState([]);

  const [loading, setLoading] =
    useState(false);

  const [error, setError] =
    useState("");

  const [
    selectedRate,
    setSelectedRate,
  ] = useState(null);

  const shipperZip =
    import.meta.env
      .VITE_SHIPPER_ZIP;

  const isControlled =
    typeof isOpen === "boolean";

  const actualOpen = isControlled
    ? isOpen
    : localOpen;

  /*
   * A changed destination or package invalidates any
   * previously selected quote.
   */
  useEffect(() => {
    setUpsRates([]);
    setSelectedRate(null);
    setError("");
  }, [
    receiverZip,
    totalWeight,
    totalDimensions?.height,
    totalDimensions?.length,
    totalDimensions?.width,
  ]);

  const fetchUPSRates =
    async () => {
      if (loading) {
        return;
      }

      if (
        !shipperZip ||
        !receiverZip
      ) {
        setError(
          "The shipping ZIP information is incomplete."
        );

        return;
      }

      try {
        setLoading(true);
        setError("");

        const response =
          await registerApi.post(
            UPS_RATES_ENDPOINT,
            {
              shipperZip,
              receiverZip,
              weight:
                Number(
                  totalWeight
                ) || 0,
              dimensions: {
                length:
                  Number(
                    totalDimensions
                      ?.length
                  ) || 0,
                width:
                  Number(
                    totalDimensions
                      ?.width
                  ) || 0,
                height:
                  Number(
                    totalDimensions
                      ?.height
                  ) || 0,
              },
            }
          );

        const returnedRates =
          Array.isArray(
            response.data?.ups
          )
            ? response.data.ups
            : [];

        setUpsRates(
          returnedRates
        );
      } catch (requestError) {
        console.error(
          "Error fetching UPS rates:",
          requestError
        );

        setUpsRates([]);

        setError(
          requestError.response
            ?.data?.message ||
            "UPS rates could not be loaded. Please try again."
        );
      } finally {
        setLoading(false);
      }
    };

  const handleSelectRate = (
    rate
  ) => {
    const serviceName =
      rate?.serviceName ||
      "UPS Service";

    const cost =
      normalizeCost(rate?.cost);

    if (cost === null) {
      setError(
        "This shipping option does not have a valid price."
      );

      return;
    }

    setError("");
    setSelectedRate(
      serviceName
    );

    onSelectRate?.(
      serviceName,
      cost
    );
  };

  const toggleDropdown = () => {
    const willOpen =
      !actualOpen;

    if (isControlled) {
      onToggle?.();
    } else {
      setLocalOpen(willOpen);
    }

    if (
      willOpen &&
      upsRates.length === 0
    ) {
      fetchUPSRates();
    }
  };

  const dropdownMotion =
    reduceMotion
      ? {}
      : {
          initial: {
            opacity: 0,
            height: 0,
          },
          animate: {
            opacity: 1,
            height: "auto",
          },
          exit: {
            opacity: 0,
            height: 0,
          },
          transition: {
            duration: 0.22,
            ease: "easeOut",
          },
        };

  return (
    <section className="bb-ups-rates">
      <button
        type="button"
        className={`bb-ups-rates-toggle ${
          actualOpen
            ? "bb-ups-rates-toggle--open"
            : ""
        }`}
        onClick={
          toggleDropdown
        }
        aria-expanded={
          actualOpen
        }
        aria-controls="bb-ups-rates-options"
      >
        <span className="bb-ups-rates-toggle-icon">
          <span aria-hidden="true">
            UPS
          </span>
        </span>

        <span className="bb-ups-rates-toggle-copy">
          <strong>
            UPS delivery
          </strong>

          <small>
            {selectedRate
              ? `Selected: ${selectedRate}`
              : "View available services"}
          </small>
        </span>

        <span
          className="bb-ups-rates-chevron"
          aria-hidden="true"
        >
          ›
        </span>
      </button>

      <AnimatePresence initial={false}>
        {actualOpen && (
          <motion.div
            id="bb-ups-rates-options"
            className="bb-ups-rates-dropdown"
            {...dropdownMotion}
          >
            <div className="bb-ups-rates-dropdown-inner">
              <header className="bb-ups-rates-heading">
                <div>
                  <span className="bb-ups-rates-eyebrow">
                    Available services
                  </span>

                  <h3>
                    Choose your delivery speed
                  </h3>
                </div>

                {!loading &&
                  upsRates.length >
                    0 && (
                    <span className="bb-ups-rates-count">
                      {
                        upsRates.length
                      }{" "}
                      {upsRates.length ===
                      1
                        ? "option"
                        : "options"}
                    </span>
                  )}
              </header>

              {loading ? (
                <div
                  className="bb-ups-rates-loading"
                  role="status"
                  aria-live="polite"
                >
                  <span
                    className="bb-ups-rates-spinner"
                    aria-hidden="true"
                  />

                  <div>
                    <strong>
                      Finding UPS rates
                    </strong>

                    <p>
                      Checking delivery
                      options for{" "}
                      {receiverZip}.
                    </p>
                  </div>
                </div>
              ) : error ? (
                <div
                  className="bb-ups-rates-error"
                  role="alert"
                >
                  <span aria-hidden="true">
                    !
                  </span>

                  <div>
                    <strong>
                      Rates unavailable
                    </strong>

                    <p>{error}</p>

                    <button
                      type="button"
                      onClick={
                        fetchUPSRates
                      }
                    >
                      Try Again
                    </button>
                  </div>
                </div>
              ) : upsRates.length >
                0 ? (
                <div className="bb-ups-rates-list">
                  <AnimatePresence
                    initial={false}
                  >
                    {upsRates.map(
                      (
                        rate,
                        index
                      ) => {
                        const serviceName =
                          rate.serviceName ||
                          `UPS option ${
                            index + 1
                          }`;

                        const isSelected =
                          selectedRate ===
                          serviceName;

                        const rateKey =
                          rate.serviceCode ||
                          `${serviceName}-${rate.cost}-${index}`;

                        return (
                          <motion.button
                            type="button"
                            key={
                              rateKey
                            }
                            className={`bb-ups-rates-option ${
                              isSelected
                                ? "bb-ups-rates-option--selected"
                                : ""
                            }`}
                            onClick={() =>
                              handleSelectRate(
                                rate
                              )
                            }
                            initial={
                              reduceMotion
                                ? false
                                : {
                                    opacity: 0,
                                    y: 10,
                                  }
                            }
                            animate={{
                              opacity: 1,
                              y: 0,
                            }}
                            exit={
                              reduceMotion
                                ? undefined
                                : {
                                    opacity: 0,
                                    y: -6,
                                  }
                            }
                            transition={{
                              duration:
                                0.18,
                              delay:
                                reduceMotion
                                  ? 0
                                  : index *
                                    0.035,
                            }}
                            aria-pressed={
                              isSelected
                            }
                          >
                            <span className="bb-ups-rates-option-check">
                              {isSelected
                                ? "✓"
                                : index +
                                  1}
                            </span>

                            <span className="bb-ups-rates-option-copy">
                              <strong className="bb-ups-rates-option-name">
                                {
                                  serviceName
                                }
                              </strong>

                              <small className="bb-ups-rates-option-delivery">
                                {formatDeliveryEstimate(
                                  rate
                                )}
                              </small>
                            </span>

                            <span className="bb-ups-rates-option-price">
                              {formatCost(
                                rate.cost
                              )}
                            </span>
                          </motion.button>
                        );
                      }
                    )}
                  </AnimatePresence>
                </div>
              ) : (
                <div className="bb-ups-rates-empty">
                  <span aria-hidden="true">
                    UPS
                  </span>

                  <strong>
                    No UPS rates available
                  </strong>

                  <p>
                    Try another ZIP code
                    or check again in a
                    moment.
                  </p>

                  <button
                    type="button"
                    onClick={
                      fetchUPSRates
                    }
                  >
                    Check Again
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
};

export default UPSRates;
