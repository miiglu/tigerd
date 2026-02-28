/*---------------------------------------------------------------------------------------------
 *  Copyright 2026 Miiglu Ltd. All rights reserved.
 *  Licensed under the MIT License.
 *--------------------------------------------------------------------------------------------*/

import { spawn, ChildProcess } from 'child_process';
import { join } from 'path';
import { ILogService } from '../../platform/log/common/log.js';

let agentProcess: ChildProcess | null = null;
let agentPort: number | null = null;

export interface TigerdAgentConfig {
	authToken?: string;
	cfAccountId?: string;
	cfApiToken?: string;
	cfGatewayId?: string;
}

export function getAgentPort(): number {
	return agentPort ?? 4096;
}

export function getAgentUrl(): string {
	return `http://localhost:${getAgentPort()}`;
}

export async function startTigerdAgent(
	logService: ILogService,
	config?: TigerdAgentConfig
): Promise<void> {
	if (agentProcess) {
		logService.info('[TigerdAgent] Agent already running');
		return;
	}

	// Check if running in development mode
	const isDev = process.env.VSCODE_DEV === '1' || process.env.VSCODE_CLI === '1';
	
	// Determine agent path based on mode
	// In dev: assume tigerd and tigerd-agent are siblings under miiglu
	// In prod: bundled in bin folder
	const agentDir = isDev
		? '/home/kazeem/miiglu/tigerd-agent/packages/opencode'
		: join(__dirname, '..', 'bin', 'tigerd-agent');
	
	logService.info('[TigerdAgent] Starting agent from:', agentDir, 'isDev:', isDev);

	// Build environment
	const env: NodeJS.ProcessEnv = {
		...process.env,
		// Override config to use free OpenZen model (big-pickle)
		// This prevents loading user's ~/.config/opencode/opencode.json
		OPENCODE_CONFIG_CONTENT: JSON.stringify({
			$schema: "https://opencode.ai/config.json",
			model: "opencode/big-pickle"
		}),
		// Cloudflare credentials - pass with correct environment variable names
		// tigerd-agent looks for CLOUDFLARE_* variables (not CF_*)
		...(config?.cfAccountId && { CLOUDFLARE_ACCOUNT_ID: config.cfAccountId }),
		// For Cloudflare Workers AI: uses CLOUDFLARE_API_KEY
		...(config?.cfApiToken && { CLOUDFLARE_API_KEY: config.cfApiToken }),
		// For Cloudflare AI Gateway: uses CLOUDFLARE_API_TOKEN
		...(config?.cfApiToken && { CLOUDFLARE_API_TOKEN: config.cfApiToken }),
		...(config?.cfGatewayId && { CLOUDFLARE_GATEWAY_ID: config.cfGatewayId }),
		// Auth token for backend validation
		...(config?.authToken && { TIGERD_TOKEN: config.authToken }),
	};

	if (isDev) {
		// Development: use bun to run serve command with random port (0)
		agentProcess = spawn('bun', ['./src/index.ts', 'serve', '--port', '0'], {
			cwd: agentDir,
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: false,
		});
	} else {
		// Packaged: use the binary directly with random port
		agentProcess = spawn(join(agentDir, 'tigerd-agent'), ['serve', '--port', '0'], {
			env,
			stdio: ['ignore', 'pipe', 'pipe'],
			detached: false,
		});
	}

	// Parse port from output
	let portFound = false;
	
	agentProcess.on('error', (err) => {
		logService.error('[TigerdAgent] Failed to start:', err);
		agentProcess = null;
	});

	agentProcess.on('exit', (code) => {
		logService.info('[TigerdAgent] Exited with code:', code);
		agentProcess = null;
		agentPort = null;
	});

	// Log stdout/stderr and extract port
	agentProcess.stdout?.on('data', (data) => {
		const output = data.toString().trim();
		logService.info('[TigerdAgent]', output);
		
		// Parse port from "listening on http://127.0.0.1:PORT" or "listening on http://localhost:PORT"
		const portMatch = output.match(/listening on .*:(\d+)/);
		if (portMatch && !portFound) {
			agentPort = parseInt(portMatch[1], 10);
			portFound = true;
			logService.info('[TigerdAgent] Got port from output:', agentPort);
		}
	});

	agentProcess.stderr?.on('data', (data) => {
		logService.error('[TigerdAgent]', data.toString().trim());
	});

	// Wait for port to be found
	let attempts = 0;
	while (!portFound && attempts < 20) {
		await new Promise(resolve => setTimeout(resolve, 250));
		attempts++;
	}
	
	if (!agentPort) {
		agentPort = 4096; // fallback
	}

	logService.info('[TigerdAgent] Started successfully on port', agentPort);
}

export function stopTigerdAgent(): void {
	if (agentProcess) {
		agentProcess.kill();
		agentProcess = null;
	}
}

export function isAgentRunning(): boolean {
	return agentProcess !== null;
}

export function setStoredAuthToken(token: string | null): void {
	storedAuthToken = token;
}

export function getStoredAuthToken(): string | null {
	return storedAuthToken;
}

// Token storage - declared early so functions can access it
let storedAuthToken: string | null = null;

export async function restartTigerdAgentWithCredentials(
	logService: ILogService,
	config: TigerdAgentConfig
): Promise<void> {
	logService.info('[TigerdAgent] Restarting with credentials:', { 
		hasAuthToken: !!config.authToken,
		hasCfAccountId: !!config.cfAccountId,
		hasCfApiToken: !!config.cfApiToken,
		hasCfGatewayId: !!config.cfGatewayId,
	});
	
	stopTigerdAgent();
	await startTigerdAgent(logService, config);
}

export function setAuthToken(token: string): void {
	// Update env of running agent if needed
	// For now, require restart to update token
}

export function clearAuthAndStopAgent(logService?: ILogService): void {
	// Clear stored token
	storedAuthToken = null;
	
	// Stop the agent
	if (agentProcess) {
		logService?.info('[TigerdAgent] Stopping agent due to logout');
		stopTigerdAgent();
	}
}

// Channel for communicating with renderer
import { IServerChannel } from '../../base/parts/ipc/common/ipc.js';

let currentAgentSessionId: string | null = null;

export class TigerdAgentChannel implements IServerChannel {
	constructor(private logService: ILogService) {}

	async call(_: unknown, command: string, params: any): Promise<any> {
		if (command === 'getAuthState') {
			// Return current auth state from main process memory
			return { isAuthenticated: storedAuthToken !== null, token: storedAuthToken };
		}
		if (command === 'getAgentState') {
			// Return agent state for renderer
			return { isRunning: isAgentRunning() };
		}
		if (command === 'getAgentSessionId') {
			// Return current agent session ID
			return currentAgentSessionId;
		}
		if (command === 'createAgentSession') {
			// Create new agent session via API
			try {
				const agentUrl = getAgentUrl();
				const workingDir = params.workingDir || process.cwd();
				const response = await fetch(`${agentUrl}/session`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'x-opencode-directory': workingDir,
					},
					body: JSON.stringify({
						directory: workingDir,
					}),
				});
				if (response.ok) {
					const session = await response.json();
					currentAgentSessionId = session.id;
					this.logService.info('[TigerdAgent] Created session:', session.id, 'with workingDir:', workingDir);
					return session.id;
				}
				this.logService.error('[TigerdAgent] Failed to create session:', response.status);
				return null;
			} catch (error) {
				this.logService.error('[TigerdAgent] Error creating session:', error);
				return null;
			}
		}
		if (command === 'abortAgentSession') {
			// Abort agent session via API
			try {
				const agentUrl = getAgentUrl();
				const sessionId = params.sessionId || currentAgentSessionId;
				const workingDir = params.workingDir || process.cwd();
				if (!sessionId) return false;
				const headers: Record<string, string> = { 'Content-Type': 'application/json' };
				if (workingDir) {
					headers['x-opencode-directory'] = workingDir;
				}
				const response = await fetch(`${agentUrl}/session/${sessionId}/abort`, {
					method: 'POST',
					headers,
				});
				if (response.ok) {
					this.logService.info('[TigerdAgent] Session aborted:', sessionId);
					return true;
				}
				return false;
			} catch (error) {
				this.logService.error('[TigerdAgent] Error aborting session:', error);
				return false;
			}
		}
		if (command === 'replyToQuestion') {
			// Reply to a question from the AI
			try {
				const agentUrl = getAgentUrl();
				const { requestId, answers } = params;
				if (!requestId) return false;
				const response = await fetch(`${agentUrl}/question/${requestId}/reply`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ answers }),
				});
				if (response.ok) {
					this.logService.info('[TigerdAgent] Question replied:', requestId);
					return true;
				}
				return false;
			} catch (error) {
				this.logService.error('[TigerdAgent] Error replying to question:', error);
				return false;
			}
		}
		if (command === 'rejectQuestion') {
			// Reject a question from the AI
			try {
				const agentUrl = getAgentUrl();
				const { requestId } = params;
				if (!requestId) return false;
				const response = await fetch(`${agentUrl}/question/${requestId}/reject`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
				});
				if (response.ok) {
					this.logService.info('[TigerdAgent] Question rejected:', requestId);
					return true;
				}
				return false;
			} catch (error) {
				this.logService.error('[TigerdAgent] Error rejecting question:', error);
				return false;
			}
		}
		if (command === 'respondToPermission') {
			// Respond to a permission request from the AI
			try {
				const agentUrl = getAgentUrl();
				const { requestId, reply } = params;
				if (!requestId) return false;
				// Response options: "once" | "always" | "reject"
				const response = await fetch(`${agentUrl}/permission/${requestId}/reply`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ reply }),
				});
				if (response.ok) {
					this.logService.info('[TigerdAgent] Permission responded:', requestId, 'reply:', reply);
					return true;
				}
				return false;
			} catch (error) {
				this.logService.error('[TigerdAgent] Error responding to permission:', error);
				return false;
			}
		}
		if (command === 'logout') {
			// Clear auth and stop agent
			clearAuthAndStopAgent(this.logService);
			return { success: true };
		}
		if (command === 'restartWithCredentials') {
			await restartTigerdAgentWithCredentials(this.logService, {
				authToken: params.authToken,
				cfAccountId: params.cfAccountId,
				cfApiToken: params.cfApiToken,
				cfGatewayId: params.cfGatewayId,
			});
			// Store token in memory for renderer to query
			storedAuthToken = params.authToken;
			return { success: true };
		}
		if (command === 'submitToken') {
			// Renderer submits token directly - we handle it here
			// This avoids CORS issues since main process makes the backend call
			try {
				const { app } = await import('electron');
				const fs = await import('fs');
				const path = await import('path');
				const token = params.token;
				const backendUrl = 'http://localhost:8787';

				// Call backend to get CF credentials
				const response = await fetch(`${backendUrl}/agent/config`, {
					headers: {
						'Authorization': `Bearer ${token}`,
						'Content-Type': 'application/json',
					},
				});

				if (!response.ok) {
					throw new Error(`Backend returned ${response.status}`);
				}

				const config = await response.json();
				this.logService.info('[Tigerd] Got CF credentials from backend');

				// Restart agent with credentials
				await restartTigerdAgentWithCredentials(this.logService, {
					authToken: token,
					cfAccountId: config.cfAccountId,
					cfApiToken: config.cfApiToken,
					cfGatewayId: config.cfGatewayId,
				});

				// Store token in memory for renderer to query
				storedAuthToken = token;

				// Save token to file for persistence
				const tokenPath = path.join(app.getPath('userData'), 'tigerd-auth.json');
				fs.writeFileSync(tokenPath, JSON.stringify({ token, email: config.email }));

				return { success: true, email: config.email, token };
			} catch (error) {
				this.logService.error('[Tigerd] submitToken failed:', error);
				return { success: false, error: String(error) };
			}
		}
		throw new Error(`Unknown command: ${command}`);
	}

	listen(): any {
		return undefined;
	}
}
