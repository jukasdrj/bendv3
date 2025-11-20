/**
 * BooksTrack Harvest Dashboard
 * Fetches and displays monitoring data from API endpoints
 */

// Configuration
const API_BASE_URL = 'https://api.oooefam.net';
const REFRESH_INTERVAL = 30000; // 30 seconds
let autoRefreshEnabled = true;
let refreshTimer = null;

// Initialize dashboard on page load
document.addEventListener('DOMContentLoaded', () => {
    initializeDashboard();
    setupEventListeners();
    startAutoRefresh();
});

/**
 * Initialize dashboard by fetching all data
 */
async function initializeDashboard() {
    updateLastUpdatedTime();
    await Promise.all([
        fetchHealthData(),
        fetchMetricsData()
    ]);
}

/**
 * Set up event listeners for user interactions
 */
function setupEventListeners() {
    // Manual refresh button
    document.getElementById('refresh-btn').addEventListener('click', () => {
        initializeDashboard();
    });

    // Auto-refresh toggle
    document.getElementById('auto-refresh-toggle').addEventListener('change', (e) => {
        autoRefreshEnabled = e.target.checked;
        if (autoRefreshEnabled) {
            startAutoRefresh();
            updateAutoRefreshStatus('ON');
        } else {
            stopAutoRefresh();
            updateAutoRefreshStatus('OFF');
        }
    });
}

/**
 * Start auto-refresh timer
 */
function startAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
    }
    refreshTimer = setInterval(() => {
        if (autoRefreshEnabled) {
            initializeDashboard();
        }
    }, REFRESH_INTERVAL);
}

/**
 * Stop auto-refresh timer
 */
function stopAutoRefresh() {
    if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
}

/**
 * Update auto-refresh status display
 */
function updateAutoRefreshStatus(status) {
    const statusElement = document.getElementById('auto-refresh-status');
    statusElement.textContent = `Auto-refresh: ${status} (30s)`;
}

/**
 * Update last updated timestamp
 */
function updateLastUpdatedTime() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        second: '2-digit'
    });
    document.getElementById('last-updated').textContent = `Last updated: ${timeString}`;
}

/**
 * Fetch health endpoint data
 */
async function fetchHealthData() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!response.ok) {
            throw new Error(`Health check failed: ${response.status}`);
        }
        const data = await response.json();
        updateHealthDisplay(data);
    } catch (error) {
        console.error('Error fetching health data:', error);
        displayHealthError();
    }
}

/**
 * Fetch metrics endpoint data
 */
async function fetchMetricsData() {
    try {
        const response = await fetch(`${API_BASE_URL}/metrics`);
        if (!response.ok) {
            throw new Error(`Metrics fetch failed: ${response.status}`);
        }
        const data = await response.json();
        updateMetricsDisplay(data);
    } catch (error) {
        console.error('Error fetching metrics data:', error);
        displayMetricsError();
    }
}

/**
 * Update health section with data
 */
function updateHealthDisplay(data) {
    // Worker status
    const statusElement = document.getElementById('worker-status');
    statusElement.textContent = (data.status || 'unknown').toUpperCase();
    statusElement.className = 'card-value status-badge ' + 
        (data.status === 'ok' ? 'status-ok' : 'status-error');

    // Version and router
    document.getElementById('worker-version').textContent = `Version: ${data.version || '--'}`;
    document.getElementById('worker-router').textContent = `Router: ${data.router || '--'}`;
}

/**
 * Update metrics section with data
 */
function updateMetricsDisplay(data) {
    // Update request volume (estimate from volume data)
    if (data.volume) {
        const totalRequests = (data.volume.edge_hits || 0) + 
                            (data.volume.kv_hits || 0) + 
                            (data.volume.api_misses || 0);
        document.getElementById('request-count').textContent = formatNumber(totalRequests);
    }

    // Update error rate (if available)
    const errorRate = calculateErrorRate(data);
    const errorElement = document.getElementById('error-percentage');
    errorElement.textContent = `${errorRate.toFixed(2)}%`;
    errorElement.style.color = errorRate > 1 ? 'var(--accent-red)' : 'var(--accent-green)';

    // Update health status
    if (data.health) {
        const healthElement = document.getElementById('health-status-text');
        healthElement.textContent = (data.health.status || 'unknown').toUpperCase();
        healthElement.className = 'card-value status-badge status-' + 
            (data.health.status || 'unknown');

        // Display health issues
        const issuesElement = document.getElementById('health-issues');
        if (data.health.issues && data.health.issues.length > 0) {
            issuesElement.textContent = `${data.health.issues.length} issue(s) detected`;
        } else {
            issuesElement.textContent = 'No issues';
        }
    }

    // Update cache hit rates
    if (data.hitRates) {
        updateGauge('edge', data.hitRates.edge || 0, 80);
        updateGauge('kv', data.hitRates.kv || 0, 15);
        updateGauge('combined', data.hitRates.combined || 0, 95);
    }

    // Update cache breakdown table
    updateCacheBreakdown(data.volume || {});

    // Update latency metrics
    if (data.latency) {
        updateLatencyMetrics(data.latency);
    }

    // Update cost estimates
    if (data.costs) {
        updateCostBreakdown(data.costs);
    }
}

/**
 * Calculate error rate from metrics data
 */
function calculateErrorRate(data) {
    // This is a placeholder - adjust based on actual metrics structure
    if (data.volume) {
        const total = (data.volume.edge_hits || 0) + 
                     (data.volume.kv_hits || 0) + 
                     (data.volume.api_misses || 0);
        const errors = data.volume.errors || 0;
        return total > 0 ? (errors / total) * 100 : 0;
    }
    return 0;
}

/**
 * Update gauge display
 */
function updateGauge(type, value, target) {
    const fillElement = document.getElementById(`${type}-fill`);
    const textElement = document.getElementById(`${type}-text`);
    
    // Update percentage value
    textElement.textContent = `${value.toFixed(1)}%`;
    
    // Update gauge fill color based on target
    fillElement.style.setProperty('--percentage', value);
    
    // Set color based on performance vs target
    let color;
    if (value >= target) {
        color = 'var(--accent-green)';
    } else if (value >= target * 0.8) {
        color = 'var(--accent-yellow)';
    } else {
        color = 'var(--accent-red)';
    }
    
    fillElement.style.background = `conic-gradient(
        ${color} 0deg,
        ${color} ${value * 3.6}deg,
        var(--border-color) ${value * 3.6}deg,
        var(--border-color) 360deg
    )`;
}

/**
 * Update cache breakdown table
 */
function updateCacheBreakdown(volume) {
    const tbody = document.getElementById('cache-breakdown');
    const total = (volume.edge_hits || 0) + 
                  (volume.kv_hits || 0) + 
                  (volume.api_misses || 0);
    
    if (total === 0) {
        tbody.innerHTML = '<tr><td colspan="3" class="loading">No cache data available</td></tr>';
        return;
    }

    const rows = [
        { tier: 'Edge Cache', hits: volume.edge_hits || 0 },
        { tier: 'KV Cache', hits: volume.kv_hits || 0 },
        { tier: 'API Misses', hits: volume.api_misses || 0 },
        { tier: 'R2 Rehydrations', hits: volume.r2_rehydrations || 0 }
    ];

    tbody.innerHTML = rows.map(row => {
        const percentage = ((row.hits / total) * 100).toFixed(2);
        return `
            <tr>
                <td>${row.tier}</td>
                <td>${formatNumber(row.hits)}</td>
                <td>${percentage}%</td>
            </tr>
        `;
    }).join('');
}

/**
 * Update latency metrics
 */
function updateLatencyMetrics(latency) {
    document.getElementById('p50-latency').textContent = formatLatency(latency.p50);
    document.getElementById('p95-latency').textContent = formatLatency(latency.p95);
    document.getElementById('p99-latency').textContent = formatLatency(latency.p99);
}

/**
 * Update cost breakdown table
 */
function updateCostBreakdown(costs) {
    const tbody = document.getElementById('cost-breakdown');
    
    const costRows = [
        { service: 'KV Reads', usage: 'Calculated from hits', cost: costs.kv_reads_estimate || '--' },
        { service: 'R2 Reads', usage: 'Calculated from rehydrations', cost: costs.r2_reads || '--' },
        { service: 'Total', usage: 'Per period', cost: costs.total_estimate || '--' }
    ];

    tbody.innerHTML = costRows.map(row => `
        <tr>
            <td>${row.service}</td>
            <td>${row.usage}</td>
            <td>${row.cost}</td>
        </tr>
    `).join('');
}

/**
 * Display health error state
 */
function displayHealthError() {
    document.getElementById('worker-status').textContent = 'ERROR';
    document.getElementById('worker-status').className = 'card-value status-badge status-error';
    document.getElementById('worker-version').textContent = 'Version: --';
    document.getElementById('worker-router').textContent = 'Router: --';
}

/**
 * Display metrics error state
 */
function displayMetricsError() {
    document.getElementById('request-count').textContent = 'Error';
    document.getElementById('error-percentage').textContent = '--';
    document.getElementById('health-status-text').textContent = 'UNKNOWN';
    document.getElementById('health-status-text').className = 'card-value status-badge status-error';
}

/**
 * Format number with commas
 */
function formatNumber(num) {
    return num.toLocaleString('en-US');
}

/**
 * Format latency value
 */
function formatLatency(ms) {
    if (ms === undefined || ms === null) return '--';
    return `${ms.toFixed(0)}ms`;
}
