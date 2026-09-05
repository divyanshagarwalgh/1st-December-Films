-- Phase 4: record whether the FDF notification went out for each enquiry.
ALTER TABLE enquiries ADD COLUMN notified_at TEXT;
ALTER TABLE enquiries ADD COLUMN notify_error TEXT;
