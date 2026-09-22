# Evaluation Report

## Metadata

| Field | Value |
| --- | --- |
| Benchmark version | 1.0.0 |
| Split | held_out |
| Mode | local |
| Evaluated at | 2026-09-08T15:16:44.366Z |
| Provider | none |
| Model |  |
| Commit | 503326b |
| Node version | v22.18.0 |
| Case count | 30 |
| Model attempted | false |

## Primary metrics

| Metric | Value |
| --- | --- |
| Cases | 30 |
| Type accuracy | 0.600 |
| Severity accuracy | 0.600 |
| Critical recall | 1.000 |
| Critical true positives | 9 |
| Critical false negatives | 0 |
| Under-triage | 7 (0.233) |
| Over-triage | 5 (0.167) |
| Location accuracy | 1.000 (25 cases) |
| Threat accuracy | 1.000 (3 cases) |
| Latency p50 (ms) | 0.042 |
| Latency p95 (ms) | 5.219 |
| Fallback count | 0 |

## Language slices

| Language | Cases | Type accuracy | Severity accuracy | Critical recall |
| --- | --- | --- | --- | --- |
| en | 14 | 0.571 | 0.500 | 1.000 |
| hi | 6 | 0.500 | 0.667 | 1.000 |
| hinglish | 10 | 0.700 | 0.700 | 1.000 |

## Method counts

| Method | Cases |
| --- | --- |
| keyword | 30 |

## Exceptions

| Case ID | Exceptions |
| --- | --- |
| held-en-accident-01 | type_mismatch |
| held-en-fire-02 | severity_mismatch |
| held-en-medical-02 | severity_mismatch |
| held-en-crime-02 | type_mismatch, severity_mismatch |
| held-en-accident-02 | type_mismatch, severity_mismatch |
| held-en-fire-03 | severity_mismatch |
| held-en-medical-03 | type_mismatch, severity_mismatch |
| held-en-crime-03 | type_mismatch |
| held-en-accident-03 | type_mismatch, severity_mismatch |
| held-hi-civic-01 | type_mismatch |
| held-hi-crime-01 | severity_mismatch |
| held-hi-accident-01 | type_mismatch, severity_mismatch |
| held-hi-civic-02 | type_mismatch |
| held-hinglish-civic-01 | type_mismatch |
| held-hinglish-medical-02 | type_mismatch, severity_mismatch |
| held-hinglish-fire-02 | severity_mismatch |
| held-hinglish-accident-02 | type_mismatch, severity_mismatch |