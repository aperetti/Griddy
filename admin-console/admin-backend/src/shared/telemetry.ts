import fs from 'fs';
import path from 'path';
import { FastifyInstance } from 'fastify';

export function setupTelemetryWatcher(fastify: FastifyInstance) {
  const configPath = process.env.TELEMETRY_CONFIG_PATH || path.resolve(process.cwd(), '../../infra/telemetry_config.json');

  const updateLogLevel = () => {
    try {
      if (!fs.existsSync(configPath)) {
        fastify.log.warn(`Telemetry config file not found at ${configPath}`);
        return;
      }

      const content = fs.readFileSync(configPath, 'utf8');
      const config = JSON.parse(content);
      
      const globalLevel = config.global_level?.toLowerCase();
      const nodeConfig = config.services?.node_frontend; // Using node_frontend as proxy for admin-backend for now or adding node_backend
      const defaultLevel = nodeConfig?.default_level?.toLowerCase() || globalLevel;

      if (defaultLevel) {
        fastify.log.level = defaultLevel;
        fastify.log.info(`Updated log level to ${defaultLevel} from ${configPath}`);
      }
    } catch (err) {
      fastify.log.error(`Error updating log level from ${configPath}: ${err}`);
    }
  };

  // Initial load
  updateLogLevel();

  // Watch for changes
  if (fs.existsSync(configPath)) {
    fs.watch(configPath, (event) => {
      if (event === 'change') {
        fastify.log.info(`Telemetry config changed, reloading...`);
        updateLogLevel();
      }
    });
  }
}
