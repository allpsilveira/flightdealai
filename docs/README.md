# FlyLuxuryDeals — Documentation Index

All project documentation lives here. Organized by type; cross-linked by relative path.

## Architecture

| File | Description |
|------|-------------|
| [architecture/overview.md](architecture/overview.md) | System overview: data sources, intelligence engine, Airflow orchestration, delivery layer |
| [architecture/data-model.md](architecture/data-model.md) | Database tables, TimescaleDB hypertables, continuous aggregates, ER relationships |

## Reference

| File | Description |
|------|-------------|
| [reference/data-sources.md](reference/data-sources.md) | Per-integration details: auth, rate limits, request/response shape, known quirks, unused capabilities. Reviewed quarterly. |
| [reference/glossary.md](reference/glossary.md) | Domain terms, airport codes, loyalty program abbreviations, system jargon |
| [../SECURITY.md](../SECURITY.md) | Secret management, pre-commit hooks, API key rotation, architecture security notes |

## Decisions (ADRs)

| File | Description | Date |
|------|-------------|------|
| [decisions/0001-dynamic-scoring.md](decisions/0001-dynamic-scoring.md) | Why percentile/z-score scoring over static price thresholds | 2026-04-19 |
| [decisions/0002-api-stack.md](decisions/0002-api-stack.md) | Why SerpApi + Duffel + Seats.aero: evaluated 8 alternatives | 2026-04-19 |
| [decisions/0003-open-recommendations.md](decisions/0003-open-recommendations.md) | Prioritized inconsistencies, missing pieces, and tooling suggestions | 2026-04-19 |

## How-To

*No guides yet. Ask a recurring-task question and I'll save it here.*

## Troubleshooting

*No entries yet. Document issues and fixes here as they arise.*

---

## Conventions

- Every file has exactly one `# h1` title, then `##` / `###` below.
- A 2-sentence summary appears directly under the h1.
- ADR files carry `**Date:** YYYY-MM-DD` under the title.
- All code, SQL, and config is in fenced blocks with a language tag.
- Cross-links use relative paths: `[see data sources](../reference/data-sources.md)`.
- Files approaching 400 lines are split into siblings.
