# ioBroker Adapter Development with GitHub Copilot

**Version:** 0.4.0
**Template Source:** https://github.com/DrozmotiX/ioBroker-Copilot-Instructions

This file contains instructions and best practices for GitHub Copilot when working on ioBroker adapter development.

## Project Context

You are working on an ioBroker adapter. ioBroker is an integration platform for the Internet of Things, focused on building smart home and industrial IoT solutions. Adapters are plugins that connect ioBroker to external systems, devices, or services.

## Adapter-Specific Context

**Adapter Name:** samsung_tizen  
**Primary Function:** Control Samsung TizenOS TVs (model year >= 2016) via WebSocket API  
**Target Devices:** Samsung Smart TVs running TizenOS  
**Key Dependencies:** WebSocket (`ws`), Wake-on-LAN (`wake_on_lan`), port reachability checking (`is-port-reachable`)  
**Configuration Requirements:**
- WebSocket connection (protocol: http/wss, IP address, port: 8001/8002)
- Authentication token for secure connections
- MAC address for Wake-on-LAN functionality
- Polling configuration for TV state monitoring
- Command delay settings for remote control sequences

**Unique Features:**
- Remote control key simulation (power, volume, channel, navigation)
- App management and launching
- Power state monitoring and Wake-on-LAN support
- Multi-command sequences with configurable delays
- TV discovery via port scanning

## Core Patterns

### Adapter Initialization
Always use the standard ioBroker adapter initialization pattern:
```javascript
const utils = require('@iobroker/adapter-core');

class AdapterName extends utils.Adapter {
    constructor(options = {}) {
        super({
            ...options,
            name: 'adapter-name',
        });
        this.on('ready', this.onReady.bind(this));
        this.on('stateChange', this.onStateChange.bind(this));
        this.on('unload', this.onUnload.bind(this));
    }

    async onReady() {
        this.setState('info.connection', false, true);
        // Initialization code here
    }

    onStateChange(id, state) {
        if (state) {
            this.log.info(`state ${id} changed: ${state.val} (ack = ${state.ack})`);
        } else {
            this.log.info(`state ${id} deleted`);
        }
    }

    onUnload(callback) {
        try {
            // Clean up resources here
            callback();
        } catch (e) {
            callback();
        }
    }
}

if (require.main !== module) {
    module.exports = (options) => new AdapterName(options);
} else {
    (() => new AdapterName())();
}
```

### WebSocket Connection Management
For Samsung Tizen TV connections:
```javascript
const WebSocket = require('ws');

async function connectToTV() {
    const wsUrl = `${this.config.protocol}://${this.config.ipAddress}:${this.config.port}/api/v2/channels/samsung.remote.control?name=${Buffer.from('ioBroker').toString('base64')}`;
    
    this.ws = new WebSocket(wsUrl, { rejectUnauthorized: false });
    
    this.ws.on('open', () => {
        this.log.info('WebSocket connection established');
        this.setState('info.connection', true, true);
    });
    
    this.ws.on('error', (error) => {
        this.log.error(`WebSocket error: ${error}`);
        this.setState('info.connection', false, true);
    });
    
    this.ws.on('message', (data) => {
        try {
            const message = JSON.parse(data);
            this.handleTVMessage(message);
        } catch (error) {
            this.log.error(`Error parsing message: ${error}`);
        }
    });
}
```

### State Management
Always create states with proper configuration:
```javascript
await this.setObjectNotExistsAsync('control.power', {
    type: 'state',
    common: {
        name: 'Power control',
        type: 'boolean',
        role: 'button',
        read: true,
        write: true
    },
    native: {}
});
```

### Command Sending with Delay
For Samsung TV remote control:
```javascript
async function sendCommand(key) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        this.log.warn('WebSocket not connected');
        return;
    }
    
    const message = {
        method: 'ms.remote.control',
        params: {
            Cmd: 'Click',
            DataOfCmd: key,
            Option: false,
            TypeOfRemote: 'SendRemoteKey'
        }
    };
    
    this.ws.send(JSON.stringify(message));
    
    if (this.config.cmdDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, this.config.cmdDelay));
    }
}
```

## State Management

### Connection States
Always maintain connection status:
```javascript
this.setState('info.connection', connected, true);
```

### Dynamic State Creation
For Samsung Tizen adapter, create states for remote keys:
```javascript
const remoteKeys = ['KEY_POWER', 'KEY_VOLUP', 'KEY_VOLDOWN', 'KEY_MUTE'];
for (const key of remoteKeys) {
    await this.setObjectNotExistsAsync(`control.${key}`, {
        type: 'state',
        common: {
            name: key.replace('KEY_', ''),
            type: 'boolean',
            role: 'button',
            read: true,
            write: true
        },
        native: {}
    });
}
```

## Error Handling

### WebSocket Error Management
```javascript
this.ws.on('error', (error) => {
    this.log.error(`WebSocket connection failed: ${error.message}`);
    this.setState('info.connection', false, true);
    
    // Implement reconnection logic
    if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => this.connectToTV(), 30000);
});
```

### Network Error Handling
For port reachability checks:
```javascript
const isPortReachable = require('is-port-reachable');

async function checkTVAvailability() {
    try {
        const reachable = await isPortReachable(this.config.port, { host: this.config.ipAddress });
        if (!reachable) {
            this.log.warn(`TV not reachable on ${this.config.ipAddress}:${this.config.port}`);
            this.setState('info.connection', false, true);
            return false;
        }
        return true;
    } catch (error) {
        this.log.error(`Error checking TV availability: ${error.message}`);
        return false;
    }
}
```

## Logging

Use appropriate log levels:
- `this.log.error()` - For critical errors that prevent functionality
- `this.log.warn()` - For recoverable issues or unexpected situations  
- `this.log.info()` - For important state changes and connection events
- `this.log.debug()` - For detailed debugging information (only when debug enabled)

### Samsung Tizen Specific Logging
```javascript
// Connection events
this.log.info(`Connecting to Samsung TV at ${this.config.ipAddress}:${this.config.port}`);

// Command execution
this.log.debug(`Sending remote key: ${key}`);

// Error conditions
this.log.warn(`TV not responding, attempting reconnection in 30 seconds`);
```

## Configuration Handling

### Validation for Samsung Tizen
```javascript
onReady() {
    if (!this.config.ipAddress) {
        this.log.error('IP address not configured');
        return;
    }
    
    if (!this.config.port || (this.config.port !== '8001' && this.config.port !== '8002')) {
        this.log.warn('Port should be 8001 (HTTP) or 8002 (HTTPS/WSS)');
    }
    
    if (this.config.protocol === 'wss' && this.config.port === '8001') {
        this.log.warn('WSS protocol typically uses port 8002');
    }
    
    this.main();
}
```

## Resource Cleanup

### Proper Unload Implementation
```javascript
onUnload(callback) {
    try {
        // Clear timers
        if (this.reconnectTimer) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
        
        if (this.pollingTimer) {
            clearInterval(this.pollingTimer);
            this.pollingTimer = null;
        }
        
        // Close WebSocket connection
        if (this.ws) {
            this.ws.removeAllListeners();
            if (this.ws.readyState === WebSocket.OPEN) {
                this.ws.close();
            }
            this.ws = null;
        }
        
        this.log.info('Adapter stopped');
        callback();
    } catch (error) {
        this.log.error(`Error during unload: ${error}`);
        callback();
    }
}
```

## Testing

### Unit Testing
- Use Jest as the primary testing framework for ioBroker adapters
- Create tests for all adapter main functions and helper methods
- Test error handling scenarios and edge cases
- Mock external API calls and hardware dependencies
- For adapters connecting to APIs/devices not reachable by internet, provide example data files to allow testing of functionality without live connections
- Example test structure:
  ```javascript
  describe('AdapterName', () => {
    let adapter;
    
    beforeEach(() => {
      // Setup test adapter instance
    });
    
    test('should initialize correctly', () => {
      // Test adapter initialization
    });
  });
  ```

### Integration Testing

**IMPORTANT**: Use the official `@iobroker/testing` framework for all integration tests. This is the ONLY correct way to test ioBroker adapters.

**Official Documentation**: https://github.com/ioBroker/testing

#### Framework Structure
Integration tests MUST follow this exact pattern:

```javascript
const path = require('path');
const { tests } = require('@iobroker/testing');

// Define test coordinates or configuration
const TEST_COORDINATES = '52.520008,13.404954'; // Berlin
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

// Use tests.integration() with defineAdditionalTests
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Test adapter with specific configuration', (getHarness) => {
            let harness;

            before(() => {
                harness = getHarness();
            });

            it('should configure and start adapter', function () {
                return new Promise(async (resolve, reject) => {
                    try {
                        harness = getHarness();
                        
                        // Get adapter object using promisified pattern
                        const obj = await new Promise((res, rej) => {
                            harness.objects.getObject('system.adapter.your-adapter.0', (err, o) => {
                                if (err) return rej(err);
                                res(o);
                            });
                        });
                        
                        if (!obj) {
                            return reject(new Error('Adapter object not found'));
                        }

                        // Configure adapter properties
                        Object.assign(obj.native, {
                            position: TEST_COORDINATES,
                            createCurrently: true,
                            createHourly: true,
                            createDaily: true,
                            // Add other configuration as needed
                        });

                        // Set the updated configuration
                        harness.objects.setObject(obj._id, obj);

                        console.log('✅ Step 1: Configuration written, starting adapter...');
                        
                        // Start adapter and wait
                        await harness.startAdapterAndWait();
                        
                        console.log('✅ Step 2: Adapter started');

                        // Wait for adapter to process data
                        const waitMs = 15000;
                        await wait(waitMs);

                        console.log('🔍 Step 3: Checking states after adapter run...');
                        
                        // Check that states were created properly
                        const states = await harness.states.getKeysAsync('your-adapter.0.*');
                        expect(states.length).toBeGreaterThan(0);

                        resolve();
                    } catch (error) {
                        console.error('❌ Test failed with error:', error);
                        reject(error);
                    }
                });
            }).timeout(60000);
        });
    }
});
```

#### Key Testing Framework Rules

1. **Always use `tests.integration()`** - Never create manual test harnesses
2. **Use `defineAdditionalTests`** - For custom test scenarios
3. **Proper harness access** - Always call `getHarness()` within test functions
4. **Promisified patterns** - Use proper async/await with callback-based harness methods
5. **State verification** - Always check that expected states are created
6. **Timeout management** - Set appropriate timeouts for slow operations
7. **Error handling** - Wrap test logic in try-catch blocks

#### Samsung Tizen Specific Integration Tests
```javascript
tests.integration(path.join(__dirname, '..'), {
    defineAdditionalTests({ suite }) {
        suite('Samsung Tizen TV Integration', (getHarness) => {
            it('should create remote control states', async function () {
                const harness = getHarness();
                
                // Configure with mock TV settings
                await harness.changeAdapterConfig('samsung_tizen', {
                    native: {
                        ipAddress: '192.168.1.100',
                        port: '8002',
                        protocol: 'wss',
                        token: 'test-token'
                    }
                });
                
                await harness.startAdapterAndWait();
                await new Promise(resolve => setTimeout(resolve, 5000));
                
                // Check that remote control states were created
                const controlStates = await harness.states.getKeysAsync('samsung_tizen.0.control.*');
                expect(controlStates.length).toBeGreaterThan(0);
                
                // Verify specific control states
                const powerState = await harness.objects.getObjectAsync('samsung_tizen.0.control.KEY_POWER');
                expect(powerState).toBeDefined();
                expect(powerState.common.role).toBe('button');
            }).timeout(30000);
        });
    }
});
```

#### Mock Data for Offline Testing
For Samsung TV API responses, create mock data files:
```javascript
// test/fixtures/tv-responses.js
module.exports = {
    tokenResponse: {
        event: 'ms.channel.connect',
        data: { token: 'mock-token-12345' }
    },
    appListResponse: {
        event: 'ed.installedApp.get',
        data: [
            { appId: 'netflix', name: 'Netflix' },
            { appId: 'youtube', name: 'YouTube' }
        ]
    }
};
```

## Code Style and Standards

- Follow JavaScript/TypeScript best practices
- Use async/await for asynchronous operations
- Implement proper resource cleanup in `unload()` method
- Use semantic versioning for adapter releases
- Include proper JSDoc comments for public methods

## CI/CD and Testing Integration

### GitHub Actions for API Testing
For adapters with external API dependencies, implement separate CI/CD jobs:

```yaml
# Tests API connectivity with demo credentials (runs separately)
demo-api-tests:
  if: contains(github.event.head_commit.message, '[skip ci]') == false
  
  runs-on: ubuntu-22.04
  
  steps:
    - name: Checkout code
      uses: actions/checkout@v4
      
    - name: Use Node.js 20.x
      uses: actions/setup-node@v4
      with:
        node-version: 20.x
        cache: 'npm'
        
    - name: Install dependencies
      run: npm ci
      
    - name: Run demo API tests
      run: npm run test:integration-demo
```

### CI/CD Best Practices
- Run credential tests separately from main test suite
- Use ubuntu-22.04 for consistency
- Don't make credential tests required for deployment
- Provide clear failure messages for API connectivity issues
- Use appropriate timeouts for external API calls (120+ seconds)

### Package.json Script Integration
Add dedicated script for credential testing:
```json
{
  "scripts": {
    "test:integration-demo": "mocha test/integration-demo --exit"
  }
}
```

### Practical Example: Complete API Testing Implementation
Here's a complete example based on lessons learned from the Discovergy adapter:

#### test/integration-demo.js
```javascript
const path = require("path");
const { tests } = require("@iobroker/testing");

// Helper function to encrypt password using ioBroker's encryption method
async function encryptPassword(harness, password) {
    const systemConfig = await harness.objects.getObjectAsync("system.config");
    
    if (!systemConfig || !systemConfig.native || !systemConfig.native.secret) {
        throw new Error("Could not retrieve system secret for password encryption");
    }
    
    const secret = systemConfig.native.secret;
    let result = '';
    for (let i = 0; i < password.length; ++i) {
        result += String.fromCharCode(secret[i % secret.length].charCodeAt(0) ^ password.charCodeAt(i));
    }
    
    return result;
}

// Run integration tests with demo credentials
tests.integration(path.join(__dirname, ".."), {
    defineAdditionalTests({ suite }) {
        suite("API Testing with Demo Credentials", (getHarness) => {
            let harness;
            
            before(() => {
                harness = getHarness();
            });

            it("Should connect to API and initialize with demo credentials", async () => {
                console.log("Setting up demo credentials...");
                
                if (harness.isAdapterRunning()) {
                    await harness.stopAdapter();
                }
                
                const encryptedPassword = await encryptPassword(harness, "demo_password");
                
                await harness.changeAdapterConfig("your-adapter", {
                    native: {
                        username: "demo@provider.com",
                        password: encryptedPassword,
                        // other config options
                    }
                });

                console.log("Starting adapter with demo credentials...");
                await harness.startAdapter();
                
                // Wait for API calls and initialization
                await new Promise(resolve => setTimeout(resolve, 60000));
                
                const connectionState = await harness.states.getStateAsync("your-adapter.0.info.connection");
                
                if (connectionState && connectionState.val === true) {
                    console.log("✅ SUCCESS: API connection established");
                    return true;
                } else {
                    throw new Error("API Test Failed: Expected API connection to be established with demo credentials. " +
                        "Check logs above for specific API errors (DNS resolution, 401 Unauthorized, network issues, etc.)");
                }
            }).timeout(120000);
        });
    }
});
```

## Wake-on-LAN Implementation
For Samsung TVs with WOL support:
```javascript
const wol = require('wake_on_lan');

async function wakeUpTV() {
    if (!this.config.macAddress || this.config.macAddress === '0') {
        this.log.warn('MAC address not configured, Wake-on-LAN not available');
        return false;
    }
    
    try {
        await new Promise((resolve, reject) => {
            wol.wake(this.config.macAddress, (error) => {
                if (error) {
                    reject(error);
                } else {
                    resolve();
                }
            });
        });
        
        this.log.info(`Wake-on-LAN packet sent to ${this.config.macAddress}`);
        return true;
    } catch (error) {
        this.log.error(`Wake-on-LAN failed: ${error.message}`);
        return false;
    }
}
```

## Power State Monitoring
For Samsung TV polling:
```javascript
async function startPolling() {
    if (!this.config.pollingInterval || this.config.pollingInterval === '0') {
        this.log.debug('Polling disabled');
        return;
    }
    
    const interval = parseInt(this.config.pollingInterval) * 1000;
    this.pollingTimer = setInterval(async () => {
        await this.checkPowerState();
    }, interval);
    
    this.log.info(`Power state polling started with ${this.config.pollingInterval}s interval`);
}

async function checkPowerState() {
    try {
        const reachable = await isPortReachable(this.config.pollingPort, { 
            host: this.config.ipAddress,
            timeout: 5000
        });
        
        const currentState = reachable;
        const lastState = await this.getStateAsync('info.power');
        
        if (!lastState || lastState.val !== currentState) {
            await this.setStateAsync('info.power', currentState, true);
            this.log.info(`TV power state changed to: ${currentState ? 'ON' : 'OFF'}`);
        }
    } catch (error) {
        this.log.debug(`Power state check failed: ${error.message}`);
        await this.setStateAsync('info.power', false, true);
    }
}
```