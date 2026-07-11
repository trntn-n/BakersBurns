import React, { useState } from "react";
import PrivacyPolicy from "../../Components/Privacy&Terms/privacyPolicy";
import TermsOfService from "../../Components/Privacy&Terms/termsOfService";
import { useNavigate } from "react-router-dom";
import { registerApi } from "../../config/axios";
import "./privacy_terms.css";
import Cookies from "js-cookie";

const PrivacyPolicyAndTerms = () => {
  const [isPolicyModalOpen, setIsPolicyModalOpen] = useState(false);
  const [isToSModalOpen, setIsToSModalOpen] = useState(false);
  const [isPolicyChecked, setIsPolicyChecked] = useState(false);
  const [isToSChecked, setIsToSChecked] = useState(false);
  const [isPolicyScrolledToBottom, setIsPolicyScrolledToBottom] = useState(false);
  const [isToSScrolledToBottom, setIsToSScrolledToBottom] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [confirmDisagree, setConfirmDisagree] = useState(false);
  const [pendingToggle, setPendingToggle] = useState(null);

  const navigate = useNavigate();
  const handleCheckout = async () => {
    setLoading(true);
    setError(null);

    try {
        const sessionId = localStorage.getItem("sessionId");
        const shippingDetails = Cookies.get("shippingDetails") 
            ? JSON.parse(Cookies.get("shippingDetails")) 
            : {};

        console.log("🚀 Sending Metadata to Backend:", shippingDetails);

        const response = await registerApi.post("/register-cart/create-checkout-session", {
            sessionId,
            metadata: {
                hasAcceptedPrivacy: isPolicyChecked,
                hasAcceptedTermsOfService: isToSChecked,
                ...shippingDetails,  // ✅ Include shipping details
            },
        });

        window.location.href = response.data.url;
    } catch (err) {
        setError("Failed to initiate checkout.");
    } finally {
        setLoading(false);
    }
};


  const updateCookieBeforeCheckout = () => {
    const shippingDetails = Cookies.get("shippingDetails") ? JSON.parse(Cookies.get("shippingDetails")) : {};
    
    const updatedShippingDetails = {
        ...shippingDetails,
        timestamp: Date.now(),  // Force update
    };

    Cookies.set("shippingDetails", JSON.stringify(updatedShippingDetails), { expires: 1 });
    console.log("✅ Updated Cookie Before Checkout:", updatedShippingDetails);
};

updateCookieBeforeCheckout();
  updateCookieBeforeCheckout();
  

  const handleToggle = (type) => {
    if (type === "privacy") {
      if (isPolicyChecked) {
        setPendingToggle("privacy");
        setConfirmDisagree(true);
      } else {
        setIsPolicyModalOpen(true);
        setIsPolicyScrolledToBottom(false); // Reset scroll state
      }
    } else if (type === "tos") {
      if (isToSChecked) {
        setPendingToggle("tos");
        setConfirmDisagree(true);
      } else {
        setIsToSModalOpen(true);
        setIsToSScrolledToBottom(false); // Reset scroll state
      }
    }
  };

  const handleAgree = (type) => {
    if (type === "privacy") {
      setIsPolicyChecked(true);
      setIsPolicyModalOpen(false);
    } else if (type === "tos") {
      setIsToSChecked(true);
      setIsToSModalOpen(false);
    }
  };

  const handleConfirmDisagree = () => {
    if (pendingToggle === "privacy") {
      setIsPolicyChecked(false);
    } else if (pendingToggle === "tos") {
      setIsToSChecked(false);
    }
    setPendingToggle(null);
    setConfirmDisagree(false);
  };

  const handleCancelDisagree = () => {
    setPendingToggle(null);
    setConfirmDisagree(false);
  };

  const handleDisagree = () => {
    setConfirmDisagree(false);
    setIsPolicyModalOpen(false);
    setIsToSModalOpen(false);
  }

  return (
    <div className="privacy-terms-container">
        {error && <p style={{ color: "red" }}>{error}</p>}

      <h2>Review Privacy Policy and Terms of Service</h2>

      {/* Privacy Policy Toggle */}
      <div className="toggle-wrapper">
        <span className="toggle-label">Privacy Policy</span>
        <div
          className={`toggle-container ${isPolicyChecked ? "checked" : ""}`}
          onClick={() => handleToggle("privacy")}
        >
          <div className="toggle-handle"></div>
        </div>
      </div>

      {/* Terms of Service Toggle */}
      <div className="toggle-wrapper">
        <span className="toggle-label">Terms of Service</span>
        <div
          className={`toggle-container ${isToSChecked ? "checked" : ""}`}
          onClick={() => handleToggle("tos")}
        >
          <div className="toggle-handle"></div>
        </div>
      </div>

      {/* Confirm Button */}
      {error && <p style={{ color: "red" }}>{error}</p>}
      <button
        onClick={handleCheckout}
        disabled={!isPolicyChecked || !isToSChecked || loading}
        style={{
          marginTop: "20px",
          padding: "10px 20px",
          background: isPolicyChecked && isToSChecked ? "green" : "gray",
          color: "white",
          border: "none",
          borderRadius: "5px",
          cursor: isPolicyChecked && isToSChecked ? "pointer" : "not-allowed",
        }}
      >
        {loading ? "Processing..." : "Accept & Proceed to Checkout"}
      </button>

      {/* Privacy Policy Modal */}
      {isPolicyModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <PrivacyPolicy
              onReachBottom={() => setIsPolicyScrolledToBottom(true)}
            />
            <div className="modal-buttons">
              <button
                onClick={() => handleAgree("privacy")}
                disabled={!isPolicyScrolledToBottom}
              >
                Agree
              </button>
              
              <p style={{marginTop: 20, padding:10}}>You must scroll to the bottom to click agree</p>
              <button onClick={handleDisagree}>I Don't Agree</button>
            </div>
          </div>
        </div>
      )}

      {/* Terms of Service Modal */}
      {isToSModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content">
            <TermsOfService
              onReachBottom={() => setIsToSScrolledToBottom(true)}
            />
            <div className="modal-buttons">
              <button
                onClick={() => handleAgree("tos")}
                disabled={!isToSScrolledToBottom}
              >
                Agree
              </button>
              
              <p style={{marginTop: 20, padding:10}}>You must scroll to the bottom to click agree</p>
              <button onClick={handleDisagree}>I Don't Agree</button>
            </div>
          </div>
        </div>
      )}


      {/* Confirm Disagree Modal */}
      {confirmDisagree && (
        <div className="modal-overlay">
          <div className="modal-content">
            <h2>Are you sure?</h2>
            <p>Pressing "Yes" means you do not want to use our website.</p>
            <div className="modal-buttons">
              <button onClick={handleConfirmDisagree}>Yes</button>
              <button onClick={handleCancelDisagree}>Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PrivacyPolicyAndTerms;
