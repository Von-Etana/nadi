/**
 * Nadi Digital Service - Database Models
 */

const User = require('./User');
const Wallet = require('./Wallet');
const Transaction = require('./Transaction');
const GiftCard = require('./GiftCard');
const { UserGiftCard } = require('./GiftCard');
const { LogisticsOrder, FuelOrder, Driver } = require('./Order');
const Notification = require('./Notification');
const { NotificationPreference } = require('./Notification');

module.exports = {
  User,
  Wallet,
  Transaction,
  GiftCard,
  UserGiftCard,
  LogisticsOrder,
  FuelOrder,
  Driver,
  Notification,
  NotificationPreference
};
