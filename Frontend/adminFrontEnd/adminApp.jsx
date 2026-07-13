
import React, { useEffect, useState } from 'react';
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from 'react-router-dom';
import axios from 'axios';

import Navbar from './Components/navbar';
import AdminLoginForm from './Components/loginForm';

import Home from './Pages/Home';
import GalleryManagement from './Pages/GalleryManager';
import Messaging from './Pages/Messaging/inAppMessaging';
import Email from './Pages/Email';
import Layout from './Pages/Layout';
import Orders from './Pages/Order/Orders';
import Events from './Pages/newEvents';
import Discount from './Pages/Discounts/Discounts';
import SocialLinksManager from './Pages/Social/socialManager';
import ProductManagement from './Pages/productManager/Products';
import Invoices from './Pages/Invoice/Invoice';

import { ScannerProvider } from './context/scannerContext';
import { DiscountProvider } from './Pages/Discounts/discounts-context';
import { ProductsProvider } from './Pages/productManager/ProductsContext';

/*
 * Authentication bypass is permitted only when:
 *
 * 1. Vite is running in development mode.
 * 2. VITE_ADMIN_MODE is explicitly set to "development".
 *
 * import.meta.env.DEV is always false in a production build, so accidentally
 * setting VITE_ADMIN_MODE=development during production will not bypass auth.
 */
const SHOULD_BYPASS_AUTH =
  import.meta.env.DEV &&
  import.meta.env.VITE_ADMIN_MODE === 'development';

const AdminApp = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(
    SHOULD_BYPASS_AUTH
  );

  const [userRole, setUserRole] = useState(
    SHOULD_BYPASS_AUTH ? 'admin' : null
  );

  const [loading, setLoading] = useState(!SHOULD_BYPASS_AUTH);

  useEffect(() => {
    const storedDarkMode = localStorage.getItem('darkMode') === 'true';
    const root = document.documentElement;

    if (storedDarkMode) {
      root.classList.add('dark-mode');
      root.setAttribute('data-theme', 'dark');
    } else {
      root.classList.remove('dark-mode');
      root.setAttribute('data-theme', 'light');
    }
  }, []);

  useEffect(() => {
    /*
     * Skip the authentication request only during explicitly configured
     * local development.
     */
    if (SHOULD_BYPASS_AUTH) {
      console.warn(
        'Admin authentication is disabled for local development.'
      );

      setIsAuthenticated(true);
      setUserRole('admin');
      setLoading(false);

      return;
    }

    const checkAuth = async () => {
      try {
        const response = await axios.get('/auth/check-auth', {
          withCredentials: true,
        });

        if (response.data?.role === 'admin') {
          setIsAuthenticated(true);
          setUserRole(response.data.role);
        } else {
          setIsAuthenticated(false);
          setUserRole(null);
        }
      } catch (error) {
        console.error('Auth check failed:', error);

        setIsAuthenticated(false);
        setUserRole(null);
      } finally {
        setLoading(false);
      }
    };

    checkAuth();
  }, []);

  const handleLoginSuccess = (role) => {
    if (role !== 'admin') {
      setIsAuthenticated(false);
      setUserRole(null);
      return;
    }

    setIsAuthenticated(true);
    setUserRole(role);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (!isAuthenticated || userRole !== 'admin') {
    return (
      <AdminLoginForm
        onLoginSuccess={handleLoginSuccess}
      />
    );
  }

  return (
    <ScannerProvider>
      <Router>
        <Navbar />

        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/gallery" element={<GalleryManagement />} />
          <Route path="/layout" element={<Layout />} />
          <Route path="/messaging" element={<Messaging />} />
          <Route path="/email" element={<Email />} />
          <Route path="/orders" element={<Orders />} />
          <Route path="/event-manager" element={<Events />} />
          <Route
            path="/social-manager"
            element={<SocialLinksManager />}
          />
          <Route path="/invoices" element={<Invoices />} />

          <Route
            path="/product-manager"
            element={
              <ProductsProvider>
                <ProductManagement />
              </ProductsProvider>
            }
          />

          <Route
            path="/discount"
            element={
              <DiscountProvider>
                <Discount />
              </DiscountProvider>
            }
          />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Router>
    </ScannerProvider>
  );
};

export default AdminApp;

