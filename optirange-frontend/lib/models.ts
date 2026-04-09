import mongoose, { Schema, model, models } from 'mongoose';

const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  profilePic: { type: String }, // Base64 string for images
  createdAt: { type: Date, default: Date.now },
});

const EvDataSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
  make: { type: String },
  model: { type: String },
  batteryCapacity: { type: Number },
  currentCharge: { type: Number },
  rangeAtFull: { type: Number },
  carPic: { type: String }, // Base64 string for images
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
