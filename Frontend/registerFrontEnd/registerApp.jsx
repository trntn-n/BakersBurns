import React, { Suspense } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
} from 'react-router-dom';

import Navbar from './Components/navbar/navbar';
import BackgroundImage from './assets/tree.webp';

/*
 * Main customer-facing pages.
 *
 * These are loaded with the initial application bundle because they
 * are central to browsing products, events, and completing checkout.
 */
import Home from './Pages/Home/Home';
import Store from './Pages/Store/Store';
import Events from './Pages/Events/Events';
import Cart from './Pages/Cart/Cart';
import CheckoutOptions from './Pages/Cart/checkoutOptions';
import GuestCheckout from './Pages/Cart/guestCheckout';
import AcceptPrivacyTerms from './Pages/Cart/privacy&terms';


/*
 * Secondary pages.
 *
 * These remain lazy-loaded because they are less likely to be needed
 * during a typical visit.
 */
const About = React.lazy(() =>
  import('./Pages/About/About')
);
const Contact = React.lazy(() => 
  import('./Pages/Contact/Contact')
);

const Gallery = React.lazy(() =>
  import('./Pages/Gallery/Gallery')
);

const VerifyEmail = React.lazy(() =>
  import('./Pages/Signup/verifyEmail')
);

const Signup = React.lazy(() =>
  import('./Pages/Signup/SignUp')
);

const Login = React.lazy(() =>
  import('./Pages/Login/Login')
);

const PasswordResetForm = React.lazy(() =>
  import('./Components/verification/passwordReset')
);

const ForgotPassword = React.lazy(() =>
  import('./Pages/Login/passwordForgot')
);

const PrivacyPolicy = React.lazy(() =>
  import('./Components/Privacy&Terms/privacyPolicy')
);

const TermsOfService = React.lazy(() =>
  import('./Components/Privacy&Terms/termsOfService')
);

const CancelPage = React.lazy(() =>
  import('./Pages/Cart/cancelCheckout')
);

const SuccessPage = React.lazy(() =>
  import('./Pages/Cart/successCheckout')
);

const PasswordSetupForm = React.lazy(() =>
  import('./Pages/Signup/password')
);
const EventCheckoutSuccess = React.lazy(() =>
  import('./Pages/Events/EventsCheckoutSuccessful')
);
function App() {
  const appStyle = {
    backgroundImage: `url(${BackgroundImage})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
  };

  return (
    <Router>
      <div style={appStyle}>
        <Navbar />

        <Suspense fallback={<div>Loading...</div>}>
          <Routes>
            {/* Main customer-facing pages */}
            <Route
              path="/"
              element={<Home />}
            />

            <Route
              path="/store"
              element={<Store />}
            />

            <Route
              path="/events"
              element={<Events />}
            />

            <Route
              path="/cart"
              element={<Cart />}
            />

            <Route
              path="/checkout-options"
              element={<CheckoutOptions />}
            />

            <Route
              path="/guest-checkout"
              element={<GuestCheckout />}
            />

            <Route
              path="/accept-privacy-terms"
              element={<AcceptPrivacyTerms />}
            />

            {/* Secondary informational pages */}
            <Route
              path="/about"
              element={<About />}
            />

            <Route
              path="/gallery"
              element={<Gallery />}
            />

            <Route
              path="/privacy-policy"
              element={<PrivacyPolicy />}
            />

            <Route
              path="/terms-of-service"
              element={<TermsOfService />}
            />

            {/* Account and verification pages */}
            <Route
              path="/sign-up"
              element={<Signup />}
            />

            <Route
              path="/login"
              element={<Login />}
            />

            <Route
              path="/verifyemail"
              element={<VerifyEmail />}
            />

            <Route
              path="/verify"
              element={<VerifyEmail />}
            />
            <Route 
              path="/contact"
              element={<Contact />}
            />
            <Route
              path="/passwordreset"
              element={<PasswordResetForm />}
            />

            <Route
              path="/forgotpassword"
              element={<ForgotPassword />}
            />

            <Route
              path="/password-form"
              element={<PasswordSetupForm />}
            />

            {/* Checkout result pages */}
            <Route
              path="/cancel"
              element={<CancelPage />}
            />

            <Route
              path="/success"
              element={<SuccessPage />}
            />
            <Route 
              path="/event-checkout-success"
              element={<EventCheckoutSuccess />}
            />
          </Routes>
        </Suspense>
      </div>
    </Router>
  );
}

export default App;