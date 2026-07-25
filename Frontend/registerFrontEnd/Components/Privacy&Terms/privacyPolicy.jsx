import React, { useEffect, useRef } from 'react';
import './legalPolicies.css';



const PrivacyPolicy = ({ onReachBottom }) => {
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
      <main className="bb-legal-page bb-legal-privacy-page">
        <article
          className="bb-legal-privacy-document"
          aria-labelledby="bb-legal-privacy-title"
        >
          <header className="bb-legal-privacy-header">
            <span className="bb-legal-privacy-eyebrow">BakersBurns policies</span>
            <h1 id="bb-legal-privacy-title">Privacy Policy</h1>
            <p className="bb-legal-privacy-date">
              <strong>Effective Date:</strong> December 8, 2024
            </p>
            <p className="bb-legal-privacy-intro">
              This policy explains what information BakersBurns collects, how it
              is used, and the choices available to you.
            </p>
          </header>

          <div className="bb-legal-privacy-content">

            <section className="bb-legal-privacy-section">
                <h2>1. Business Information</h2>
                <p><strong>Company Name:</strong> BakersBurns</p>
                <strong>
                <a
                    href="mailto:trentyn.nicholas@gmail.com"
                    className="bb-legal-privacy-link"
                >
                    trentyn.nicholas@gmail.com
                </a>
                </strong>
            </section>

            <section className="bb-legal-privacy-section">
                <h2>2. Information We Collect</h2>
                <p>We may collect the following types of personal information from you when you use our Website:</p>
                <ul>
                    <li><strong>Personal Identifiable Information:</strong> Name, email, phone number, IP address, and billing address.</li>
                    <li><strong>Cookies:</strong> We use HTTPS-only cookies for authentication and facilitating CRUD operations.</li>
                    <li><strong>Third-Party Data Collection:</strong> We integrate with third-party tools such as Stripe, FedEx, UPS, USPS, and Google, which may also collect information as part of their services.</li>
                </ul>
            </section>
            <section className="bb-legal-privacy-section">
                <h2>7. Data Security</h2>
                <p>We prioritize the security of your personal information and implement robust measures to protect your data:</p>
                <ul>
                    <li>
                        <strong>Hashing of Addresses:</strong> 
                        Shipping and billing addresses are securely hashed in our database to protect your privacy and mitigate risks of unauthorized access.
                    </li>
                    <li>
                        <strong>Encryption in Transit:</strong> 
                        All data exchanged between your browser and our servers is encrypted using SSL/TLS protocols.
                    </li>
                    <li>
                        <strong>XSS Protection:</strong> 
                        Field inputs across the Website are sanitized to protect against cross-site scripting (XSS) attacks.
                    </li>
                    <li>
                        <strong>Intrusion Detection:</strong> 
                        Our servers are protected by Suricata intrusion detection systems to monitor and mitigate potential threats.
                    </li>
                    <li>
                        <strong>Rate Limiting:</strong> 
                        IP rate limiters are in place to prevent brute-force attempts on user accounts.
                    </li>
                </ul>
            </section>


            <section className="bb-legal-privacy-section">
                <h2>3. How We Use Your Information</h2>
                <p>We may use your personal information for the following purposes:</p>
                <ul>
                    <li>Account creation and user authentication.</li>
                    <li>Sending updates and marketing emails (with your consent).</li>
                    <li>Facilitating transactions, such as payment processing and order tracking.</li>
                    <li>Enhancing user experience and improving the Website.</li>
                </ul>
                <p>(Even though we do not actively collect data for analytics or behavior tracking, we reserve the right to do so in the future.)</p>
            </section>

            <section className="bb-legal-privacy-section">
                <h2>4. Sharing Your Information</h2>
                <p>We share your data with the following third parties solely for specific purposes:</p>
                <ul>
                    <li><strong>Stripe:</strong> For payment processing.</li>
                    <li><strong>FedEx, UPS, USPS:</strong> For order tracking and status updates.</li>
                    <li><strong>Google:</strong> For user sign-up and sign-in functionalities.</li>
                </ul>
                <p>We ensure that sensitive data, such as your shipping address, is hashed in our database for added security.</p>
            </section>

            <section className="bb-legal-privacy-section">
                <h2>5. Data Retention</h2>
                <p>We retain user data for the following periods:</p>
                <ul>
                    <li><strong>Order History:</strong> Maintained indefinitely for record-keeping purposes.</li>
                    <li><strong>Account Data:</strong> Deleted upon account deletion.</li>
                    <li><strong>In-App Messages:</strong> Deleted along with account data during account deletion.</li>
                </ul>
                <p>Users can request access to their data or deletion of specific information (e.g., email or account data) by contacting us.</p>
            </section>

            <section className="bb-legal-privacy-section">
                <h2>6. Children’s Privacy</h2>
                <p>Our Website is not specifically intended for children under 13. We do not knowingly collect data from minors. If we become aware that we have collected information from a child under 13, we will delete it immediately.</p>
            </section>

            <section className="bb-legal-privacy-section">
                <h2>7. Data Security</h2>
                <p>We prioritize the security of your personal information and implement the following measures:</p>
                <ul>
                    <li>HTTPS-only cookies and field input protection using XSS sanitization.</li>
                    <li>Sensitive data, including shipping addresses, is hashed in the database.</li>
                    <li>VPS protection with Suricata intrusion detection systems.</li>
                    <li>IP rate-limiters to prevent brute-force password attempts.</li>
                </ul>
            </section>

            <section className="bb-legal-privacy-section">
                <h2>8. User Rights</h2>
                <p>You have the following rights concerning your data:</p>
                <ul>
                    <li><strong>Access, Correction, and Deletion:</strong> Users can request access to, correction, or deletion of their personal data.</li>
                    <li><strong>Opting Out of Emails:</strong> You can opt out of promotional and tracking emails, but cookie data collection is mandatory for the functionality of the Website.</li>
                </ul>
                <p>We provide an opt-in notification during sign-up for promotional and tracking-related emails.</p>
            </section>

            <section className="bb-legal-privacy-section">
                <h2>9. Third-Party Links</h2>
                <p>Our Website may link to third-party documentation (e.g., carrier and Google API documentation). We are not responsible for the privacy practices or content of these third-party websites.</p>
            </section>

            <section className="bb-legal-privacy-section">
                <h2>10. Policy Updates</h2>
                <p>We reserve the right to update this Privacy Policy at any time. When significant changes are made:</p>
                <ul>
                    <li>A banner or message will be displayed on our Website.</li>
                    <li>We will notify users via email.</li>
                </ul>
                <p>We encourage users to review this Privacy Policy periodically.</p>
            </section>
            <section className="bb-legal-privacy-section">
                <h2>11. Legal Basis for Data Processing</h2>
                <p>
                    We process your personal information based on the following legal grounds:
                </p>
                <ul>
                    <li><strong>Consent:</strong> When you provide your explicit consent for specific purposes, such as receiving marketing communications.</li>
                    <li><strong>Contractual Necessity:</strong> To fulfill orders, manage accounts, and provide customer support.</li>
                    <li><strong>Legitimate Interests:</strong> To improve our Website, enhance user experience, and prevent fraudulent activities.</li>
                    <li><strong>Legal Obligations:</strong> To comply with applicable laws, such as tax or regulatory requirements.</li>
                </ul>
            </section>
            <section className="bb-legal-privacy-section">
                <h2>12. Cookies and Tracking Technologies</h2>
                <p>
                    Bakers Burns uses cookies and similar tracking technologies to enhance user experience and monitor website performance. By using our Website, you agree to the use of these technologies as described below:
                </p>
                <ul>
                    <li><strong>Necessary Cookies:</strong> Used for essential functionality, such as authentication and maintaining shopping cart items.</li>
                    <li><strong>Performance Cookies:</strong> Collect data on user interactions to improve Website performance.</li>
                    <li><strong>Third-Party Cookies:</strong> Used by partners, such as Stripe and Google, for payment processing and login functionality.</li>
                </ul>
                <p>
                    Users can control cookie settings through their browser. However, disabling cookies may impact Website functionality.
                </p>
            </section>
            <section className="bb-legal-privacy-section">
                <h2>13. International Data Transfers</h2>
                <p>
                    Bakers Burns operates globally, and your personal information may be processed in countries outside your own. By using our Website, you acknowledge and agree to the following:
                </p>
                <ul>
                    <li>We ensure that international data transfers comply with applicable laws, such as GDPR and CCPA.</li>
                    <li>Where required, we implement appropriate safeguards, such as data transfer agreements or reliance on lawful frameworks like Standard Contractual Clauses.</li>
                </ul>
            </section>
            <section className="bb-legal-privacy-section">
                <h2>14. Breach Notification Policy</h2>
                <p>
                    In the event of a data breach involving your personal information, Bakers Burns will:
                </p>
                <ul>
                    <li>Notify affected users as soon as practicable.</li>
                    <li>Report the breach to the appropriate regulatory authorities, if required by law.</li>
                    <li>Provide guidance on protective measures users can take to secure their information.</li>
                </ul>
            </section>
            <section className="bb-legal-privacy-section">
                <h2>15. Data Minimization and Storage</h2>
                <p>
                    Bakers Burns is committed to collecting and storing only the data necessary for providing our services. Our practices include:
                </p>
                <ul>
                    <li><strong>Minimization:</strong> We only collect data that is relevant and necessary for specific purposes.</li>
                    <li><strong>Retention Periods:</strong> Data is stored only for as long as necessary to fulfill its purpose, comply with legal obligations, or resolve disputes.</li>
                    <li><strong>Secure Deletion:</strong> When data is no longer needed, we securely delete or anonymize it to protect user privacy.</li>
                </ul>
            </section>
            <section className="bb-legal-privacy-section">
                <h2>16. User Rights</h2>
                <p>
                    Bakers Burns is committed to ensuring all users have control over their personal data. Regardless of your location, you have the following rights:
                </p>
                <ul>
                    <li>
                        <strong>Access:</strong> You can request access to your personal data and obtain a copy of the information we hold about you.
                    </li>
                    <li>
                        <strong>Correction:</strong> If you believe any information we have is inaccurate or incomplete, you can request corrections or updates.
                    </li>
                    <li>
                        <strong>Deletion:</strong> You can request the deletion of your personal data, subject to legal or operational retention requirements (e.g., for tax or order history).
                    </li>
                    <li>
                        <strong>Restriction:</strong> You can request a temporary suspension of processing your data in certain situations, such as during a dispute over accuracy.
                    </li>
                    <li>
                        <strong>Portability:</strong> You can request a copy of your data in a structured, machine-readable format and have it transferred to another service provider where technically feasible.
                    </li>
                    <li>
                        <strong>Objection:</strong> You can object to the processing of your data for direct marketing or based on our legitimate interests.
                    </li>
                </ul>
                <p>
                    To exercise these rights, please contact us at <strong>trentyn.nicholas@gmail.com</strong>. We will respond to all verified requests within 30 days, unless an extension is required due to the complexity of the request, in which case you will be notified.
                </p>
            </section>
            <section className="bb-legal-privacy-section">
                <h2>17. Behavioral Tracking and Analytics</h2>
                <p>
                    While we do not currently engage in behavioral tracking, we reserve the right to implement analytics tools in the future to enhance user experience and improve our services. If implemented, these tools may:
                </p>
                <ul>
                    <li>Track user behavior, such as pages visited, time spent on the site, and interaction with content.</li>
                    <li>Use cookies or similar technologies to collect information for analytics purposes.</li>
                    <li>Allow us to tailor content, promotions, and other features to better meet user preferences.</li>
                </ul>
                <p>
                    If such tracking is enabled, users will be notified and provided with an option to opt-out where legally required. We will update this Privacy Policy accordingly at that time.
                </p>
            </section>









            <section className="bb-legal-privacy-section">
                <p>If you have any questions or concerns about this Privacy Policy, please contact us at </p>
                <strong>
               
                
                </strong>
                
            </section>
            <section className="bb-legal-privacy-section">
                <h2>Guest Checkout</h2>
                <p>
                    By using Guest Checkout, you agree to the creation of a temporary account to facilitate the processing of your order. The following applies:
                </p>
                <ul>
                    <li>
                    <strong>Temporary Account Creation:</strong> During the checkout process, we automatically create a temporary account using the information you provide (e.g., email, shipping, and billing addresses). 
                    </li>
                    <li>
                    <strong>Account Completion:</strong> After placing your order, you will receive an email with a link to complete your account setup. This enables you to access additional features such as order tracking and account management. 
                    </li>
                    <li>
                    <strong>Already Have an Account?</strong> If you do not receive the account setup email, it is possible that an account associated with your email address already exists. Please use the "Forgot Password" feature on the login page to access your account.
                    </li>
                    <li>
                    <strong>Data Security:</strong> We hash all sensitive data, including shipping and billing addresses, to ensure your privacy and protect against unauthorized access.
                    </li>
                </ul>
            </section>
            <a
                    href="mailto:trentyn.nicholas@gmail.com"
                    className="bb-legal-privacy-link"
                >
                    trentyn.nicholas@gmail.com
                </a>

            <div
              ref={bottomRef}
              className="bb-legal-privacy-sentinel"
              aria-hidden="true"
            />
          </div>
        </article>
      </main>
    );
};

export default PrivacyPolicy;
