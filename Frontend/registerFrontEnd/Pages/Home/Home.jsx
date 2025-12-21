import React, { useState, useEffect } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Link } from 'react-router-dom'; 
import moment from 'moment';
import StoreGrid from '../../Pages/Store/StoreGrid';
import './Home.css';
import { registerApi } from '../../config/axios';

// Import images
import img1 from '../../assets/img1.webp';
import img2 from '../../assets/img2.webp';
import img3 from '../../assets/img3.webp';
import img4 from '../../assets/img4.webp';
import img5 from '../../assets/img5.webp';
import img6 from '../../assets/img6.webp';

import Logo from'../../assets/logo_light.webp';

// Import other components
import SocialLinks from '../../Components/navbar/socialLinks';
import CollageOverlay from './CollageOverlay';
import DancingScript from '../../assets/CarnivaleeFreakshow-DLrm.ttf'

const Home = () => {
  const [featuredProducts, setFeaturedProducts] = useState([]);                       
  const [upcomingEvent, setUpcomingEvent] = useState(null);
  const [fontLoaded, setFontLoaded] = useState(false)

  useEffect(() => {
    const loadFont = async () => {
      const font = new FontFace('Dancing Script', `url(${DancingScript})`)
      await font.load();
      document.fonts.add(font);
      setFontLoaded(true);
    }
    loadFont();
  }, []);

  useEffect(() => {
    const getFeaturedProducts = async () => {
      const products = await fetchFeaturedProducts();
      setFeaturedProducts(products);
    };

    const getUpcomingEvent = async () => {
      const event = await fetchUpcomingEvent();
      console.log('📦 Event received in Home.js:', event); // 👈 This should definitely log
      setUpcomingEvent(event);
    };

    getFeaturedProducts();
    getUpcomingEvent();
  }, []);

  const fetchFeaturedProducts = async () => {
    try {
      const response = await registerApi.get('/register-store/get-featured-products');
      return response.data;
    } catch (error) {
      console.error('Error fetching featured products:', error);
      return [];
    }
  };

  const fetchUpcomingEvent = async () => {
    try {
      const response = await registerApi.get('/register-events/get-events');
      console.log(response.data);
      return response.data;
      
    } catch (error) {
      console.error('Error fetching upcoming event:', error);
      return null;
    }
  };

  

  const fadeIn = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.8 } }
  };

  // Define collage items with custom positions, z-index, and parallax factors.
  const collageItems = [
    { src: img1, top: '10%', left: '5%', zIndex: 3, parallaxFactor: 0.5 },
    { src: img2, top: '20%', left: '40%', zIndex: 2, parallaxFactor: 1.3 },
    { src: img3, top: '50%', left: '10%', zIndex: 1, parallaxFactor: 1.6 },
    { src: img4, top: '60%', left: '60%', zIndex: 3, parallaxFactor: 1.9 },
    { src: img5, top: '30%', left: '80%', zIndex: 2, parallaxFactor: 2.2 },
    { src: img6, top: '70%', left: '30%', zIndex: 1, parallaxFactor: 2.5 },
  ];
  const titleStyle = {
    fontFamily: fontLoaded ? 'Dancing Script' : 'Arial, sans-serif', // ✅ Fallback to Arial until font loads
    fontSize: '3rem',
    color: 'white',
    textAlign: 'center',
    margin: '1rem 0',
  };

  return (
    <div className="home-container">
      
      {/* Hero Section */}
      
      <motion.section 
        className="hero-section"
        initial="hidden"
        animate="visible"
        variants={fadeIn}
      >
        <Link to='/store'>
        <div className="hero-content">

            <img src={Logo} alt="BakersBurns Logo" className="logo" style={{height:'30vh'}}/>
            

          <p className="hero-description">
            Handcrafted pyrography and wood-burned art — every product is a one-of-a-kind creation.
          </p>
          <Link to="/store" className="hero-btn">Shop Unique Art</Link>
        </div>
        </Link>

      </motion.section>
      

      {/* Collage Overlay 
      <CollageOverlay items={collageItems} />
*/}
      {/* Upcoming Event Section */}
      
      <motion.section 
        className="home-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={fadeIn}
      >
        <StoreGrid />
        
      </motion.section>

      {/* Get In Touch Section */}
      <motion.section 
        className="home-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={fadeIn}
      >
        <h2 className="home-title" >Get In Touch</h2>
        <p className="contact-description">
          For commissions, inquiries, or collaborations, feel free to contact me. Let's create something beautiful together!
        </p>
        <SocialLinks />
      </motion.section>
      {upcomingEvent && (
        <motion.section 
          className="upcoming-event-section"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, amount: 0.5 }}
          variants={fadeIn}
        >
          <motion.h2 className="upcoming-event-title">Upcoming Event</motion.h2>
          <h3 className="upcoming-event-name">{upcomingEvent.name}</h3>
          <p className="upcoming-event-date">
            {moment(upcomingEvent.date).format('MMMM Do, YYYY')}
            {upcomingEvent.startTime && ` at ${moment(upcomingEvent.startTime, 'HH:mm').format('h:mm A')}`}
          </p>
          <p className="upcoming-event-description">{upcomingEvent.description}</p>
          <Link to="/events" className="upcoming-event-btn">See All Events</Link>
        </motion.section>
      )}

      {/* About Section */}
      <motion.section 
        className="home-section"
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, amount: 0.2 }}
        variants={fadeIn}
      >
        <div className="about-content">
          <Link  to='/about'>
          <motion.h1 
            className="about-title"
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 1 }}
           
          >
            About the Artist
          </motion.h1>
          <p>
          Kalea is a passionate artist specializing in **burn designs on wood, felt, suede, leather, and hats**. Each piece is crafted with precision, bringing intricate and meaningful designs to life. Whether it's custom artwork for personal collections or unique branding for businesses, Kalea's work embodies craftsmanship and creativity
          </p>
          <Link to="/about" className="about-btn">Learn More</Link>
          </Link>
        </div>
      </motion.section>
    </div>
  );
};

export default Home;
