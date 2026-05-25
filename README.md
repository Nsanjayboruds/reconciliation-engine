# Transaction Reconciliation Engine

This is a Node.js based application to reconcile transaction data between user records and exchange exports.

## Features
- Ingestion of messy CSV data, dynamically mapping headers
- Robust matching engine supporting timestamp and quantity tolerances
- Handles equivalent transaction types (e.g. TRANSFER IN <-> WITHDRAWAL)
- Stores data and results in MongoDB
- Exposes REST APIs for triggering runs and fetching reports

## Requirements
- Docker and Docker Compose
- Or Node.js and MongoDB running locally

## Setup

1. **Clone the repository** (if applicable)
2. **Run with Docker Compose** (Recommended):
   ```bash
   docker-compose up --build
   ```

## APIs

- `POST /reconcile`: Trigger reconciliation run
  - Form-data keys: `user_transactions` (file), `exchange_transactions` (file)
  - Optional Form-data fields: `timestampToleranceSeconds`, `quantityTolerancePct`

- `GET /report/:runId`: Fetch the full reconciliation report for a run.
- `GET /report/:runId/summary`: Fetch just the counts (matched, conflicting, unmatched).
- `GET /report/:runId/unmatched`: Fetch only unmatched rows with reasons.

## Key Decisions
- **Fuzzy Header Matching:** Since the assignment mentions the data is "intentionally made messy", the CSV ingestion logic searches for headers containing keywords like 'date', 'time', 'amount', 'qty', 'type', 'asset' rather than strictly relying on exact columns.
- **Type Aliasing & Opposites:** Implemented a matching service that treats 'TRANSFER IN' and 'DEPOSIT' as similar, and accounts for opposite actions when comparing user to exchange (e.g., User: TRANSFER OUT matches Exchange: TRANSFER IN).
- **Matching Priority:** The engine first attempts to match using a perfect ID match (if present). Then it checks for perfect alignment within tolerances. If tolerances are missed but a transaction seems identical otherwise, it flags it as "Conflicting".
- **Asynchronous Processing:** The POST `/reconcile` endpoint responds immediately with a 202 Accepted and a `runId`, processing the large CSV files and DB operations in the background.

## Architecture
- `Node.js + Express` for API
- `MongoDB + Mongoose` for Storage
- `fast-csv` for efficient CSV streaming
