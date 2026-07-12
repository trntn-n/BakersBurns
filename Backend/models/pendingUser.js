const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const xss = require('xss'); // Import xss library

const PendingUsers = sequelize.define('PendingUsers', {
  userName: {
    type: DataTypes.STRING,
    allowNull: false
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false
  },
  phoneNumber: {
    type: DataTypes.STRING,
    allowNull: true
  },
  verificationToken: {
    type: DataTypes.STRING,
    allowNull: false
  },
  role: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'user', // Assign a default role if none is provided
  },
  isOptedInForPromotions: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  isOptedInForEmailUpdates: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  hasAcceptedPrivacyPolicy: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
},
privacyPolicyAcceptedAt: {
    type: DataTypes.DATE,
},
hasAcceptedTermsOfService: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
},
termsAcceptedAt: {
    type: DataTypes.DATE,
},
}, {
  hooks: {
    beforeValidate: (pendingUser) => {
      pendingUser.userName = xss(pendingUser.userName);
      pendingUser.email = xss(pendingUser.email);
      pendingUser.password = xss(pendingUser.password);
  
      pendingUser.phoneNumber = pendingUser.phoneNumber
        ? xss(pendingUser.phoneNumber)
        : null;
  
      pendingUser.verificationToken = xss(
        pendingUser.verificationToken
      );
  
      pendingUser.isOptedInForPromotions =
        pendingUser.isOptedInForPromotions === true;
  
      pendingUser.isOptedInForEmailUpdates =
        pendingUser.isOptedInForEmailUpdates === true;
    },
  },
});

module.exports = PendingUsers;
