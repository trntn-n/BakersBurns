import React from 'react';
import { Link } from 'react-router-dom';
import '../Pagecss/Home.css'; // Import the CSS file for styling
import NotificationBadge from '../Components/notification/notificationBadge';
import ProductManagerGif from '../assets/ProductManager.gif'; // Import the ProductManager GIF
import OrdersGif from '../assets/orders.gif';
import GalleryGif from '../assets/gallery.gif';
import MessageGif from '../assets/messages.gif';
import SocialsGif from '../assets/socials.gif';
import EmailGif from '../assets/email.gif';
import UsersGif from '../assets/users.gif';
import InvoicesGif from '../assets/invoice.gif';

const Home = () => {
  return (
    <div className="home-container">
      <div className="background-image"></div>
      <div className="content">
        <h1 className="home-page-header"></h1>

        <ul className="home-app-tiles">
        
        <li className="home-tile">
            <Link  style={{textDecoration: 'none'}} to="/orders">
              <div className='tile-content'>
                <h3>Orders</h3>
                <img 
                style={{width: '100%', height: 'auto'}}
                src={OrdersGif}/>
                <p>Manage orders</p>
                
                <NotificationBadge
                  apiEndpoint="/admin-notifications/orders"
                  customFilter={(data) => data.filter((order) => order.status.toLowerCase() === 'processing')}
                  color="red"
                  label="Processing Orders"
                />
                

              </div>
            </Link>
          </li>

          <li className="home-tile">
            <Link style={{textDecoration: 'none'}} to="/product-manager">
              <div className="tile-content">
                <h3>Product Manager</h3>
                <img 
                style={{width: '100%', height: 'auto'}}
                src={ProductManagerGif}/>
                <p className='home-tile-description'>Manage products and inventory</p>
              </div>
            </Link>
          </li>
          <li className="home-tile">
            <Link style={{textDecoration: 'none'}} to="/event-manager">
              <div className="tile-content">
                <h3>Events</h3>
                <img 
                style={{width: '100%', height: 'auto'}}
                src={MessageGif}/>
                <p className='home-tile-description'>Contact users using in app messaging</p>
              </div>
            </Link>
          </li>
          
          <li className="home-tile">
            <Link  style={{textDecoration: 'none'}} to="/gallery">
              <div className="tile-content">
                <h3>Gallery</h3>
                <img 
                style={{width: '100%', height: 'auto'}}
                src={GalleryGif}/>
                <p className='home-tile-description'>Manage your gallery here</p>
              </div>
            </Link>
          </li>
          


          <li className="home-tile">
            <Link style={{textDecoration: 'none'}} to="/messaging">
              <div className="tile-content">
                <h3>Messaging</h3>
                <img 
                style={{width: '100%', height: 'auto'}}
                src={MessageGif}/>
                <p className='home-tile-description'>Contact users using in app messaging</p>
              </div>
            </Link>
          </li>
          <li className="home-tile">
            <Link style={{textDecoration: 'none'}} to="/email">
              <div className='tile-content'>
                <h3>Email</h3>
                <img 
                style={{width: '100%', height: 'auto'}}
                src={EmailGif}/>
                <p className='home-tile-description'>Contact users using email. (Will only work with opted in users)</p>
              </div>
            </Link>
          </li>
          <li className="home-tile">
            <Link style={{textDecoration: 'none'}} to="/social-manager">
              <div className='tile-content'>
                <h3>Socials</h3>
                <img 
                style={{width: '100%', height: 'auto'}}
                src={SocialsGif}/>
                <p className='home-tile-description'>Contact users using email. (Will only work with opted in users)</p>
              </div>
            </Link>
          </li>
          <li className="home-tile">
            <Link style={{textDecoration: 'none'}} to="/invoices">
              <div className='tile-content'>
                <h3>Invoices</h3>
                <img 
                style={{width: '100%', height: 'auto'}}
                src={InvoicesGif}/>
                <p className='home-tile-description'>Contact users using email. (Will only work with opted in users)</p>
              </div>
            </Link>
          </li>

        </ul>
      </div>
    </div>
  );
};

export default Home;
