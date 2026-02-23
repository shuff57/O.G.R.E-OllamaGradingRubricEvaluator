import { startPlayWriterCDPRelayServer } from 'playwriter/dist/cdp-relay.js';

console.log('Testing Playwriter CDP relay server startup...');

try {
  const server = await startPlayWriterCDPRelayServer({
    port: 19988,
    host: 'localhost',
    logger: {
      log: (...args) => console.log('[Playwriter]', ...args),
      error: (...args) => console.error('[Playwriter ERROR]', ...args)
    }
  });

  console.log('✓ CDP relay server started successfully!');
  console.log('Server object:', server);
  console.log('Listening on ws://localhost:19988/extension');

  // Keep running for 10 seconds
  await new Promise(resolve => setTimeout(resolve, 10000));

  console.log('Stopping server...');
  server.close();
  console.log('✓ Server stopped');
  process.exit(0);

} catch (error) {
  console.error('✗ Failed to start CDP relay server:');
  console.error('Error:', error);
  console.error('Stack:', error.stack);
  process.exit(1);
}
