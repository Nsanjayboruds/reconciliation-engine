const mongoose = require('mongoose');

const reconciliationRunSchema = new mongoose.Schema({
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  config: {
    timestampToleranceSeconds: { type: Number, default: 300 },
    quantityTolerancePct: { type: Number, default: 0.01 }
  },
  summary: {
    totalMatched: { type: Number, default: 0 },
    totalConflicting: { type: Number, default: 0 },
    totalUnmatchedUser: { type: Number, default: 0 },
    totalUnmatchedExchange: { type: Number, default: 0 }
  },
  error: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('ReconciliationRun', reconciliationRunSchema);
