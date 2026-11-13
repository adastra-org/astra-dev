// Entry point: `bun src/main.ts` (systemd unit astra-dev@<slot>, see deploy/).
import { createApp } from './app.ts'
import { buildDeps } from './boot.ts'
import { describeConfig, loadConfig } from './config.ts'
import { ConfigError } from './errors.ts'
import { createLogger } from './log.ts'

const logger = createLogger()

try {
  const config = loadConfig()
  if (config.production && process.env.ASTRA_DEV_VIEWER)
    logger.warn('dev_viewer_ignored', {
      reason: 'ASTRA_DEV_VIEWER is ignored when NODE_ENV=production',
    })

  const deps = await buildDeps(config, logger)
  const app = createApp(deps).listen({
    hostname: config.host,
    port: config.port,
    maxRequestBodySize:
      config.chat.maxBodyBytes + config.chat.maxStepsBytes + 4096,
  })
  logger.info('listening', {
    ...describeConfig(config),
    sha: deps.build.sha,
    version: deps.build.version,
  })

  const stop = () => {
    logger.info('stopping')
    deps.usage?.flush?.()
    void app.stop().finally(() => process.exit(0))
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
} catch (e) {
  if (e instanceof ConfigError)
    logger.error('config_invalid', { reason: e.message })
  else logger.error('boot_failed', { reason: (e as Error).message })
  process.exit(1)
}
