const mongoose = require('mongoose');

const reportEntrySchema = new mongoose.Schema({
  runId: { type: mongoose.Schema.Types.ObjectId, ref: 'ReconciliationRun', required: true },
  category: { 
    type: String, 
    enum: ['Matched', 'Conflicting', 'Unmatched (User only)', 'Unmatched (Exchange only)'],
    required: true
  },
  userRow: { type: Object }, // Raw row from user file
  exchangeRow: { type: Object }, // Raw row from exchange file
  reason: { type: String } // For conflicting or unmatched
}, { timestamps: true });

reportEntrySchema.index({ runId: 1, category: 1 });

module.exports = mongoose.model('ReportEntry', reportEntrySchema);
