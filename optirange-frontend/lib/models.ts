import mongoose, { Schema, model, models } from 'mongoose';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const EvDataSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },

  nickname: { type: String, default: '' }, // e.g. "Daily Driver", "Road Trip Car"
  make: { type: String },
  model: { type: String },
  batteryCapacity: { type: Number },
  currentCharge: { type: Number },
  rangeAtFull: { type: Number },
  carPic: { type: String },
  createdAt: { type: Date, default: Date.now },
});

const HealthDataSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  age: { type: Number },
  healthCondition: { type: String },
  preferredRestInterval: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

const TripSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  evId: { type: Schema.Types.ObjectId, ref: 'EvData' }, // which car was used
  startLocation: { type: String },
  endLocation: { type: String },
  distance: { type: Number },
  estimatedTime: { type: String },
  batteryUsed: { type: Number },
  chargingStops: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

export const User = models.User || model('User', UserSchema);
export const EvData = models.EvData || model('EvData', EvDataSchema);
export const HealthData = models.HealthData || model('HealthData', HealthDataSchema);
export const Trip = models.Trip || model('Trip', TripSchema);

// ── Saved Locations (Home, Work, Favourites) ──────────────────────────────────
const SavedLocationSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  label: { type: String, required: true },       // "Home", "Work", or custom name
  type: { type: String, default: 'favourite' }, // 'home' | 'work' | 'favourite'
  address: { type: String, required: true },
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
});

// ── Recent Searches ────────────────────────────────────────────────────────────
const RecentSearchSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  address: { type: String, required: true },
  lat: { type: Number, required: true },
  lon: { type: Number, required: true },
  usedAt: { type: Date, default: Date.now },
});

export const SavedLocation = models.SavedLocation || model('SavedLocation', SavedLocationSchema);
export const RecentSearch = models.RecentSearch || model('RecentSearch', RecentSearchSchema);