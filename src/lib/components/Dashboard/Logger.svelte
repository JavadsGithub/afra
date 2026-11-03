<script context="module" lang="ts">
    // Type definitions available to parent components
    export type LogLevel =
        | "info"
        | "warn"
        | "warning"
        | "error"
        | "debug"
        | string;

    export interface LogEntry {
        id: string;
        level: LogLevel;
        message: string;
        timestamp: Date;
    }
</script>

<script lang="ts">
    import { onMount } from "svelte";
    import { listen } from "@tauri-apps/api/event";

    // Import types
    export type { LogLevel, LogEntry };

    // Define properties
    export let logs: LogEntry[] = [];
    export let maxLogs: number = 100;
    export let maxHeight: string = "940px"; // Default max height

    // Scroll to bottom of logs when new logs are added
    let logContainer: HTMLElement | null = null;
    $: if (logs.length > 0 && logContainer) {
        logContainer.scrollTop = logContainer.scrollHeight;
    }

    // Listen for robot data events when component mounts
    onMount(async () => {
        // Listen for robot data received events
        const unlistenRobotData = await listen(
            "robot-data-received",
            (event) => {
                // Format the received data as a log entry
                const data = event.payload;
                const message = `Robot data received: ${JSON.stringify(data, null, 2)}`;
                addLog("info", message);
            },
        );

        // Listen for robot data errors
        const unlistenError = await listen("robot-data-error", (event) => {
            const message = `Robot data error: ${event.payload}`;
            addLog("error", message);
        });

        // Listen for command log events (to receive all backend logs automatically)
        const unlistenCommandLog = await listen("command-log", (event) => {
            const { level, message, timestamp } = event.payload;
            // Format the timestamp if available, otherwise use current time
            const formattedMessage = timestamp
                ? `[${new Date(timestamp * 1000).toLocaleString()}] ${message}`
                : message;
            addLog(level, formattedMessage);
        });

        // Return cleanup function to remove event listeners
        return () => {
            unlistenRobotData();
            unlistenError();
            unlistenCommandLog();
        };
    });

    // Add a new log entry
    export function addLog(
        level: LogLevel,
        message: string,
        timestamp: Date | string = new Date(),
    ): void {
        const newLog: LogEntry = {
            id: crypto.randomUUID
                ? crypto.randomUUID()
                : Date.now() + Math.random().toString(),
            level,
            message,
            timestamp:
                typeof timestamp === "string" ? new Date(timestamp) : timestamp,
        };

        // Add the new log
        logs = [...logs, newLog];

        // Maintain max log count
        if (logs.length > maxLogs) {
            logs = logs.slice(-maxLogs);
        }
    }

    // Clear all logs
    export function clearLogs(): void {
        logs = [];
    }

    // Format log level for display
    function getLevelClass(level: LogLevel): string {
        switch (level?.toLowerCase()) {
            case "error":
                return "log-error";
            case "warning":
            case "warn":
                return "log-warning";
            case "info":
                return "log-info";
            case "debug":
                return "log-debug";
            default:
                return "log-generic";
        }
    }

    // Format timestamp
    function formatTime(date: Date): string {
        return date.toLocaleTimeString();
    }

    // Log mocker functionality
    let mockIntervalId: number | null = null;

    // Sample log messages
    const sampleMessages = [
        "System initialized successfully",
        "Database connection established",
        "User authentication successful",
        "Warning: High memory usage detected",
        "Processing data batch #12345",
        "Cache cleared due to expiration",
        "Network latency above threshold",
        "Backup completed successfully",
        "Permission denied for resource access",
        "API rate limit approaching",
        "New device connected to network",
        "Configuration file updated",
        "Memory leak detected in module X",
        "Scheduled maintenance starting soon",
        "Service restarted after failure",
    ];

    // Sample log levels
    const logLevels: LogLevel[] = ["info", "warn", "error", "debug"];

    // Generate a random log entry
    function generateRandomLog(): { level: LogLevel; message: string } {
        const randomLevel =
            logLevels[Math.floor(Math.random() * logLevels.length)];
        const randomMessage =
            sampleMessages[Math.floor(Math.random() * sampleMessages.length)];
        return {
            level: randomLevel,
            message: randomMessage,
        };
    }

    // Start mocking logs at regular intervals
    export function startLogMocker(intervalMs: number = 1000): void {
        if (mockIntervalId !== null) {
            clearInterval(mockIntervalId);
        }

        // Add the first log immediately
        const { level, message } = generateRandomLog();
        addLog(level, message);

        // Then continue adding logs at the specified interval
        mockIntervalId = window.setInterval(() => {
            const { level, message } = generateRandomLog();
            addLog(level, message);
        }, intervalMs);
    }

    // Stop the log mocker
    export function stopLogMocker(): void {
        if (mockIntervalId !== null) {
            clearInterval(mockIntervalId);
            mockIntervalId = null;
        }
    }

    // Add multiple random logs at once
    export function addSampleLogs(count: number = 10): void {
        for (let i = 0; i < count; i++) {
            const { level, message } = generateRandomLog();
            addLog(level, message);
        }
    }
</script>

<div class="logger-container" style={`--maxHeight: ${maxHeight};`}>
    <div class="logger-header">
        <h3>لاگ های سیستم</h3>
        <!-- <div class="header-controls">
            <button
                type="button"
                class="mock-control-btn start-btn"
                on:click={() => startLogMocker(1000)}
                disabled={mockIntervalId !== null}
            >
                Start Mocking
            </button>
            <button
                type="button"
                class="mock-control-btn stop-btn"
                on:click={stopLogMocker}
                disabled={mockIntervalId === null}
            >
                Stop Mocking
            </button>
            <button
                type="button"
                class="mock-control-btn sample-btn"
                on:click={() => addSampleLogs(5)}
            >
                Add 5 Sample Logs
            </button>
            <button type="button" class="clear-btn" on:click={clearLogs}>
                Clear Logs
            </button>
        </div> -->
    </div>

    <div class="log-container" bind:this={logContainer}>
        {#if logs.length === 0}
            <div class="empty-state">No logs available</div>
        {:else}
            {#each logs as log (log.id)}
                <div class="log-entry">
                    <span class="log-timestamp"
                        >[{formatTime(log.timestamp)}]</span
                    >
                    <span class="log-level {getLevelClass(log.level)}"
                        >{log.level}</span
                    >
                    <span class="log-message">{log.message}</span>
                </div>
            {/each}
        {/if}
    </div>
</div>

<style>
    .logger-container {
        border: 1px solid #ddd;
        border-radius: 4px;
        height: 100%;
        max-height: var(
            --maxHeight,
            400px
        ); /* Use CSS variable with fallback */
        display: flex;
        flex-direction: column;
        background-color: #fff;
        overflow: hidden; /* Contain the scroll within the component */
    }

    .logger-header {
        padding: 12px;
        border-bottom: 1px solid #eee;
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        background-color: #f9f9f9;
        gap: 10px;
    }

    .logger-header h3 {
        margin: 0;
        font-size: 1rem;
        font-weight: 600;
    }

    .header-controls {
        display: flex;
        gap: 8px;
        width: 100%;
    }

    .clear-btn,
    .mock-control-btn {
        padding: 4px 8px;
        border: 1px solid #ccc;
        border-radius: 3px;
        cursor: pointer;
        font-size: 0.8rem;
        flex: 1;
        max-width: 120px;
    }

    .clear-btn {
        background-color: #e0e0e0;
    }

    .start-btn {
        background-color: #4caf50;
        color: white;
    }

    .start-btn:hover:not(:disabled) {
        background-color: #43a047;
    }

    .start-btn:disabled {
        background-color: #a5d6a7;
        cursor: not-allowed;
    }

    .stop-btn {
        background-color: #f44336;
        color: white;
    }

    .stop-btn:hover:not(:disabled) {
        background-color: #e53935;
    }

    .stop-btn:disabled {
        background-color: #ef9a9a;
        cursor: not-allowed;
    }

    .sample-btn {
        background-color: #2196f3;
        color: white;
    }

    .sample-btn:hover {
        background-color: #1e88e5;
    }

    .clear-btn:hover {
        background-color: #d0d0d0;
    }

    .log-container {
        flex: 1;
        overflow-y: auto;
        padding: 8px;
        font-family: monospace;
        font-size: 0.9rem;
        white-space: nowrap;
    }

    .empty-state {
        color: #999;
        text-align: center;
        padding: 20px;
        font-style: italic;
    }

    .log-entry {
        padding: 4px 0;
        border-bottom: 1px solid #f0f0f0;
        display: flex;
        gap: 8px;
    }

    .log-entry:last-child {
        border-bottom: none;
    }

    .log-timestamp {
        color: #666;
    }

    .log-level {
        font-weight: bold;
        text-transform: uppercase;
        min-width: 60px;
    }

    .log-error {
        color: #d32f2f;
    }

    .log-warning {
        color: #f57c00;
    }

    .log-info {
        color: #2e7d32;
    }

    .log-debug {
        color: #5c6bc0;
    }

    .log-generic {
        color: #666;
    }

    .log-message {
        flex: 1;
    }
</style>
