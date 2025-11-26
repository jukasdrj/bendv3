# Deployment Guide

This document provides instructions for deploying and configuring the BooksTrack API worker.

## Cache Monitoring and Alerting

The application includes a cache monitoring and alerting system to proactively identify and report on cache performance issues.

### Configuration

The following environment variables in `wrangler.jsonc` control the monitoring and alerting feature:

- `MAILGUN_API_KEY`: Your Mailgun API key for sending email alerts.
- `MAILGUN_DOMAIN`: Your Mailgun domain.
- `SLACK_WEBHOOK_URL`: The URL for your Slack incoming webhook.
- `CACHE_ALERT_HIT_RATE_THRESHOLD_CRITICAL`: The critical threshold for the overall cache hit rate (default: 0.65).
- `CACHE_ALERT_HIT_RATE_THRESHOLD_WARNING`: The warning threshold for the overall cache hit rate (default: 0.70).
- `CACHE_ALERT_HOT_CACHE_THRESHOLD_CRITICAL`: The critical threshold for the hot cache hit rate (default: 0.80).
- `CACHE_ALERT_HOT_CACHE_THRESHOLD_WARNING`: The warning threshold for the hot cache hit rate (default: 0.85).
- `CACHE_ALERT_DROP_THRESHOLD_CRITICAL`: The critical threshold for a sudden drop in hit rate (default: 0.15).
- `CACHE_ALERT_DROP_THRESHOLD_WARNING`: The warning threshold for a sudden drop in hit rate (default: 0.10).

### Interpreting Alerts

The system generates alerts with the following severity levels:

- **Warning**: Indicates a potential issue that should be investigated.
- **Critical**: Indicates a significant problem that requires immediate attention.

Each alert includes the following information:

- **Metric**: The name of the metric that triggered the alert.
- **Threshold**: The configured threshold for the metric.
- **Actual Value**: The current value of the metric.
- **Action**: A recommended action to take to address the issue.
