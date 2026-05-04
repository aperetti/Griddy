import sqlite3
import os
import asyncio
import logging
from typing import Dict, Any
from src.shared.database_setup import ADMIN_DB_PATH

logger = logging.getLogger(__name__)

class ConfigWatcher:
    """Polls a shared SQLite database for configuration overrides."""
    
    def __init__(self, db_path: str, poll_interval: int = 5):
        self.db_path = db_path
        self.poll_interval = poll_interval
        self.last_updated: Dict[str, str] = {}
        self.current_config: Dict[str, Any] = {}
        self._running = False

    async def start(self):
        self._running = True
        asyncio.create_task(self._watch_loop())
        logger.info(f"ConfigWatcher started, polling {self.db_path} every {self.poll_interval}s")

    def stop(self):
        self._running = False

    async def _watch_loop(self):
        while self._running:
            try:
                if os.path.exists(self.db_path):
                    self._check_for_updates()
                else:
                    logger.debug(f"Config DB not found at {self.db_path}")
            except Exception as e:
                logger.error(f"Error checking for config updates: {e}")
            
            await asyncio.sleep(self.poll_interval)

    def _check_for_updates(self):
        # Using a read-only connection
        conn = sqlite3.connect(f"file:{self.db_path}?mode=ro", uri=True)
        try:
            cursor = conn.cursor()
            # Ensure table exists (graceful failure if not yet created by admin console)
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='config_overrides'")
            if not cursor.fetchone():
                return

            cursor.execute("SELECT key, value, updated_at FROM config_overrides")
            rows = cursor.fetchall()
            
            updates = {}
            for key, value, updated_at in rows:
                if self.last_updated.get(key) != updated_at:
                    updates[key] = value
                    self.last_updated[key] = updated_at
            
            if updates:
                logger.info(f"Detected {len(updates)} config updates: {list(updates.keys())}")
                for key, value in updates.items():
                    self.current_config[key] = value
                    # Apply updates to environment or internal globals if needed
                    os.environ[key] = str(value)
                    
        finally:
            conn.close()

# Global watcher instance — path is resolved in database_setup to correctly
# locate admin-console/admin-backend/admin.sqlite in dev and /data/config in Docker.
_config_db_path = os.getenv("CONFIG_DB_PATH") or os.getenv("ADMIN_DB_PATH") or ADMIN_DB_PATH
watcher = ConfigWatcher(_config_db_path)
