import React, { useRef, useEffect } from 'react';
import './legalPolicies.css';

const TermsOfService = ({ onReachBottom }) => {
  const bottomRef = useRef(null);

  useEffect(() => {
    const bottomElement = bottomRef.current;

    if (!bottomElement || typeof IntersectionObserver === 'undefined') {
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry?.isIntersecting && typeof onReachBottom === 'function') {
          onReachBottom(true);
        }
      },
      { threshold: 1 }
    );

    observer.observe(bottomElement);

    return () => {
      observer.disconnect();
    };
  }, [onReachBottom]);

  return (
    <main className="bb-legal-page bb-legal-terms-page">
      <article
        className="bb-legal-terms-document"
        aria-labelledby="bb-legal-terms-title"
      >
        <header className="bb-legal-terms-header">
          <span className="bb-legal-terms-eyebrow">BakersBurns policies</span>
          <h1 id="bb-legal-terms-title">Terms of Service</h1>
          <p className="bb-legal-terms-date">
            <strong>Published:</strong> December 9, 2024
          </p>
          <p className="bb-legal-terms-intro">
            Please read these terms carefully before using the BakersBurns
            website, purchasing products, or registering for an event.
          </p>
        </header>

        <div className="bb-legal-terms-content">

      <section className="bb-legal-terms-section">
        <h2>1. Acceptance of Terms</h2>
        <p>
          By accessing or using the services provided by Bakers Burns ("the Platform"), you ("the User") agree to comply with these Terms of Service ("Terms"). If you do not agree with these Terms, you must discontinue use of the Platform immediately.
        </p>
      </section>

      <section className="bb-legal-terms-section">
        <h2>2. Services Provided</h2>
        <p>
          Bakers Burns offers an e-commerce platform enabling users to:
        </p>
        <ul>
          <li>Purchase handmade products.</li>
          <li>Enroll in and purchase classes.</li>
          <li>Track order statuses.</li>
          <li>Communicate with the platform administrator via in-app messaging.</li>
          <li>View and participate in events.</li>
        </ul>
      </section>

      <section className="bb-legal-terms-section">
        <h2>3. User Obligations</h2>
        <p>
          As a condition of use, you agree to:
        </p>
        <ul>
          <li>Use the Platform for its intended purposes, including purchasing goods or services and participating in events.</li>
          <li>Refrain from engaging in prohibited activities, including but not limited to unauthorized access, spamming, or actions that harm the functionality or integrity of the Platform.</li>
        </ul>
      </section>

      <section className="bb-legal-terms-section">
        <h2>4. Account Registration</h2>
        <p>
          Users must create an account to access certain features of the Platform. You are responsible for maintaining the confidentiality of your login credentials and all activities conducted under your account.
        </p>
      </section>

      <section className="bb-legal-terms-section">
        <h2>5. Payment and Refund Policy</h2>
        <p>
          Payments for goods and services are processed through third-party payment processors. Refunds or cancellations are subject to our <a href="/refund-policy">Refund Policy</a> and are evaluated on a case-by-case basis.
        </p>
      </section>
      <section className="bb-legal-terms-section">
        <h2>6. Order Cancellation Policy</h2>
        <p>
          Orders placed on Bakers Burns may be canceled under the following conditions:
        </p>
        <ul>
          <li>
            <strong>Time Frame:</strong> Users may cancel orders within a specified time (e.g., 24 hours) unless the order has already been processed or shipped.
          </li>
          <li>
            <strong>Custom Orders:</strong> Custom or personalized orders cannot be canceled once production has started.
          </li>
          <li>
            <strong>Refunds:</strong> Approved cancellations will be refunded to the original payment method, minus any applicable fees.
          </li>
        </ul>
      </section>

      <section className="bb-legal-terms-section">
        <h2>7. Intellectual Property</h2>
        <p>
          All content uploaded by Users to the Platform becomes the property of Bakers Burns. The Platform reserves the right to use such content, including user-generated materials, for promotional and marketing purposes, subject to applicable laws.
        </p>
      </section>

      <section className="bb-legal-terms-section">
        <h2>8. Limitation of Liability</h2>
        <p>
          Bakers Burns is not liable for any direct, indirect, incidental, or consequential damages arising from the use or inability to use the Platform, including but not limited to errors, interruptions, or data loss.
        </p>
      </section>

      <section className="bb-legal-terms-section">
        <h2>9. Termination</h2>
        <p>
          Bakers Burns reserves the right to suspend or terminate user accounts without notice for any violation of these Terms, including but not limited to fraudulent activities, abuse, or unauthorized use of the Platform.
        </p>
      </section>

      <section className="bb-legal-terms-section">
        <h2>10. Governing Law</h2>
        <p>
          These Terms are governed by the laws of the United States, without regard to its conflict of laws principles.
        </p>
      </section>

      <section className="bb-legal-terms-section">
  <h2>11. Dispute Resolution</h2>
  <p>In the event of a dispute, Users agree to the following process:</p>
  <ul>
    <li>
      <strong>Arbitration Agreement:</strong> All disputes will be resolved through binding arbitration in accordance with the rules of the American Arbitration Association. Users waive the right to participate in class action lawsuits or jury trials.
    </li>
    <li>
      <strong>Jurisdiction:</strong> Any arbitration or legal proceedings will be conducted in the state where Bakers Burns is registered.
    </li>
    <li>
      <strong>Notice of Dispute:</strong> Before initiating arbitration, Users must provide written notice to Bakers Burns outlining the nature of the dispute and allowing at least 30 days for resolution.
    </li>
  </ul>
</section>


      <section className="bb-legal-terms-section">
        <h2>12. Shipping & Handling</h2>
        <p>
          Bakers Burns aims to ensure timely delivery of all purchased items. However, we are not responsible for delays, damages, or losses caused by third-party shipping providers. By using the Platform, you agree to the following:
        </p>
        <ul>
          <li>
            <strong>Shipping Costs:</strong> Users are responsible for all shipping fees unless otherwise specified during the checkout process.
          </li>
          <li>
            <strong>Handling Damages:</strong> Once a product is shipped, Bakers Burns is not liable for damages incurred during transit. Users are encouraged to inspect items upon delivery and report damages directly to the shipping provider.
          </li>
          <li>
            <strong>Delivery Timeline:</strong> Estimated delivery dates are provided as guidelines and may vary based on location and external factors, including weather, customs delays, or carrier issues.
          </li>
          <li>
            <strong>Lost or Stolen Packages:</strong> Bakers Burns is not liable for packages marked as "delivered" by the carrier but reported as lost or stolen. Users are encouraged to ensure secure delivery locations and contact the shipping provider for resolution.
          </li>
          <li>
            <strong>International Shipping:</strong> Orders shipped outside the United States may be subject to customs duties or import taxes. Bakers Burns is not responsible for these charges, which are the user's responsibility.
          </li>
        </ul>
      </section>

      <section className="bb-legal-terms-section">
        <h2>13. Privacy and Data Protection</h2>
        <p>
          Bakers Burns is committed to protecting user privacy. By using the Platform, you agree to our collection, use, and sharing of your personal data as outlined in our <a href="/privacy-policy">Privacy Policy</a>. 
        </p>
        <ul>
          <li>
            <strong>Data Collection:</strong> We collect personal information, including but not limited to name, email, address, and payment details, to provide services.
          </li>
          <li>
            <strong>Third-Party Sharing:</strong> Personal information may be shared with trusted third-party service providers for payment processing, shipping, or marketing purposes.
          </li>
          <li>
            <strong>User Responsibility:</strong> Users are responsible for keeping their account credentials secure. Bakers Burns is not liable for unauthorized account access caused by user negligence.
          </li>
          <li>
            <strong>Cookies:</strong> The Platform uses cookies to enhance user experience. Continued use of the Platform constitutes consent to our use of cookies as described in our Privacy Policy.
          </li>
        </ul>
      </section>

      <section className="bb-legal-terms-section">
        <h2>14. Prohibited Conduct</h2>
        <p>
          Users agree not to engage in any of the following prohibited activities on the Platform:
        </p>
        <ul>
          <li>Uploading harmful or malicious content, including viruses or malware.</li>
          <li>Attempting to gain unauthorized access to the Platform or other users' accounts.</li>
          <li>Using the Platform for fraudulent transactions or illegal activities.</li>
          <li>Interfering with the functionality of the Platform, including attempts to overload or disrupt servers.</li>
          <li>Violating any applicable local, state, national, or international laws while using the Platform.</li>
        </ul>
      </section>
      <section className="bb-legal-terms-section">
        <h2>15. Disclaimer of Warranties</h2>
        <p>
          The Platform and its services are provided "as is" and "as available" without warranties of any kind. Bakers Burns disclaims all warranties, express or implied, including but not limited to:
        </p>
        <ul>
          <li>Merchantability, fitness for a particular purpose, or non-infringement.</li>
          <li>Uninterrupted access or error-free functionality.</li>
          <li>The accuracy, reliability, or completeness of content or products.</li>
        </ul>
        <p>
          Users assume full responsibility for their use of the Platform and any associated risks.
        </p>
      </section>

      <section className="bb-legal-terms-section">
        <h2>15. Age Restrictions</h2>
        <p>
          By using the Platform, you confirm that you are at least 18 years old or have the permission of a legal guardian to use the Platform. Bakers Burns does not knowingly collect personal information from individuals under the age of 13.
        </p>
      </section>

      <section className="bb-legal-terms-section">
        <h2>17. Third-Party Services</h2>
        <p>
          Bakers Burns integrates with trusted third-party service providers to enhance platform functionality. These services include, but are not limited to:
        </p>
        <ul>
          <li>
            <strong>Payment Processing:</strong> Payments are processed securely through <a href="https://stripe.com">Stripe</a>. By completing a transaction, you agree to Stripe's <a href="https://stripe.com/legal">Terms of Service</a> and <a href="https://stripe.com/privacy">Privacy Policy</a>.
          </li>
          <li>
            <strong>Analytics:</strong> The Platform uses Google Analytics to monitor site performance and user interactions. Please review Google's <a href="https://policies.google.com/privacy">Privacy Policy</a> for more details.
          </li>
          <li>
            <strong>Shipping and Fulfillment:</strong> Orders are fulfilled by third-party shipping providers, including but not limited to UPS, FedEx, and USPS. Users agree to their respective terms when shipping services are utilized.
          </li>
        </ul>
        <p>
          Bakers Burns is not responsible for any issues arising from third-party services, including delays, data breaches, or service interruptions. Users are encouraged to review the policies of these providers.
        </p>
      </section>

        <section className="bb-legal-terms-section">
          <h2>18. Force Majeure</h2>
          <p>
            Bakers Burns is not liable for any failure or delay in performance caused by circumstances beyond its reasonable control, including but not limited to natural disasters, acts of government, labor disputes, pandemics, power outages, or internet service interruptions.
          </p>
        </section>
        <section className="bb-legal-terms-section">
          <h2>19. Promotions and Discounts</h2>
          <p>
            Bakers Burns may offer promotions, discounts, or special offers from time to time. By participating in these offers, you agree to the following:
          </p>
          <ul>
            <li>
              <strong>Eligibility:</strong> Promotions are subject to eligibility criteria and may require specific actions, such as entering a promo code or meeting a minimum purchase requirement.
            </li>
            <li>
              <strong>Non-Transferability:</strong> Promotions cannot be transferred, resold, or redeemed for cash unless explicitly stated.
            </li>
            <li>
              <strong>Expiration:</strong> All promotions have an expiration date, which will be specified in the terms of the promotion.
            </li>
            <li>
              <strong>Right to Modify:</strong> Bakers Burns reserves the right to cancel or modify promotions at any time without prior notice.
            </li>
          </ul>
        </section>
        <section className="bb-legal-terms-section">
          <h2>20. Custom Orders</h2>
          <p>
            Bakers Burns may offer custom or personalized products. By placing a custom order, you agree to the following:
          </p>
          <ul>
            <li>
              <strong>Accuracy:</strong> You are responsible for providing accurate details (e.g., text, colors, sizes) for custom orders.
            </li>
            <li>
              <strong>Approval Process:</strong> Custom orders may require user approval of proofs or designs before production. Delays in approval can affect delivery timelines.
            </li>
            <li>
              <strong>Non-Refundable:</strong> Custom products are non-refundable unless defective or incorrect due to a mistake by Bakers Burns.
            </li>
          </ul>
        </section>
        <section className="bb-legal-terms-section">
          <h2>21. Product Allergies Disclaimer</h2>
          <p>
            Bakers Burns strives to provide clear and accurate product information, including ingredient lists where applicable. By purchasing and using our products, you acknowledge and agree to the following:
          </p>
          <ul>
            <li>
              <strong>Allergy Risk:</strong> Some products may contain allergens, including but not limited to nuts, dairy, gluten, or other ingredients that may cause allergic reactions. It is the user's responsibility to review product descriptions and ingredient lists carefully before purchase or use.
            </li>
            <li>
              <strong>No Liability:</strong> Bakers Burns is not liable for allergic reactions or other adverse effects caused by the use of our products. Users are advised to consult a medical professional if they are uncertain about potential allergens.
            </li>
            <li>
              <strong>Cross-Contamination:</strong> While we take precautions to avoid cross-contamination, products may be manufactured in facilities that process common allergens. Users with severe allergies should exercise caution.
            </li>
            <li>
              <strong>Testing Products:</strong> Users are encouraged to test products on a small area of skin before full use to determine suitability, particularly for products applied topically.
            </li>
          </ul>
        </section>


      <section className="bb-legal-terms-section">
        <h2>22. Modifications</h2>
        <p>
        Bakers Burns reserves the right to modify these Terms at any time. Users will be notified of any material changes via email or by a notice on the Platform. Continued use of the Platform constitutes acceptance of the revised Terms.
        </p>
       </section>
      <section className="bb-legal-terms-section">
        <h2>Guest Checkout</h2>
        <p>
          By proceeding with Guest Checkout, you agree to the following terms related to your order and account creation:
        </p>
        <ul>
          <li>
            <strong>Temporary Account Creation:</strong> A temporary account is automatically created for you during the checkout process to process and manage your order. The account will be associated with the email address provided at checkout.
          </li>
          <li>
            <strong>Account Setup:</strong> You will receive an email with a link to complete your account setup. This link allows you to create a password and fully activate your account. Completing this setup grants access to order history, tracking, and other features.
          </li>
          <li>
            <strong>Missing Email:</strong> If you do not receive an account setup email, you may already have an account associated with the provided email address. Please use the "Forgot Password" feature on the login page to reset your password and access your account.
          </li>
          <li>
            <strong>Data Handling:</strong> All shipping and billing addresses provided during checkout are securely hashed in our database to ensure your data remains private and secure.
          </li>
        </ul>
      </section>




          <div
            ref={bottomRef}
            className="bb-legal-terms-sentinel"
            aria-hidden="true"
          />
        </div>
      </article>
    </main>
  );
};

export default TermsOfService;
