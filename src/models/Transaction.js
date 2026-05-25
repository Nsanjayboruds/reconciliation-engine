const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  runId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReconciliationRun', required: true },
  source: { type: String, enum: ['user', 'exchange'], required: true },
  originalRow: { type: Object, required: true }, // Store the raw CSV row
  status: { type: String, enum: ['valid', 'invalid'], default: 'valid' },
  reason: { type: String }, // For invalid rows or unmatched reasons
  
  // Parsed and normalized fields for matching
  normalizedTimestamp: { type: Date },
  normalizedQuantity: { type: Number },
  normalizedType: { type: String },
  normalizedAsset: { type: String },
  transactionId: { type: String }, // Optional, if provided in data
}, { timestamps: true });

transactionSchema.index({ runId: 1, source: 1 });

module.exports = mongoose.model('Transaction', transactionSchema);
