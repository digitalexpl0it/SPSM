-- Extensions for time-series queries (optional but useful)
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Tables are also created by SQLAlchemy metadata on API startup.
-- reading_rollups and health_events support long-range charts and alert history.
